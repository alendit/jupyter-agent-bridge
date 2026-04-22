import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  PreviewCellEditRequest,
  fail,
} from "../../../packages/protocol/src";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { BridgeDiscovery } from "../bridge/BridgeDiscovery";
import { NotebookBridgeClient } from "../bridge/NotebookBridgeClient";
import { SEARCH_REPLACE_PATCH_ARRAY_SCHEMA, normalizeCellSourceInput, normalizePatchToolInput } from "../mcp/NotebookEditContract";
import { NotebookToolResultRenderer } from "../mcp/NotebookToolResultRenderer";
import { ToolRequestExtra } from "../mcp/SessionSelection";
import {
  AppPayloadBuilder,
  CELL_CODE_PREVIEW_INPUT_SCHEMA,
  CELL_OUTPUT_PREVIEW_INPUT_SCHEMA,
  NOTEBOOK_SCOPE_INPUT_SCHEMA,
} from "./AppPayloadBuilder";
import {
  NOTEBOOK_APP_RESOURCE_URI,
  NotebookAppViewPayload,
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
      patch: z.union([z.string(), SEARCH_REPLACE_PATCH_ARRAY_SCHEMA]),
      format: z.enum(["auto", "unified_diff", "codex_apply_patch", "search_replace_json"]).optional(),
      expected_notebook_version: z.number().int().optional(),
      expected_cell_source_fingerprint: z.string().optional(),
    })
    .passthrough(),
]);

export class AppTools {
  private readonly renderer = new NotebookToolResultRenderer();
  private readonly payloadBuilder: AppPayloadBuilder;

  public constructor(
    private readonly getClient: (extra: ToolRequestExtra) => Promise<NotebookBridgeClient>,
    private readonly discovery: BridgeDiscovery,
    private readonly log?: (message: string) => void,
  ) {
    this.payloadBuilder = new AppPayloadBuilder(discovery);
  }

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
            canonical_source_preview: z.string(),
            warnings: z.array(z.string()),
            diff_unified: z.string(),
            applied_patch_format: z.enum(["unified_diff", "codex_apply_patch", "search_replace_json"]).optional(),
          })
          .passthrough(),
      },
      async (input, extra) =>
        this.runTool("preview_cell_edit", async () =>
          this.requirePreviewClient(await this.getClient(extra)).previewCellEdit(
            this.normalizePreviewCellEditRequest(previewCellEditInputSchema.parse(input)),
          ),
        ),
    );

    server.registerTool(
      "export_cell_output_snapshot",
      {
        title: "Export Cell Output Snapshot",
        description: "Write the current normalized outputs for one cell to an ephemeral temp file and return the path.",
        inputSchema: CELL_OUTPUT_PREVIEW_INPUT_SCHEMA,
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
          this.exportCellOutputSnapshot(AppPayloadBuilder.parseCellOutputPreviewInput(input), extra),
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
          await this.payloadBuilder.buildSessionChooserPayload(),
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
          await this.payloadBuilder.buildCellEditReviewPayload(
            this.normalizePreviewCellEditRequest(previewCellEditInputSchema.parse(input)),
            this.requirePreviewClient(await this.getClient(extra)),
          ),
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
          await this.payloadBuilder.buildExecutionMonitorPayload(
            executionMonitorInputSchema.parse(input).execution_id,
            await this.getClient(extra),
          ),
        ),
    );

    this.registerAppLauncher(
      server,
      registerAppToolUnsafe,
      "open_notebook_triage",
      {
        title: "Open Notebook Triage",
        description: "Open an MCP App that combines diagnostics, search, symbols, and navigation for one notebook.",
        inputSchema: NOTEBOOK_SCOPE_INPUT_SCHEMA,
      },
      async (input, extra) =>
        this.toAppToolResult(
          "Interactive notebook triage opened.",
          await this.payloadBuilder.buildNotebookTriagePayload(
            AppPayloadBuilder.parseNotebookScopeInput(input),
            await this.getClient(extra),
          ),
        ),
    );

    this.registerAppLauncher(
      server,
      registerAppToolUnsafe,
      "open_cell_code_preview",
      {
        title: "Open Cell Code Preview",
        description: "Open an MCP App to inspect one cell's source and jump to the live notebook location.",
        inputSchema: CELL_CODE_PREVIEW_INPUT_SCHEMA,
      },
      async (input, extra) =>
        this.toAppToolResult(
          "Interactive cell code preview opened.",
          await this.payloadBuilder.buildCellCodePreviewPayload(
            AppPayloadBuilder.parseCellCodePreviewInput(input),
            await this.getClient(extra),
          ),
        ),
    );

    this.registerAppLauncher(
      server,
      registerAppToolUnsafe,
      "open_cell_output_preview",
      {
        title: "Open Cell Output Preview",
        description: "Open an MCP App to inspect normalized outputs for one notebook cell and jump to the live notebook output.",
        inputSchema: CELL_OUTPUT_PREVIEW_INPUT_SCHEMA,
      },
      async (input, extra) =>
        this.toAppToolResult(
          "Interactive cell output preview opened.",
          await this.payloadBuilder.buildCellOutputPreviewPayload(
            AppPayloadBuilder.parseCellOutputPreviewInput(input),
            await this.getClient(extra),
          ),
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
      sessions: (await this.discovery.listSessions()).map((session) => this.payloadBuilder.toSessionSummary(session)),
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
      selected_session: this.payloadBuilder.toSessionSummary(selected),
    };
  }

  private async exportCellOutputSnapshot(
    input: ReturnType<typeof AppPayloadBuilder.parseCellOutputPreviewInput>,
    extra: ToolRequestExtra,
  ) {
    const preview = await this.payloadBuilder.buildCellOutputPreviewPayload(input, await this.getClient(extra));
    const payload =
      input.output_index === undefined ? preview.result : preview.result.outputs[input.output_index];
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

  private normalizePreviewCellEditRequest(
    request: z.infer<typeof previewCellEditInputSchema>,
  ): PreviewCellEditRequest {
    if (request.operation === "replace_cell_source") {
      return {
        ...request,
        source: normalizeCellSourceInput(request.source),
      };
    }

    return {
      ...request,
      patch: normalizePatchToolInput(request.patch, request.format),
    };
  }
}

function sanitizePathPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/gu, "_");
}
