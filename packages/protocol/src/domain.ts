export type NotebookCellKind = "markdown" | "code";
export type OutputKind = "text" | "markdown" | "json" | "html" | "image" | "error" | "unknown";
export type ExecutionStatus =
  | "idle"
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "timed_out";

export interface KernelInfo {
  kernel_label: string | null;
  kernel_id: string | null;
  language: string | null;
  execution_supported: boolean;
  state: "unknown" | "idle" | "busy";
}

export interface NotebookSummary {
  notebook_uri: string;
  notebook_type: string;
  notebook_version: number;
  dirty: boolean;
  active_editor: boolean;
  visible_editor_count: number;
  kernel: KernelInfo | null;
}

export interface CellExecutionSummary {
  status: ExecutionStatus;
  execution_order: number | null;
  started_at: string | null;
  ended_at: string | null;
}

export interface NormalizedOutput {
  kind: OutputKind;
  mime: string | null;
  text?: string;
  json?: unknown;
  html?: string;
  base64?: string;
  ename?: string;
  evalue?: string;
  traceback?: string[];
  truncated?: boolean;
  original_bytes?: number;
  returned_bytes?: number;
}

export interface CellSnapshot {
  cell_id: string;
  index: number;
  kind: NotebookCellKind;
  language: string | null;
  source: string;
  metadata: Record<string, unknown>;
  execution: CellExecutionSummary | null;
  outputs?: NormalizedOutput[];
}

export interface NotebookSnapshot {
  notebook: NotebookSummary;
  cells: CellSnapshot[];
}

export interface NotebookOutlineHeading {
  cell_id: string;
  cell_index: number;
  level: number;
  title: string;
  path: string[];
  section_end_cell_index_exclusive: number;
}

export interface OpenNotebookRequest {
  notebook_uri: string;
  view_column?: "active" | "beside";
}

export interface ReadNotebookRequest {
  notebook_uri: string;
  include_outputs?: boolean;
  range?: { start: number; end: number };
  cell_ids?: string[];
}

export interface InsertCellRequest {
  notebook_uri: string;
  expected_notebook_version?: number;
  position:
    | { before_index: number }
    | { before_cell_id: string }
    | { after_cell_id: string }
    | { at_end: true };
  cell: {
    kind: NotebookCellKind;
    language?: string | null;
    source: string;
    metadata?: Record<string, unknown>;
  };
}

export interface ReplaceCellSourceRequest {
  notebook_uri: string;
  cell_id: string;
  expected_notebook_version?: number;
  source: string;
}

export interface DeleteCellRequest {
  notebook_uri: string;
  cell_id: string;
  expected_notebook_version?: number;
}

export interface MoveCellRequest {
  notebook_uri: string;
  cell_id: string;
  expected_notebook_version?: number;
  target_index: number;
}

export interface ReadCellOutputsRequest {
  notebook_uri: string;
  cell_id: string;
}

export interface ExecuteCellsRequest {
  notebook_uri: string;
  cell_ids: string[];
  expected_notebook_version?: number;
  timeout_ms?: number;
  wait_for_completion?: true;
}

export interface NotebookStateSummary {
  notebook_uri: string;
  notebook_version: number;
  dirty: boolean;
  kernel: KernelInfo | null;
  last_executed_cell_ids: string[];
  cells_with_errors: string[];
  cells_with_images: string[];
  active_cell_id?: string;
}

export interface ReadCellOutputsResult {
  notebook_uri: string;
  notebook_version: number;
  cell_id: string;
  outputs: NormalizedOutput[];
}

export interface NotebookOutlineResult {
  notebook_uri: string;
  notebook_version: number;
  headings: NotebookOutlineHeading[];
}

export interface GetKernelInfoResult {
  notebook_uri: string;
  notebook_version: number;
  kernel: KernelInfo | null;
}

export interface ExecuteCellResult {
  cell_id: string;
  execution: CellExecutionSummary | null;
  outputs: NormalizedOutput[];
}

export interface ExecuteCellsResult {
  notebook_uri: string;
  notebook_version: number;
  kernel: KernelInfo | null;
  results: ExecuteCellResult[];
}

export interface MutationResult {
  notebook: NotebookSummary;
  operation: "insert_cell" | "replace_cell_source" | "delete_cell" | "move_cell";
  changed_cell_ids: string[];
  deleted_cell_ids: string[];
  cells: CellSnapshot[];
  outline_maybe_changed: boolean;
}

export type ListOpenNotebooksResult = NotebookSummary[];
export type OpenNotebookResult = NotebookSummary;
export type ReadNotebookResult = NotebookSnapshot;
export type SummarizeNotebookStateResult = NotebookStateSummary;
