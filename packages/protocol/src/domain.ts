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

export type KernelState =
  | "unknown"
  | "idle"
  | "busy"
  | "starting"
  | "restarting"
  | "interrupting"
  | "selecting"
  | "disconnected";

export type KernelPendingAction =
  | "restart"
  | "interrupt"
  | "select_kernel"
  | "select_interpreter"
  | null;

export interface KernelInfo {
  kernel_label: string | null;
  kernel_id: string | null;
  language: string | null;
  execution_supported: boolean;
  state: KernelState;
  generation: number;
  last_seen_at: string | null;
  pending_action: KernelPendingAction;
  requires_user_interaction: boolean;
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
  summary?: string;
  json?: unknown;
  html?: string;
  base64?: string;
  ename?: string;
  evalue?: string;
  traceback?: string[];
  omitted?: boolean;
  truncated?: boolean;
  original_bytes?: number;
  returned_bytes?: number;
}

export interface CellSnapshot {
  cell_id: string;
  index: number;
  kind: NotebookCellKind;
  language: string | null;
  notebook_line_start: number;
  notebook_line_end: number;
  source: string;
  source_sha256: string;
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

export interface NotebookCellPreview {
  cell_id: string;
  index: number;
  kind: NotebookCellKind;
  language: string | null;
  notebook_line_start: number;
  notebook_line_end: number;
  source_preview: string;
  source_line_count: number;
  source_sha256: string;
  execution_status: ExecutionStatus | null;
  execution_order: number | null;
  started_at: string | null;
  ended_at: string | null;
  has_outputs: boolean;
  output_kinds: OutputKind[];
  section_path: string[];
}

export interface OpenNotebookRequest {
  notebook_uri: string;
  view_column?: "active" | "beside";
}

export interface ListNotebookCellsRequest {
  notebook_uri: string;
  range?: { start: number; end: number };
  cell_ids?: string[];
}

export interface ReadNotebookRequest {
  notebook_uri: string;
  include_outputs?: boolean;
  include_rich_output_text?: boolean;
  range?: { start: number; end: number };
  cell_ids?: string[];
}

export interface SearchNotebookRequest {
  notebook_uri: string;
  query: string;
  case_sensitive?: boolean;
  regex?: boolean;
  whole_word?: boolean;
  max_results?: number;
  range?: { start: number; end: number };
  cell_ids?: string[];
  cell_kind?: "code" | "markdown";
}

export interface NotebookDiagnosticsRequest {
  notebook_uri: string;
  range?: { start: number; end: number };
  cell_ids?: string[];
  severities?: Array<"error" | "warning" | "information" | "hint">;
  max_results?: number;
}

export interface FindSymbolsRequest {
  notebook_uri: string;
  query?: string;
  range?: { start: number; end: number };
  cell_ids?: string[];
  max_results?: number;
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
  include_rich_output_text?: boolean;
}

export interface RevealNotebookCellsRequest {
  notebook_uri: string;
  range?: { start: number; end: number };
  cell_ids?: string[];
  select?: boolean;
  reveal_type?: "default" | "center" | "center_if_outside_viewport" | "top";
}

export interface ExecuteCellsRequest {
  notebook_uri: string;
  cell_ids: string[];
  expected_notebook_version?: number;
  timeout_ms?: number;
  stop_on_error?: boolean;
  wait_for_completion?: true;
}

export interface InterruptExecutionRequest {
  notebook_uri: string;
}

export interface RestartKernelRequest {
  notebook_uri: string;
}

export interface SelectJupyterInterpreterRequest {
  notebook_uri: string;
}

export interface SelectKernelRequest {
  notebook_uri: string;
  kernel_id?: string;
  extension_id?: string;
  skip_if_already_selected?: boolean;
}

export interface ListNotebookVariablesRequest {
  notebook_uri: string;
  query?: string;
  offset?: number;
  max_results?: number;
}

export interface WaitForKernelReadyRequest {
  notebook_uri: string;
  timeout_ms?: number;
  target_generation?: number;
}

export interface PatchCellSourceRequest {
  notebook_uri: string;
  cell_id: string;
  patch: string;
  format?: "auto" | "unified_diff" | "codex_apply_patch" | "search_replace_json";
  expected_notebook_version?: number;
  expected_cell_source_sha256?: string;
}

export interface GoToDefinitionRequest {
  notebook_uri: string;
  cell_id: string;
  line: number;
  column: number;
  expected_cell_source_sha256?: string;
}

export interface FormatCellRequest {
  notebook_uri: string;
  cell_id: string;
  expected_notebook_version?: number;
  expected_cell_source_sha256?: string;
}

export interface NotebookStateSummary {
  notebook_uri: string;
  notebook_version: number;
  dirty: boolean;
  kernel: KernelInfo | null;
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

export interface RevealNotebookCellsResult {
  notebook_uri: string;
  notebook_version: number;
  revealed_cell_ids: string[];
  selected: boolean;
  visible_ranges: Array<{ start: number; end: number }>;
}

export interface NotebookOutlineResult {
  notebook_uri: string;
  notebook_version: number;
  headings: NotebookOutlineHeading[];
}

export interface ListNotebookCellsResult {
  notebook_uri: string;
  notebook_version: number;
  cells: NotebookCellPreview[];
}

export interface NotebookVariableSummary {
  name: string;
  type: string | null;
  value_preview: string | null;
  summary: string | null;
  size: string | null;
  shape: string | null;
  supports_data_explorer: boolean;
}

export interface ListNotebookVariablesResult {
  notebook_uri: string;
  notebook_version: number;
  query?: string;
  offset: number;
  max_results: number;
  total_available: number;
  next_offset: number | null;
  truncated: boolean;
  variables: NotebookVariableSummary[];
}

export interface SearchNotebookMatch {
  cell_id: string;
  cell_index: number;
  kind: NotebookCellKind;
  line: number;
  column: number;
  match_text: string;
  line_text: string;
  section_path: string[];
  source_sha256: string;
}

export interface SearchNotebookResult {
  notebook_uri: string;
  notebook_version: number;
  query: string;
  regex: boolean;
  case_sensitive: boolean;
  whole_word: boolean;
  max_results: number;
  truncated: boolean;
  matches: SearchNotebookMatch[];
}

export interface NotebookDiagnostic {
  cell_id: string;
  cell_index: number;
  severity: "error" | "warning" | "information" | "hint";
  message: string;
  source?: string;
  code?: string;
  start_line: number;
  start_column: number;
  end_line: number;
  end_column: number;
  source_sha256: string;
}

export interface NotebookDiagnosticsResult {
  notebook_uri: string;
  notebook_version: number;
  truncated: boolean;
  diagnostics: NotebookDiagnostic[];
}

export interface NotebookSymbol {
  cell_id: string;
  cell_index: number;
  name: string;
  detail?: string;
  kind: string;
  container_name?: string;
  start_line: number;
  start_column: number;
  end_line: number;
  end_column: number;
  selection_start_line: number;
  selection_start_column: number;
  selection_end_line: number;
  selection_end_column: number;
  source_sha256: string;
}

export interface FindSymbolsResult {
  notebook_uri: string;
  notebook_version: number;
  query?: string;
  truncated: boolean;
  symbols: NotebookSymbol[];
}

export interface DefinitionTarget {
  target_uri: string;
  start_line: number;
  start_column: number;
  end_line: number;
  end_column: number;
  target_selection_start_line?: number;
  target_selection_start_column?: number;
  target_selection_end_line?: number;
  target_selection_end_column?: number;
  target_notebook_uri?: string;
  target_cell_id?: string;
  target_cell_index?: number;
}

export interface GoToDefinitionResult {
  notebook_uri: string;
  notebook_version: number;
  cell_id: string;
  line: number;
  column: number;
  source_sha256: string;
  definitions: DefinitionTarget[];
}

export interface GetKernelInfoResult {
  notebook_uri: string;
  notebook_version: number;
  kernel: KernelInfo | null;
}

export interface KernelCommandResult {
  notebook_uri: string;
  notebook_version: number;
  kernel: KernelInfo | null;
  status: "requested" | "prompted" | "selected";
  requires_user_interaction: boolean;
  message: string;
}

export interface WaitForKernelReadyResult {
  notebook_uri: string;
  notebook_version: number;
  kernel: KernelInfo | null;
  ready: boolean;
  timed_out: boolean;
  target_generation: number;
  message: string;
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
  operation:
    | "insert_cell"
    | "replace_cell_source"
    | "patch_cell_source"
    | "format_cell"
    | "delete_cell"
    | "move_cell";
  changed_cell_ids: string[];
  deleted_cell_ids: string[];
  cells: CellSnapshot[];
  outline_maybe_changed: boolean;
}

export interface PatchCellSourceResult extends MutationResult {
  operation: "patch_cell_source";
  applied_patch_format: "unified_diff" | "codex_apply_patch" | "search_replace_json";
  before_source_sha256: string;
  after_source_sha256: string;
}

export interface FormatCellResult extends MutationResult {
  operation: "format_cell";
  formatter_found: boolean;
  formatted: boolean;
  applied_edit_count: number;
  before_source_sha256: string;
  after_source_sha256: string;
}

export type ListOpenNotebooksResult = NotebookSummary[];
export type OpenNotebookResult = NotebookSummary;
export type ReadNotebookResult = NotebookSnapshot;
export type SummarizeNotebookStateResult = NotebookStateSummary;
export type WaitForKernelReadyRpcResult = WaitForKernelReadyResult;
