import {
  BridgeSessionInfo,
  CellSnapshot,
  NotebookCellPreview,
  PreviewCellEditRequest,
  ReadCellOutputsResult,
  fail,
} from "../../../packages/protocol/src";
import { z } from "zod";
import { BridgeDiscovery } from "../bridge/BridgeDiscovery";
import { NotebookBridgeClient } from "../bridge/NotebookBridgeClient";
import {
  BridgeSessionSummary,
  CellCodePreviewViewPayload,
  CellEditReviewViewPayload,
  CellOutputPreviewViewPayload,
  ExecutionMonitorViewPayload,
  NotebookTriageViewPayload,
  SessionChooserViewPayload,
} from "./AppTypes";

export const NOTEBOOK_SCOPE_INPUT_SCHEMA = z
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

export const CELL_OUTPUT_PREVIEW_INPUT_SCHEMA = z
  .object({
    notebook_uri: z.string(),
    cell_id: z.string(),
    output_index: z.number().int().nonnegative().optional(),
  })
  .passthrough();

export const CELL_CODE_PREVIEW_INPUT_SCHEMA = z
  .object({
    notebook_uri: z.string(),
    cell_id: z.string(),
  })
  .passthrough();

export type NotebookScopeInput = z.infer<typeof NOTEBOOK_SCOPE_INPUT_SCHEMA>;
export type CellOutputPreviewInput = z.infer<typeof CELL_OUTPUT_PREVIEW_INPUT_SCHEMA>;
export type CellCodePreviewInput = z.infer<typeof CELL_CODE_PREVIEW_INPUT_SCHEMA>;

export class AppPayloadBuilder {
  public constructor(private readonly discovery?: BridgeDiscovery) {}

  public async buildSessionChooserPayload(): Promise<SessionChooserViewPayload> {
    if (!this.discovery) {
      throw new Error("BridgeDiscovery is required to build a session chooser payload.");
    }

    const sessions = await this.discovery.listSessions();
    return {
      view: "session_chooser",
      sessions: sessions.map((session) => this.toSessionSummary(session)),
      pinned_session_id: this.discovery.getPinnedSessionId(),
    };
  }

  public async buildCellEditReviewPayload(
    request: PreviewCellEditRequest,
    client: NotebookBridgeClient & { previewCellEdit: NonNullable<NotebookBridgeClient["previewCellEdit"]> },
  ): Promise<CellEditReviewViewPayload> {
    return {
      view: "cell_edit_review",
      request,
      preview: await client.previewCellEdit(request),
    };
  }

  public async buildExecutionMonitorPayload(
    executionId: string,
    client: NotebookBridgeClient,
  ): Promise<ExecutionMonitorViewPayload> {
    return {
      view: "execution_monitor",
      execution: await client.getExecutionStatus({ execution_id: executionId }),
    };
  }

  public async buildNotebookTriagePayload(
    input: NotebookScopeInput,
    client: NotebookBridgeClient,
  ): Promise<NotebookTriageViewPayload> {
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

  public async buildCellOutputPreviewPayload(
    input: CellOutputPreviewInput,
    client: NotebookBridgeClient,
  ): Promise<CellOutputPreviewViewPayload> {
    const result = await client.readCellOutputs({
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

  public async buildCellCodePreviewPayload(
    input: CellCodePreviewInput,
    client: NotebookBridgeClient,
  ): Promise<CellCodePreviewViewPayload> {
    const [snapshot, previews] = await Promise.all([
      client.readNotebook({
        notebook_uri: input.notebook_uri,
        cell_ids: [input.cell_id],
        include_outputs: false,
      }),
      client.listNotebookCells({
        notebook_uri: input.notebook_uri,
        cell_ids: [input.cell_id],
      }),
    ]);

    const cell = snapshot.cells[0];
    const preview = previews.cells[0];
    this.assertCellPreview(snapshot.notebook.notebook_uri, input.cell_id, cell, preview);

    return {
      view: "cell_code_preview",
      notebook_uri: input.notebook_uri,
      preview: preview!,
      cell: cell!,
    };
  }

  public toSessionSummary(
    session: BridgeSessionInfo | BridgeSessionSummary | {
      session_id: string;
      workspace_id: string | null;
      workspace_folders: string[];
      window_title?: string;
      bridge_url: string;
      created_at?: string;
      last_seen_at?: string;
    },
  ): BridgeSessionSummary {
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

  public static parseNotebookScopeInput(input: unknown): NotebookScopeInput {
    return NOTEBOOK_SCOPE_INPUT_SCHEMA.parse(input);
  }

  public static parseCellOutputPreviewInput(input: unknown): CellOutputPreviewInput {
    return CELL_OUTPUT_PREVIEW_INPUT_SCHEMA.parse(input);
  }

  public static parseCellCodePreviewInput(input: unknown): CellCodePreviewInput {
    return CELL_CODE_PREVIEW_INPUT_SCHEMA.parse(input);
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

  private assertCellPreview(
    notebookUri: string,
    cellId: string,
    cell: CellSnapshot | undefined,
    preview: NotebookCellPreview | undefined,
  ): void {
    if (!cell || !preview) {
      fail({
        code: "InvalidRequest",
        message: `Cell ${cellId} was not found in notebook ${notebookUri}.`,
        recoverable: true,
      });
    }
  }
}
