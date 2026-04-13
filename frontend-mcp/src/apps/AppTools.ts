import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  BridgeSessionInfo,
  PreviewCellEditRequest,
  ReadCellOutputsResult,
  fail,
} from "../../../packages/protocol/src";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { BridgeDiscovery } from "../bridge/BridgeDiscovery";
import { NotebookBridgeClient } from "../bridge/NotebookBridgeClient";
import { NotebookToolResultRenderer } from "../mcp/NotebookToolResultRenderer";
import { ToolRequestExtra } from "../mcp/SessionSelection";
import {
  BridgeSessionSummary,
  CellEditReviewViewPayload,
  CellOutputPreviewViewPayload,
  ExecutionMonitorViewPayload,
  NOTEBOOK_APP_RESOURCE_URI,
  NotebookAppViewPayload,
  NotebookTriageViewPayload,
  SessionChooserViewPayload,
} from "./AppTypes";

const sessionSelectionInputSchema = z
  .object({
    session_id: z.string().nullable().optional(),
  })
  .passthrough();

const executionMonitorInputSchema = z
  .object({
    execution_id: z.string(),
  })
  .passthrough();

const notebookScopeInputSchema = z
  .object({
    notebook_uri: z.string(),
    range: z
      .object({
        start: z.number().int(),
        end: z.number().int(),
      })
      .optional(),
    cell_ids: z.array(z.string()).optional(),
    query: z.string().optional(),
  })
  .passthrough();

const cellOutputPreviewInputSchema = z
  .object({
    notebook_uri: z.string(),
    cell_id: z.string(),
    output_index: z.number().int().nonnegative().optional(),
  })
  .passthrough();

const previewCellEditInputSchema = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("replace_cell_source"),
      notebook_uri: z.string(),
      cell_id: z.string(),
      source: z.string(),
      expected_notebook_version: z.number().int().optional(),
      expected_cell_source_fingerprint: z.string().optional(),
    })
    .passthrough(),
  z
    .object({
      operation: z.literal("patch_cell_source"),
      notebook_uri: z.string(),
      cell_id: z.string(),
      patch: z.string(),
      format: z.enum(["auto", "unified_diff", "codex_apply_patch", "search_replace_json"]).optional(),
      expected_notebook_version: z.number().int().optional(),
      expected_cell_source_fingerprint: z.string().optional(),
    })
    .passthrough(),
]);

export class AppTools {
  private readonly renderer = new NotebookToolResultRenderer();

  public constructor(
    private readonly getClient: (extra: ToolRequestExtra) => Promise<NotebookBridgeClient>,
    private readonly discovery: BridgeDiscovery,
    private readonly log?: (message: string) => void,
  ) {}

