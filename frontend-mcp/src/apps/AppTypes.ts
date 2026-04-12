import {
  ExecutionStatusResult,
  FindSymbolsResult,
  ListNotebookCellsResult,
  NotebookDiagnosticsResult,
  PreviewCellEditRequest,
  PreviewCellEditResult,
  ReadCellOutputsResult,
  SearchNotebookResult,
  SummarizeNotebookStateResult,
} from "../../../packages/protocol/src";

export const NOTEBOOK_APP_RESOURCE_URI = "ui://jupyter-agent-bridge/notebook-console.html";

export interface BridgeSessionSummary {
  session_id: string;
  workspace_id: string | null;
  workspace_folders: string[];
  window_title: string;
  bridge_url: string;
  created_at: string;
  last_seen_at: string;
}

export interface SessionChooserViewPayload {
  view: "session_chooser";
  sessions: BridgeSessionSummary[];
  pinned_session_id: string | null;
}

export interface CellEditReviewViewPayload {
  view: "cell_edit_review";
  request: PreviewCellEditRequest;
  preview: PreviewCellEditResult;
}

export interface ExecutionMonitorViewPayload {
  view: "execution_monitor";
  execution: ExecutionStatusResult;
}

export interface NotebookTriageViewPayload {
  view: "notebook_triage";
  notebook_uri: string;
  query?: string;
  summary: SummarizeNotebookStateResult;
  cells: ListNotebookCellsResult;
  diagnostics: NotebookDiagnosticsResult;
  search?: SearchNotebookResult;
  symbols?: FindSymbolsResult;
}

export interface CellOutputPreviewViewPayload {
  view: "cell_output_preview";
  notebook_uri: string;
  cell_id: string;
  output_index?: number;
  result: ReadCellOutputsResult;
}

export type NotebookAppViewPayload =
  | SessionChooserViewPayload
  | CellEditReviewViewPayload
  | ExecutionMonitorViewPayload
  | NotebookTriageViewPayload
  | CellOutputPreviewViewPayload;