  public async register(server: McpServer, options?: { enableApps?: boolean }): Promise<void> {
    server.registerTool(
      "list_bridge_sessions",
      {
        title: "List Bridge Sessions",
        description: "List active Jupyter Agentic Bridge sessions and the currently pinned session, if any.",
        inputSchema: z.object({}).passthrough(),
        outputSchema: z
          .object({
            sessions: z.array(
              z
                .object({
                  session_id: z.string(),
                  workspace_id: z.string().nullable(),
                  workspace_folders: z.array(z.string()),
                  window_title: z.string(),
                  bridge_url: z.string(),
                  created_at: z.string(),
                  last_seen_at: z.string(),
                })
                .passthrough(),
            ),
            pinned_session_id: z.string().nullable(),
          })
          .passthrough(),
      },
      async () => this.runTool("list_bridge_sessions", async () => this.listBridgeSessions()),
    );

    server.registerTool(
      "select_bridge_session",
      {
        title: "Select Bridge Session",
        description: "Pin or clear the bridge session used by frontend-mcp for later notebook tool calls.",
        inputSchema: sessionSelectionInputSchema,
        outputSchema: z
          .object({
            pinned_session_id: z.string().nullable(),
            selected_session: z
              .object({
                session_id: z.string(),
                workspace_id: z.string().nullable(),
                workspace_folders: z.array(z.string()),
                window_title: z.string(),
                bridge_url: z.string(),
                created_at: z.string(),
                last_seen_at: z.string(),
              })
              .passthrough()
              .nullable(),
          })
          .passthrough(),
      },
      async (input) =>
        this.runTool("select_bridge_session", async () =>
          this.selectBridgeSession(sessionSelectionInputSchema.parse(input).session_id ?? null),
        ),
    );

    server.registerTool(
      "preview_cell_edit",
      {
        title: "Preview Cell Edit",
        description: "Preview a replace_cell_source or patch_cell_source edit without mutating the notebook.",
        inputSchema: previewCellEditInputSchema,
        outputSchema: z
          .object({
            notebook_uri: z.string(),
            notebook_version: z.number().int(),
            cell_id: z.string(),
            operation: z.enum(["replace_cell_source", "patch_cell_source"]),
            current_source: z.string(),
            proposed_source: z.string(),
            before_source_fingerprint: z.string(),
            after_source_fingerprint: z.string(),
            diff_unified: z.string(),
            applied_patch_format: z.enum(["unified_diff", "codex_apply_patch", "search_replace_json"]).optional(),
          })
          .passthrough(),
      },
      async (input, extra) =>
        this.runTool("preview_cell_edit", async () =>
          this.requirePreviewClient(await this.getClient(extra)).previewCellEdit(
            previewCellEditInputSchema.parse(input) as PreviewCellEditRequest,
          ),
        ),
    );

    server.registerTool(
      "export_cell_output_snapshot",
      {
        title: "Export Cell Output Snapshot",
        description: "Write the current normalized outputs for one cell to an ephemeral temp file and return the path.",
        inputSchema: cellOutputPreviewInputSchema,
        outputSchema: z
          .object({
            output_file_path: z.string(),
            bytes_written: z.number().int(),
            notebook_uri: z.string(),
            cell_id: z.string(),
            output_index: z.number().int().nonnegative().optional(),
          })
          .passthrough(),
      },
      async (input, extra) =>
        this.runTool("export_cell_output_snapshot", async () =>
          this.exportCellOutputSnapshot(cellOutputPreviewInputSchema.parse(input), extra),
        ),
    );

    if (!options?.enableApps) {
      return;
    }

    let registerAppToolUnsafe: (...args: unknown[]) => unknown;
    try {
      const ext = await import("@modelcontextprotocol/ext-apps/server");
      registerAppToolUnsafe = ext.registerAppTool as (...args: unknown[]) => unknown;
    } catch {
      this.log?.("ext-apps import failed, skipping app launcher registration");
      return;
    }

    this.registerAppLauncher(
      server,
      registerAppToolUnsafe,
      "open_bridge_session_chooser",
      {
        title: "Open Bridge Session Chooser",
        description: "Open an MCP App to choose the active VS Code bridge session when more than one is available.",
        inputSchema: z.object({}).passthrough(),
      },
      async () =>
        this.toAppToolResult(
          "Interactive bridge session chooser opened.",
          await this.buildSessionChooserPayload(),
        ),
    );

    this.registerAppLauncher(
      server,
      registerAppToolUnsafe,
      "open_cell_edit_review",
      {
        title: "Open Cell Edit Review",
        description: "Open an MCP App to review a replace or patch cell change before applying it.",
        inputSchema: previewCellEditInputSchema,
      },
      async (input, extra) =>
        this.toAppToolResult(
          "Interactive cell edit review opened.",
          await this.buildCellEditReviewPayload(previewCellEditInputSchema.parse(input) as PreviewCellEditRequest, extra),
        ),
    );

    this.registerAppLauncher(
      server,
      registerAppToolUnsafe,
      "open_execution_monitor",
      {
        title: "Open Execution Monitor",
        description: "Open an MCP App to monitor async notebook execution and related kernel controls.",
        inputSchema: executionMonitorInputSchema,
      },
      async (input, extra) =>
        this.toAppToolResult(
          "Interactive execution monitor opened.",
          await this.buildExecutionMonitorPayload(executionMonitorInputSchema.parse(input).execution_id, extra),
        ),
    );

    this.registerAppLauncher(
      server,
      registerAppToolUnsafe,
      "open_notebook_triage",
      {
        title: "Open Notebook Triage",
        description: "Open an MCP App that combines diagnostics, search, symbols, and navigation for one notebook.",
        inputSchema: notebookScopeInputSchema,
      },
      async (input, extra) =>
        this.toAppToolResult(
          "Interactive notebook triage opened.",
          await this.buildNotebookTriagePayload(notebookScopeInputSchema.parse(input), extra),
        ),
    );

    this.registerAppLauncher(
      server,
      registerAppToolUnsafe,
      "open_cell_output_preview",
      {
        title: "Open Cell Output Preview",
        description: "Open an MCP App to inspect normalized outputs for one notebook cell and jump to the live notebook output.",
        inputSchema: cellOutputPreviewInputSchema,
      },
      async (input, extra) =>
        this.toAppToolResult(
          "Interactive cell output preview opened.",
          await this.buildCellOutputPreviewPayload(cellOutputPreviewInputSchema.parse(input), extra),
        ),
    );
  }

  private registerAppLauncher(
    server: McpServer,
    registerAppTool: (...args: unknown[]) => unknown,
    name: string,
    definition: {
      title: string;
      description: string;
      inputSchema: z.ZodTypeAny;
    },
    handler: (input: unknown, extra: ToolRequestExtra) => Promise<CallToolResult>,
  ): void {
    registerAppTool(
      server,
      name,
      {
        title: definition.title,
        description: definition.description,
        inputSchema: definition.inputSchema,
        _meta: {
          ui: {
            resourceUri: NOTEBOOK_APP_RESOURCE_URI,
          },
        },
      },
      handler,
    );
  }

  private async listBridgeSessions() {
    return {
      sessions: (await this.discovery.listSessions()).map((session) => this.toSessionSummary(session)),
      pinned_session_id: this.discovery.getPinnedSessionId(),
    };
  }

  private async selectBridgeSession(sessionId: string | null) {
    if (!sessionId) {
      this.discovery.setPinnedSession(null);
      return {
        pinned_session_id: null,
        selected_session: null,
      };
    }

    const sessions = await this.discovery.listSessions();
    const selected = sessions.find((session) => session.session_id === sessionId);
    if (!selected) {
      fail({
        code: "AmbiguousSession",
        message: `Requested session was not found: ${sessionId}`,
        recoverable: true,
      });
    }

    this.discovery.setPinnedSession(sessionId);
    return {
      pinned_session_id: sessionId,
      selected_session: this.toSessionSummary(selected),
    };
  }

  private async buildSessionChooserPayload(): Promise<SessionChooserViewPayload> {
    const sessions = await this.discovery.listSessions();
    return {
      view: "session_chooser",
      sessions: sessions.map((session) => this.toSessionSummary(session)),
      pinned_session_id: this.discovery.getPinnedSessionId(),
    };
  }

  private async buildCellEditReviewPayload(
    request: PreviewCellEditRequest,
    extra: ToolRequestExtra,
  ): Promise<CellEditReviewViewPayload> {
    const preview = await this.requirePreviewClient(await this.getClient(extra)).previewCellEdit(request);
    return {
      view: "cell_edit_review",
      request,
      preview,
    };
  }

  private async buildExecutionMonitorPayload(
    executionId: string,
    extra: ToolRequestExtra,
  ): Promise<ExecutionMonitorViewPayload> {
    return {
      view: "execution_monitor",
      execution: await (await this.getClient(extra)).getExecutionStatus({ execution_id: executionId }),
    };
  }

  private async buildNotebookTriagePayload(
    input: z.infer<typeof notebookScopeInputSchema>,
    extra: ToolRequestExtra,
  ): Promise<NotebookTriageViewPayload> {
    const client = await this.getClient(extra);
    const cellsRequest = {
      notebook_uri: input.notebook_uri,
      range: input.range,
      cell_ids: input.cell_ids,
    };
    const diagnosticsRequest = {
      notebook_uri: input.notebook_uri,
      range: input.range,
      cell_ids: input.cell_ids,
      max_results: 100,
    };

    return {
      view: "notebook_triage",
      notebook_uri: input.notebook_uri,
      query: input.query,
      summary: await client.summarizeNotebookState(input.notebook_uri),
      cells: await client.listNotebookCells(cellsRequest),
      diagnostics: await client.getDiagnostics(diagnosticsRequest),
      search:
        input.query === undefined
          ? undefined
          : await client.searchNotebook({
              ...cellsRequest,
              query: input.query,
              max_results: 100,
            }),
      symbols:
        input.query === undefined
          ? undefined
          : await client.findSymbols({
              ...cellsRequest,
              query: input.query,
              max_results: 100,
            }),
    };
  }

  private async buildCellOutputPreviewPayload(
    input: z.infer<typeof cellOutputPreviewInputSchema>,
    extra: ToolRequestExtra,
  ): Promise<CellOutputPreviewViewPayload> {
    const result = await (await this.getClient(extra)).readCellOutputs({
      notebook_uri: input.notebook_uri,
      cell_id: input.cell_id,
    });
    this.assertOutputIndex(result, input.output_index);
    return {
      view: "cell_output_preview",
      notebook_uri: input.notebook_uri,
      cell_id: input.cell_id,
      output_index: input.output_index,
      result,
    };
  }

  private async exportCellOutputSnapshot(
    input: z.infer<typeof cellOutputPreviewInputSchema>,
    extra: ToolRequestExtra,
  ) {
    const result = await (await this.getClient(extra)).readCellOutputs({
      notebook_uri: input.notebook_uri,
      cell_id: input.cell_id,
    });
    this.assertOutputIndex(result, input.output_index);

    const payload = input.output_index === undefined ? result : result.outputs[input.output_index];
    const directory = path.join(os.tmpdir(), "jupyter-agent-bridge", "snapshots");
    await fs.mkdir(directory, { recursive: true });
    const filePath = path.join(directory, `${sanitizePathPart(input.cell_id)}-${Date.now()}.json`);
    const serialized = `${JSON.stringify(payload, null, 2)}\n`;
    await fs.writeFile(filePath, serialized, "utf8");

    return {
      output_file_path: filePath,
      bytes_written: Buffer.byteLength(serialized),
      notebook_uri: input.notebook_uri,
      cell_id: input.cell_id,
      output_index: input.output_index,
    };
  }

  private assertOutputIndex(result: ReadCellOutputsResult, outputIndex?: number): void {
    if (outputIndex === undefined) {
      return;
    }

    if (outputIndex < 0 || outputIndex >= result.outputs.length) {
      fail({
        code: "InvalidRequest",
        message: `output_index ${outputIndex} is out of bounds for cell ${result.cell_id}.`,
        recoverable: true,
      });
    }
  }

  private toSessionSummary(session: BridgeSessionInfo | BridgeSessionSummary | {
    session_id: string;
    workspace_id: string | null;
    workspace_folders: string[];
    window_title?: string;
    bridge_url: string;
    created_at?: string;
    last_seen_at?: string;
  }): BridgeSessionSummary {
    return {
      session_id: session.session_id,
      workspace_id: session.workspace_id,
      workspace_folders: session.workspace_folders,
      window_title: "window_title" in session && typeof session.window_title === "string" ? session.window_title : session.session_id,
      bridge_url: session.bridge_url,
      created_at: "created_at" in session && typeof session.created_at === "string" ? session.created_at : "",
      last_seen_at: "last_seen_at" in session && typeof session.last_seen_at === "string" ? session.last_seen_at : "",
    };
  }

  private toAppToolResult(summary: string, payload: NotebookAppViewPayload): CallToolResult {
    return {
      content: [
        {
          type: "text",
          text: summary,
        },
      ],
      structuredContent: payload as unknown as Record<string, unknown>,
    };
  }

  private async runTool<T>(toolName: string, operation: () => Promise<T>): Promise<CallToolResult> {
    const startedAt = Date.now();
    this.log?.(`tool request name=${toolName}`);
    try {
      const result = await operation();
      this.log?.(`tool response name=${toolName} elapsed_ms=${Date.now() - startedAt}`);
      return this.renderer.toToolResult(result);
    } catch (error) {
      this.log?.(`tool error name=${toolName} elapsed_ms=${Date.now() - startedAt}`);
      return this.renderer.toErrorToolResult(error);
    }
  }

  private requirePreviewClient(
    client: NotebookBridgeClient,
  ): NotebookBridgeClient & { previewCellEdit: NonNullable<NotebookBridgeClient["previewCellEdit"]> } {
    if (!client.previewCellEdit) {
      fail({
        code: "UnsupportedEnvironment",
        message: "The connected bridge does not support preview_cell_edit.",
        recoverable: true,
      });
    }

    return client as NotebookBridgeClient & { previewCellEdit: NonNullable<NotebookBridgeClient["previewCellEdit"]> };
  }
}

function sanitizePathPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/gu, "_");
}
