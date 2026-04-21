import {
  ReadCellOutputsRequest,
  ReadNotebookRequest,
} from "../../../packages/protocol/src";
import { z } from "zod";

export const TOOL_NAMES = [
  "list_open_notebooks",
  "describe_tool",
  "open_notebook",
  "get_notebook_outline",
  "list_notebook_cells",
  "list_variables",
  "search_notebook",
  "find_symbols",
  "get_diagnostics",
  "go_to_definition",
  "read_notebook",
  "insert_cell",
  "replace_cell_source",
  "patch_cell_source",
  "format_cell",
  "delete_cell",
  "move_cell",
  "execute_cells",
  "execute_cells_async",
  "get_execution_status",
  "wait_for_execution",
  "interrupt_execution",
  "restart_kernel",
  "wait_for_kernel_ready",
  "read_cell_outputs",
  "reveal_notebook_cells",
  "set_notebook_cell_input_visibility",
  "run_notebook_workflow",
  "get_kernel_info",
  "select_kernel",
  "select_jupyter_interpreter",
  "summarize_notebook_state",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

// ---------------------------------------------------------------------------
// Tool profiles
// ---------------------------------------------------------------------------

/** Core tools: the default surface for all MCP hosts. The full notebook tool
 *  catalog stays available by default; only progressive-discovery extras are
 *  gated by the full profile elsewhere in the frontend shell. */
export const CORE_TOOLS: readonly ToolName[] = TOOL_NAMES;

/** Advanced tools are no longer split out of the notebook tool catalog. The
 *  full profile now gates only progressive-discovery surfaces such as MCP
 *  resources and companion apps. */
export const ADVANCED_TOOLS: readonly ToolName[] = [] as const;

export type ToolProfile = "core" | "full";

export function resolveToolProfile(): ToolProfile {
  const env = process.env.JUPYTER_AGENT_BRIDGE_PROFILE?.toLowerCase();
  if (env === "full" || env === "all") {
    return "full";
  }
  return "core";
}

export function toolsForProfile(profile: ToolProfile): readonly ToolName[] {
  return profile === "full" ? TOOL_NAMES : CORE_TOOLS;
}

// ---------------------------------------------------------------------------
// Tool annotations (MCP spec hints for host-side reasoning)
// ---------------------------------------------------------------------------

export interface ToolAnnotations {
  title: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export const TOOL_ANNOTATIONS: Record<ToolName, ToolAnnotations> = {
  list_open_notebooks:              { title: "List Open Notebooks",               readOnlyHint: true,  idempotentHint: true,  openWorldHint: false },
  describe_tool:                    { title: "Describe Tool",                     readOnlyHint: true,  idempotentHint: true,  openWorldHint: false },
  open_notebook:                    { title: "Open Notebook",                     readOnlyHint: false, idempotentHint: true,  openWorldHint: false },
  get_notebook_outline:             { title: "Get Notebook Outline",              readOnlyHint: true,  idempotentHint: true,  openWorldHint: false },
  list_notebook_cells:              { title: "List Notebook Cells",               readOnlyHint: true,  idempotentHint: true,  openWorldHint: false },
  list_variables:                   { title: "List Variables",                    readOnlyHint: true,  idempotentHint: true,  openWorldHint: false },
  search_notebook:                  { title: "Search Notebook",                   readOnlyHint: true,  idempotentHint: true,  openWorldHint: false },
  find_symbols:                     { title: "Find Symbols",                      readOnlyHint: true,  idempotentHint: true,  openWorldHint: false },
  get_diagnostics:                  { title: "Get Diagnostics",                   readOnlyHint: true,  idempotentHint: true,  openWorldHint: false },
  go_to_definition:                 { title: "Go To Definition",                  readOnlyHint: true,  idempotentHint: true,  openWorldHint: false },
  read_notebook:                    { title: "Read Notebook",                     readOnlyHint: true,  idempotentHint: true,  openWorldHint: false },
  insert_cell:                      { title: "Insert Cell",                       readOnlyHint: false, idempotentHint: false, openWorldHint: false },
  replace_cell_source:              { title: "Replace Cell Source",               readOnlyHint: false, idempotentHint: true,  openWorldHint: false },
  patch_cell_source:                { title: "Patch Cell Source",                 readOnlyHint: false, idempotentHint: false, openWorldHint: false },
  format_cell:                      { title: "Format Cell",                       readOnlyHint: false, idempotentHint: true,  openWorldHint: false },
  delete_cell:                      { title: "Delete Cell",                       readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  move_cell:                        { title: "Move Cell",                         readOnlyHint: false, idempotentHint: true,  openWorldHint: false },
  execute_cells:                    { title: "Execute Cells",                     readOnlyHint: false, idempotentHint: false, openWorldHint: false },
  execute_cells_async:              { title: "Execute Cells Async",               readOnlyHint: false, idempotentHint: false, openWorldHint: false },
  get_execution_status:             { title: "Get Execution Status",              readOnlyHint: true,  idempotentHint: true,  openWorldHint: false },
  wait_for_execution:               { title: "Wait For Execution",               readOnlyHint: true,  idempotentHint: true,  openWorldHint: false },
  interrupt_execution:              { title: "Interrupt Execution",               readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  restart_kernel:                   { title: "Restart Kernel",                    readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  wait_for_kernel_ready:            { title: "Wait For Kernel Ready",             readOnlyHint: true,  idempotentHint: true,  openWorldHint: false },
  read_cell_outputs:                { title: "Read Cell Outputs",                 readOnlyHint: true,  idempotentHint: true,  openWorldHint: false },
  reveal_notebook_cells:            { title: "Reveal Notebook Cells",             readOnlyHint: true,  idempotentHint: true,  openWorldHint: false },
  set_notebook_cell_input_visibility: { title: "Set Cell Input Visibility",       readOnlyHint: true,  idempotentHint: true,  openWorldHint: false },
  run_notebook_workflow:            { title: "Run Notebook Workflow",             readOnlyHint: false, idempotentHint: false, openWorldHint: false },
  get_kernel_info:                  { title: "Get Kernel Info",                   readOnlyHint: true,  idempotentHint: true,  openWorldHint: false },
  select_kernel:                    { title: "Select Kernel",                     readOnlyHint: false, idempotentHint: true,  openWorldHint: false },
  select_jupyter_interpreter:       { title: "Select Jupyter Interpreter",        readOnlyHint: false, idempotentHint: true,  openWorldHint: false },
  summarize_notebook_state:         { title: "Summarize Notebook State",          readOnlyHint: true,  idempotentHint: true,  openWorldHint: false },
};

// ---------------------------------------------------------------------------
// Workflow step tools
// ---------------------------------------------------------------------------

export const NOTEBOOK_WORKFLOW_STEP_TOOLS = [
  "get_notebook_outline",
  "list_notebook_cells",
  "list_variables",
  "search_notebook",
  "find_symbols",
  "get_diagnostics",
  "go_to_definition",
  "read_notebook",
  "insert_cell",
  "replace_cell_source",
  "patch_cell_source",
  "format_cell",
  "delete_cell",
  "move_cell",
  "execute_cells",
  "interrupt_execution",
  "restart_kernel",
  "wait_for_kernel_ready",
  "read_cell_outputs",
  "reveal_notebook_cells",
  "set_notebook_cell_input_visibility",
  "get_kernel_info",
  "select_kernel",
  "select_jupyter_interpreter",
  "summarize_notebook_state",
] as const;
export type NotebookWorkflowStepToolName = (typeof NOTEBOOK_WORKFLOW_STEP_TOOLS)[number];

interface ToolHelp {
  title: string;
  summary: string;
  schema: string;
  examples: string[];
}

export interface ReadNotebookToolRequest extends ReadNotebookRequest {
  output_file_path?: string;
}

export interface ReadCellOutputsToolRequest extends ReadCellOutputsRequest {
  output_file_path?: string;
}

const toolNameSchema = z.enum(TOOL_NAMES).optional();
const permissiveObjectSchema = z.object({}).catchall(z.unknown());
const unknownRecordSchema = z.record(z.unknown());
const notebookUriSchema = z
  .string()
  .describe("Absolute notebook URI, for example file:///workspace/demo.ipynb")
  .optional();
const notebookVersionSchema = z.number().int().optional();
const optionalStringSchema = z.string().optional();
const optionalBooleanSchema = z.boolean().optional();
const optionalNumberSchema = z.number().optional();
const optionalPositiveIntSchema = z.number().int().positive().optional();
const optionalNonNegativeIntSchema = z.number().int().nonnegative().optional();

const openNotebookInputSchema = z
  .object({
    notebook_uri: notebookUriSchema,
    view_column: optionalStringSchema,
  })
  .passthrough();

const readNotebookInputSchema = z
  .object({
    notebook_uri: notebookUriSchema,
    include_outputs: optionalBooleanSchema,
    include_rich_output_text: optionalBooleanSchema,
    output_file_path: optionalStringSchema,
    range: z
      .object({
        start: optionalNumberSchema,
        end: optionalNumberSchema,
      })
      .passthrough()
      .optional(),
    cell_ids: z.array(z.unknown()).optional(),
  })
  .passthrough();

const listNotebookCellsInputSchema = z
  .object({
    notebook_uri: notebookUriSchema,
    range: z
      .object({
        start: optionalNumberSchema,
        end: optionalNumberSchema,
      })
      .passthrough()
      .optional(),
    cell_ids: z.array(z.unknown()).optional(),
  })
  .passthrough();

const listVariablesInputSchema = z
  .object({
    notebook_uri: notebookUriSchema,
    query: optionalStringSchema,
    offset: optionalNonNegativeIntSchema,
    max_results: optionalPositiveIntSchema,
  })
  .passthrough();

const searchNotebookInputSchema = z
  .object({
    notebook_uri: notebookUriSchema,
    query: optionalStringSchema,
    case_sensitive: optionalBooleanSchema,
    regex: optionalBooleanSchema,
    whole_word: optionalBooleanSchema,
    max_results: optionalNumberSchema,
    range: z
      .object({
        start: optionalNumberSchema,
        end: optionalNumberSchema,
      })
      .passthrough()
      .optional(),
    cell_ids: z.array(z.unknown()).optional(),
    cell_kind: optionalStringSchema,
  })
  .passthrough();

const findSymbolsInputSchema = z
  .object({
    notebook_uri: notebookUriSchema,
    query: optionalStringSchema,
    max_results: optionalNumberSchema,
    range: z
      .object({
        start: optionalNumberSchema,
        end: optionalNumberSchema,
      })
      .passthrough()
      .optional(),
    cell_ids: z.array(z.unknown()).optional(),
  })
  .passthrough();

const getDiagnosticsInputSchema = z
  .object({
    notebook_uri: notebookUriSchema,
    max_results: optionalNumberSchema,
    range: z
      .object({
        start: optionalNumberSchema,
        end: optionalNumberSchema,
      })
      .passthrough()
      .optional(),
    cell_ids: z.array(z.unknown()).optional(),
    severities: z.array(z.unknown()).optional(),
  })
  .passthrough();

const goToDefinitionInputSchema = z
  .object({
    notebook_uri: notebookUriSchema,
    cell_id: optionalStringSchema,
    line: optionalNumberSchema,
    column: optionalNumberSchema,
    expected_cell_source_fingerprint: optionalStringSchema,
  })
  .passthrough();

const insertCellInputSchema = z
  .object({
    notebook_uri: notebookUriSchema,
    expected_notebook_version: notebookVersionSchema,
    position: z
      .object({
        mode: optionalStringSchema,
        index: optionalNumberSchema,
        cell_id: optionalStringSchema,
      })
      .passthrough()
      .optional()
      .describe(
        'Required shape: {"mode":"before_index","index":0} | {"mode":"before_cell_id","cell_id":"..."} | {"mode":"after_cell_id","cell_id":"..."} | {"mode":"at_end"}.',
      ),
    cell: z
      .object({
        kind: optionalStringSchema,
        language: z.string().nullable().optional(),
        source: optionalStringSchema,
        metadata: z.record(z.unknown()).optional(),
      })
      .passthrough()
      .optional(),
    reveal: optionalBooleanSchema,
  })
  .passthrough();

const replaceCellSourceInputSchema = z
  .object({
    notebook_uri: notebookUriSchema,
    cell_id: optionalStringSchema,
    expected_notebook_version: notebookVersionSchema,
    expected_cell_source_fingerprint: optionalStringSchema,
    source: optionalStringSchema,
    reveal: optionalBooleanSchema,
  })
  .passthrough();

const patchCellSourceInputSchema = z
  .object({
    notebook_uri: notebookUriSchema,
    cell_id: optionalStringSchema,
    patch: optionalStringSchema,
    format: optionalStringSchema,
    expected_notebook_version: notebookVersionSchema,
    expected_cell_source_fingerprint: optionalStringSchema,
    reveal: optionalBooleanSchema,
  })
  .passthrough();

const formatCellInputSchema = z
  .object({
    notebook_uri: notebookUriSchema,
    cell_id: optionalStringSchema,
    expected_notebook_version: notebookVersionSchema,
    expected_cell_source_fingerprint: optionalStringSchema,
    reveal: optionalBooleanSchema,
  })
  .passthrough();

const deleteCellInputSchema = z
  .object({
    notebook_uri: notebookUriSchema,
    cell_id: optionalStringSchema,
    expected_notebook_version: notebookVersionSchema,
    reveal: optionalBooleanSchema,
  })
  .passthrough();

const moveCellInputSchema = z
  .object({
    notebook_uri: notebookUriSchema,
    cell_id: optionalStringSchema,
    expected_notebook_version: notebookVersionSchema,
    target_index: optionalNumberSchema,
    reveal: optionalBooleanSchema,
  })
  .passthrough();

const executeCellsInputSchema = z
  .object({
    notebook_uri: notebookUriSchema,
    cell_ids: z.array(z.unknown()).optional(),
    expected_notebook_version: notebookVersionSchema,
    expected_cell_source_fingerprint_by_id: z.record(z.string()).optional(),
    timeout_ms: optionalNumberSchema,
    stop_on_error: optionalBooleanSchema,
    reveal: optionalBooleanSchema,
  })
  .passthrough();

const executeCellsAsyncInputSchema = z
  .object({
    notebook_uri: notebookUriSchema,
    cell_ids: z.array(z.unknown()).optional(),
    expected_notebook_version: notebookVersionSchema,
    expected_cell_source_fingerprint_by_id: z.record(z.string()).optional(),
    timeout_ms: optionalNumberSchema,
    stop_on_error: optionalBooleanSchema,
    reveal: optionalBooleanSchema,
  })
  .passthrough();

const executionStatusInputSchema = z
  .object({
    execution_id: optionalStringSchema,
  })
  .passthrough();

const waitForExecutionInputSchema = z
  .object({
    execution_id: optionalStringSchema,
    timeout_ms: optionalNumberSchema,
  })
  .passthrough();

const selectKernelInputSchema = z
  .object({
    notebook_uri: notebookUriSchema,
    kernel_id: optionalStringSchema,
    extension_id: optionalStringSchema,
    skip_if_already_selected: optionalBooleanSchema,
  })
  .passthrough();

const waitForKernelReadyInputSchema = z
  .object({
    notebook_uri: notebookUriSchema,
    timeout_ms: optionalNumberSchema,
    target_generation: optionalNonNegativeIntSchema,
  })
  .passthrough();

const readCellOutputsInputSchema = z
  .object({
    notebook_uri: notebookUriSchema,
    cell_id: optionalStringSchema,
    include_rich_output_text: optionalBooleanSchema,
    output_file_path: optionalStringSchema,
  })
  .passthrough();

const revealNotebookCellsInputSchema = z
  .object({
    notebook_uri: notebookUriSchema,
    range: z
      .object({
        start: optionalNumberSchema,
        end: optionalNumberSchema,
      })
      .passthrough()
      .optional(),
    cell_ids: z.array(z.unknown()).optional(),
    select: optionalBooleanSchema,
    reveal_type: optionalStringSchema,
    focus_target: optionalStringSchema,
  })
  .passthrough();

const setNotebookCellInputVisibilityInputSchema = z
  .object({
    notebook_uri: notebookUriSchema,
    range: z
      .object({
        start: optionalNumberSchema,
        end: optionalNumberSchema,
      })
      .passthrough()
      .optional(),
    cell_ids: z.array(z.unknown()).optional(),
    input_visibility: optionalStringSchema,
  })
  .passthrough();

const notebookWorkflowInputSchema = z
  .object({
    notebook_uri: notebookUriSchema,
    on_error: optionalStringSchema,
    steps: z
      .array(
        z
          .object({
            id: optionalStringSchema,
            tool: optionalStringSchema,
            with: permissiveObjectSchema.optional(),
            depends_on: z.array(z.unknown()).optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

const singleNotebookInputSchema = z
  .object({
    notebook_uri: notebookUriSchema,
  })
  .passthrough();

const kernelInfoOutputSchema = z
  .object({
    kernel_label: z.string().nullable(),
    kernel_id: z.string().nullable(),
    language: z.string().nullable(),
    execution_supported: z.boolean(),
    state: z.enum(["unknown", "idle", "busy", "starting", "restarting", "interrupting", "selecting", "disconnected"]),
    generation: z.number().int(),
    last_seen_at: z.string().nullable(),
    pending_action: z.enum(["restart", "interrupt", "select_kernel", "select_interpreter"]).nullable(),
    requires_user_interaction: z.boolean(),
  })
  .passthrough();

const notebookSummaryOutputSchema = z
  .object({
    notebook_uri: z.string(),
    notebook_type: z.string(),
    notebook_version: z.number().int(),
    dirty: z.boolean(),
    active_editor: z.boolean(),
    visible_editor_count: z.number().int(),
    kernel: kernelInfoOutputSchema.nullable(),
  })
  .passthrough();

const cellExecutionSummaryOutputSchema = z
  .object({
    status: z.enum(["idle", "queued", "running", "succeeded", "failed", "cancelled", "timed_out"]),
    execution_order: z.number().int().nullable(),
    started_at: z.string().nullable(),
    ended_at: z.string().nullable(),
  })
  .passthrough();

const normalizedOutputSchema = z
  .object({
    kind: z.enum(["text", "markdown", "json", "html", "image", "stdout", "stderr", "error", "unknown"]),
    mime: z.string().nullable(),
    text: z.string().optional(),
    summary: z.string().optional(),
    json: z.unknown().optional(),
    html: z.string().optional(),
    base64: z.string().optional(),
    ename: z.string().optional(),
    evalue: z.string().optional(),
    traceback: z.array(z.string()).optional(),
    omitted: z.boolean().optional(),
    truncated: z.boolean().optional(),
    original_bytes: z.number().int().optional(),
    returned_bytes: z.number().int().optional(),
  })
  .passthrough();

const cellSnapshotOutputSchema = z
  .object({
    cell_id: z.string(),
    index: z.number().int(),
    kind: z.enum(["markdown", "code"]),
    language: z.string().nullable(),
    notebook_line_start: z.number().int(),
    notebook_line_end: z.number().int(),
    source: z.string(),
    source_fingerprint: z.string(),
    metadata: unknownRecordSchema,
    execution: cellExecutionSummaryOutputSchema.nullable(),
    outputs: z.array(normalizedOutputSchema).optional(),
  })
  .passthrough();

const notebookOutlineHeadingOutputSchema = z
  .object({
    cell_id: z.string(),
    cell_index: z.number().int(),
    level: z.number().int(),
    title: z.string(),
    path: z.array(z.string()),
    section_end_cell_index_exclusive: z.number().int(),
  })
  .passthrough();

const notebookCellPreviewOutputSchema = z
  .object({
    cell_id: z.string(),
    index: z.number().int(),
    kind: z.enum(["markdown", "code"]),
    language: z.string().nullable(),
    notebook_line_start: z.number().int(),
    notebook_line_end: z.number().int(),
    source_preview: z.string(),
    source_line_count: z.number().int(),
    source_fingerprint: z.string(),
    execution_status: z
      .enum(["idle", "queued", "running", "succeeded", "failed", "cancelled", "timed_out"])
      .nullable(),
    execution_order: z.number().int().nullable(),
    started_at: z.string().nullable(),
    ended_at: z.string().nullable(),
    has_outputs: z.boolean(),
    output_kinds: z.array(z.enum(["text", "markdown", "json", "html", "image", "stdout", "stderr", "error", "unknown"])),
    section_path: z.array(z.string()),
  })
  .passthrough();

const notebookVariableSummaryOutputSchema = z
  .object({
    name: z.string(),
    type: z.string().nullable(),
    value_preview: z.string().nullable(),
    summary: z.string().nullable(),
    size: z.string().nullable(),
    shape: z.string().nullable(),
    supports_data_explorer: z.boolean(),
  })
  .passthrough();

const searchNotebookMatchOutputSchema = z
  .object({
    cell_id: z.string(),
    cell_index: z.number().int(),
    kind: z.enum(["markdown", "code"]),
    line: z.number().int(),
    column: z.number().int(),
    match_text: z.string(),
    line_text: z.string(),
    section_path: z.array(z.string()),
    source_fingerprint: z.string(),
  })
  .passthrough();

const notebookDiagnosticOutputSchema = z
  .object({
    cell_id: z.string(),
    cell_index: z.number().int(),
    severity: z.enum(["error", "warning", "information", "hint"]),
    message: z.string(),
    source: z.string().optional(),
    code: z.string().optional(),
    start_line: z.number().int(),
    start_column: z.number().int(),
    end_line: z.number().int(),
    end_column: z.number().int(),
    source_fingerprint: z.string(),
  })
  .passthrough();

const notebookSymbolOutputSchema = z
  .object({
    cell_id: z.string(),
    cell_index: z.number().int(),
    name: z.string(),
    detail: z.string().optional(),
    kind: z.string(),
    container_name: z.string().optional(),
    start_line: z.number().int(),
    start_column: z.number().int(),
    end_line: z.number().int(),
    end_column: z.number().int(),
    selection_start_line: z.number().int(),
    selection_start_column: z.number().int(),
    selection_end_line: z.number().int(),
    selection_end_column: z.number().int(),
    source_fingerprint: z.string(),
  })
  .passthrough();

const definitionTargetOutputSchema = z
  .object({
    target_uri: z.string(),
    start_line: z.number().int(),
    start_column: z.number().int(),
    end_line: z.number().int(),
    end_column: z.number().int(),
    target_selection_start_line: z.number().int().optional(),
    target_selection_start_column: z.number().int().optional(),
    target_selection_end_line: z.number().int().optional(),
    target_selection_end_column: z.number().int().optional(),
    target_notebook_uri: z.string().optional(),
    target_cell_id: z.string().optional(),
    target_cell_index: z.number().int().optional(),
  })
  .passthrough();

const executeCellResultOutputSchema = z
  .object({
    cell_id: z.string(),
    execution: cellExecutionSummaryOutputSchema.nullable(),
    outputs: z.array(normalizedOutputSchema),
  })
  .passthrough();

const bridgeErrorOutputSchema = z
  .object({
    code: z.string(),
    message: z.string(),
    detail: z.unknown().optional(),
    recoverable: z.boolean().optional(),
  })
  .passthrough();

const notebookChangedDetailOutputSchema = z
  .object({
    notebook_uri: z.string(),
    notebook_version: z.number().int(),
    cells: z.array(cellSnapshotOutputSchema),
  })
  .passthrough();

const fileReceiptOutputSchema = z
  .object({
    written_to_file: z.boolean().optional(),
    tool: z.enum(["read_notebook", "read_cell_outputs"]).optional(),
    output_file_path: z.string().optional(),
    bytes_written: z.number().int().optional(),
    summary: z.string().optional(),
  })
  .passthrough();

const toolSummaryOutputSchema = z
  .object({
    name: z.string(),
    title: z.string(),
    summary: z.string(),
    schema: z.string(),
    examples: z.array(z.string()),
  })
  .passthrough();

const notebookWorkflowStepResultOutputSchema = z
  .object({
    id: z.string(),
    tool: z.enum(NOTEBOOK_WORKFLOW_STEP_TOOLS),
    status: z.enum(["completed", "failed", "skipped"]),
    depends_on: z.array(z.string()),
    result: z.unknown().optional(),
    error: bridgeErrorOutputSchema.optional(),
  })
  .passthrough();

export const TOOL_HELP: Record<ToolName, ToolHelp> = {
  list_open_notebooks: {
    title: "List Open Notebooks",
    summary: "List Jupyter notebooks visible to the bridge.",
    schema: "{}",
    examples: ["{}"],
  },
  describe_tool: {
    title: "Describe Tool",
    summary: "Return input schema, examples, and usage notes for one tool or a compact index of all tools.",
    schema: '{"tool_name"?: "<tool-name>"}',
    examples: ["{}", '{"tool_name":"insert_cell"}'],
  },
  open_notebook: {
    title: "Open Notebook",
    summary: "Open a notebook file in the editor. Returns notebook summary without cells.",
    schema: '{"notebook_uri":"file:///.../demo.ipynb","view_column"?: "active"|"beside"}',
    examples: [
      '{"notebook_uri":"file:///workspace/demo.ipynb"}',
      '{"notebook_uri":"file:///workspace/demo.ipynb","view_column":"beside"}',
    ],
  },
  get_notebook_outline: {
    title: "Get Notebook Outline",
    summary: "Get notebook structure from markdown headings. Use before targeted reads on large notebooks.",
    schema: '{"notebook_uri":"file:///.../demo.ipynb"}',
    examples: ['{"notebook_uri":"file:///workspace/demo.ipynb"}'],
  },
  list_notebook_cells: {
    title: "List Notebook Cells",
    summary: "Get lightweight per-cell previews with line spans and source fingerprints. No full source or outputs.",
    schema:
      '{"notebook_uri":"file:///.../demo.ipynb","range"?:{"start":0,"end":50},"cell_ids"?:["cell-1","cell-2"]}',
    examples: [
      '{"notebook_uri":"file:///workspace/demo.ipynb"}',
      '{"notebook_uri":"file:///workspace/demo.ipynb","range":{"start":10,"end":30}}',
    ],
  },
  list_variables: {
    title: "List Variables",
    summary: "List kernel variables with paged results. Supports query filtering and offset pagination.",
    schema: '{"notebook_uri":"file:///.../demo.ipynb","query"?: "df","offset"?:0,"max_results"?:50}',
    examples: [
      '{"notebook_uri":"file:///workspace/demo.ipynb"}',
      '{"notebook_uri":"file:///workspace/demo.ipynb","query":"dataframe","offset":0,"max_results":25}',
    ],
  },
  search_notebook: {
    title: "Search Notebook",
    summary: "Search cell source text. Supports regex, case sensitivity, and cell-kind filtering.",
    schema:
      '{"notebook_uri":"file:///.../demo.ipynb","query":"fit_model","case_sensitive"?:false,"regex"?:false,"whole_word"?:false,"max_results"?:50,"range"?:{"start":0,"end":50},"cell_ids"?:["cell-1"],"cell_kind"?: "code"|"markdown"}',
    examples: [
      '{"notebook_uri":"file:///workspace/demo.ipynb","query":"fit_model","cell_kind":"code"}',
      '{"notebook_uri":"file:///workspace/demo.ipynb","query":"^## ","regex":true,"cell_kind":"markdown"}',
    ],
  },
  find_symbols: {
    title: "Find Symbols",
    summary: "Semantic symbol scan across selected cells. Use when text search is too noisy.",
    schema:
      '{"notebook_uri":"file:///.../demo.ipynb","query"?: "Trainer","max_results"?:50,"range"?:{"start":0,"end":50},"cell_ids"?:["cell-1"]}',
    examples: [
      '{"notebook_uri":"file:///workspace/demo.ipynb","query":"fit"}',
      '{"notebook_uri":"file:///workspace/demo.ipynb","cell_ids":["cell-4","cell-5"]}',
    ],
  },
  get_diagnostics: {
    title: "Get Diagnostics",
    summary: "Read editor diagnostics (syntax, type, lint errors) for selected cells. Runtime errors are in cell outputs.",
    schema:
      '{"notebook_uri":"file:///.../demo.ipynb","severities"?:["error","warning"],"max_results"?:100,"range"?:{"start":0,"end":20},"cell_ids"?:["cell-1"]}',
    examples: [
      '{"notebook_uri":"file:///workspace/demo.ipynb","severities":["error","warning"]}',
      '{"notebook_uri":"file:///workspace/demo.ipynb","cell_ids":["cell-9"]}',
    ],
  },
  go_to_definition: {
    title: "Go To Definition",
    summary: "Resolve a symbol reference to its definition location from an exact cell position.",
    schema:
      '{"notebook_uri":"file:///.../demo.ipynb","cell_id":"cell-1","line":12,"column":9,"expected_cell_source_fingerprint"?: "<fingerprint>"}',
    examples: [
      '{"notebook_uri":"file:///workspace/demo.ipynb","cell_id":"cell-4","line":12,"column":9,"expected_cell_source_fingerprint":"<fingerprint>"}',
    ],
  },
  read_notebook: {
    title: "Read Notebook",
    summary: "Read cell source and optionally outputs. Use range or cell_ids for targeted reads. Use output_file_path to keep large results out of context.",
    schema:
      '{"notebook_uri":"file:///.../demo.ipynb","include_outputs"?:boolean,"include_rich_output_text"?:boolean,"output_file_path"?:"/tmp/notebook.json","range"?:{"start":0,"end":5},"cell_ids"?:["cell-1","cell-2"]}',
    examples: [
      '{"notebook_uri":"file:///workspace/demo.ipynb","range":{"start":10,"end":18}}',
      '{"notebook_uri":"file:///workspace/demo.ipynb","cell_ids":["cell-1"]}',
    ],
  },
  insert_cell: {
    title: "Insert Cell",
    summary: "Insert a new cell at a specified position. Mutates notebook.",
    schema:
      '{"notebook_uri":"file:///.../demo.ipynb","expected_notebook_version"?:7,"position":{"mode":"before_index","index":0}|{"mode":"before_cell_id","cell_id":"cell-1"}|{"mode":"after_cell_id","cell_id":"cell-1"}|{"mode":"at_end"},"cell":{"kind":"markdown"|"code","source":"...","language"?:string|null,"metadata"?:object}}',
    examples: [
      '{"notebook_uri":"file:///workspace/demo.ipynb","position":{"mode":"at_end"},"cell":{"kind":"code","language":"python","source":"print(1)"}}',
      '{"notebook_uri":"file:///workspace/demo.ipynb","position":{"mode":"after_cell_id","cell_id":"cell-1"},"cell":{"kind":"markdown","source":"## Notes"}}',
    ],
  },
  replace_cell_source: {
    title: "Replace Cell Source",
    summary: "Replace a cell's full source. Pass source_fingerprint for stale-safety. Mutates notebook.",
    schema:
      '{"notebook_uri":"file:///.../demo.ipynb","cell_id":"cell-1","expected_notebook_version"?:7,"expected_cell_source_fingerprint"?: "<fingerprint>","source":"..."}',
    examples: [
      '{"notebook_uri":"file:///workspace/demo.ipynb","cell_id":"cell-1","source":"print(2)","expected_cell_source_fingerprint":"<fingerprint>"}',
    ],
  },
  patch_cell_source: {
    title: "Patch Cell Source",
    summary: "Apply a diff patch to one cell without resending full source. Supports unified_diff and search_replace_json formats. Mutates notebook.",
    schema:
      '{"notebook_uri":"file:///.../demo.ipynb","cell_id":"cell-1","patch":"...","format"?: "auto"|"unified_diff"|"codex_apply_patch"|"search_replace_json","expected_notebook_version"?:7,"expected_cell_source_fingerprint"?: "<fingerprint>"}',
    examples: [
      '{"notebook_uri":"file:///workspace/demo.ipynb","cell_id":"cell-1","format":"unified_diff","patch":"@@\\n-print(x)\\n+print(x + 1)","expected_cell_source_fingerprint":"<fingerprint>"}',
      '{"notebook_uri":"file:///workspace/demo.ipynb","cell_id":"cell-1","format":"search_replace_json","patch":"[{\\"old\\":\\"epochs=10\\",\\"new\\":\\"epochs=20\\"}]","expected_cell_source_fingerprint":"<fingerprint>"}',
    ],
  },
  format_cell: {
    title: "Format Cell",
    summary: "Run the editor formatter on one cell. Mutates notebook.",
    schema:
      '{"notebook_uri":"file:///.../demo.ipynb","cell_id":"cell-1","expected_notebook_version"?:7,"expected_cell_source_fingerprint"?: "<fingerprint>"}',
    examples: [
      '{"notebook_uri":"file:///workspace/demo.ipynb","cell_id":"cell-1","expected_cell_source_fingerprint":"<fingerprint>"}',
    ],
  },
  delete_cell: {
    title: "Delete Cell",
    summary: "Delete one cell. Mutates notebook.",
    schema: '{"notebook_uri":"file:///.../demo.ipynb","cell_id":"cell-1","expected_notebook_version"?:7}',
    examples: ['{"notebook_uri":"file:///workspace/demo.ipynb","cell_id":"cell-1"}'],
  },
  move_cell: {
    title: "Move Cell",
    summary: "Move one cell to a target index. Mutates notebook.",
    schema: '{"notebook_uri":"file:///.../demo.ipynb","cell_id":"cell-1","target_index":0,"expected_notebook_version"?:7}',
    examples: ['{"notebook_uri":"file:///workspace/demo.ipynb","cell_id":"cell-1","target_index":0}'],
  },
  execute_cells: {
    title: "Execute Cells",
    summary: "Execute code cells and wait for results. Mutates kernel state.",
    schema:
      '{"notebook_uri":"file:///.../demo.ipynb","cell_ids":["cell-1"],"expected_notebook_version"?:7,"expected_cell_source_fingerprint_by_id"?:{"cell-1":"<fingerprint>"},"timeout_ms"?:30000,"stop_on_error"?:true}',
    examples: [
      '{"notebook_uri":"file:///workspace/demo.ipynb","cell_ids":["cell-1"]}',
      '{"notebook_uri":"file:///workspace/demo.ipynb","cell_ids":["cell-1","cell-2"],"expected_cell_source_fingerprint_by_id":{"cell-1":"<fingerprint-1>","cell-2":"<fingerprint-2>"},"timeout_ms":45000,"stop_on_error":true}',
    ],
  },
  execute_cells_async: {
    title: "Execute Cells Async",
    summary: "Queue cell execution and return immediately with an execution handle. Poll with get_execution_status or wait_for_execution.",
    schema:
      '{"notebook_uri":"file:///.../demo.ipynb","cell_ids":["cell-1"],"expected_notebook_version"?:7,"expected_cell_source_fingerprint_by_id"?:{"cell-1":"<fingerprint>"},"timeout_ms"?:30000,"stop_on_error"?:true}',
    examples: [
      '{"notebook_uri":"file:///workspace/demo.ipynb","cell_ids":["cell-1"]}',
      '{"notebook_uri":"file:///workspace/demo.ipynb","cell_ids":["cell-1","cell-2"],"expected_cell_source_fingerprint_by_id":{"cell-1":"<fingerprint-1>","cell-2":"<fingerprint-2>"},"timeout_ms":45000,"stop_on_error":true}',
    ],
  },
  get_execution_status: {
    title: "Get Execution Status",
    summary: "Read the current status of an async execution handle.",
    schema: '{"execution_id":"<execution-id>"}',
    examples: ['{"execution_id":"a2f9a034-8f55-4ae7-81ba-9d2a18b74951"}'],
  },
  wait_for_execution: {
    title: "Wait For Execution",
    summary: "Wait for an async execution to complete or time out.",
    schema: '{"execution_id":"<execution-id>","timeout_ms"?:30000}',
    examples: [
      '{"execution_id":"a2f9a034-8f55-4ae7-81ba-9d2a18b74951"}',
      '{"execution_id":"a2f9a034-8f55-4ae7-81ba-9d2a18b74951","timeout_ms":45000}',
    ],
  },
  interrupt_execution: {
    title: "Interrupt Execution",
    summary: "Interrupt the active notebook kernel.",
    schema: '{"notebook_uri":"file:///.../demo.ipynb"}',
    examples: ['{"notebook_uri":"file:///workspace/demo.ipynb"}'],
  },
  restart_kernel: {
    title: "Restart Kernel",
    summary: "Restart the notebook kernel. Clears all kernel state.",
    schema: '{"notebook_uri":"file:///.../demo.ipynb"}',
    examples: ['{"notebook_uri":"file:///workspace/demo.ipynb"}'],
  },
  wait_for_kernel_ready: {
    title: "Wait For Kernel Ready",
    summary: "Wait until the kernel is idle and ready for execution.",
    schema:
      '{"notebook_uri":"file:///.../demo.ipynb","timeout_ms"?:30000,"target_generation"?:2}',
    examples: [
      '{"notebook_uri":"file:///workspace/demo.ipynb"}',
      '{"notebook_uri":"file:///workspace/demo.ipynb","timeout_ms":45000,"target_generation":2}',
    ],
  },
  read_cell_outputs: {
    title: "Read Cell Outputs",
    summary: "Read normalized outputs for one cell. Prefer over read_notebook when only one cell's outputs are needed.",
    schema:
      '{"notebook_uri":"file:///.../demo.ipynb","cell_id":"cell-1","include_rich_output_text"?:boolean,"output_file_path"?:"/tmp/cell-output.json"}',
    examples: [
      '{"notebook_uri":"file:///workspace/demo.ipynb","cell_id":"cell-1"}',
      '{"notebook_uri":"file:///workspace/demo.ipynb","cell_id":"cell-1","include_rich_output_text":true}',
      '{"notebook_uri":"file:///workspace/demo.ipynb","cell_id":"cell-1","output_file_path":"/tmp/cell-output.json"}',
    ],
  },
  reveal_notebook_cells: {
    title: "Reveal Notebook Cells",
    summary: "Scroll to and optionally select cells in the live editor.",
    schema:
      '{"notebook_uri":"file:///.../demo.ipynb","range"?:{"start":0,"end":5},"cell_ids"?:["cell-1"],"select"?:boolean,"reveal_type"?:"default"|"center"|"center_if_outside_viewport"|"top","focus_target"?:"cell"|"output"}',
    examples: [
      '{"notebook_uri":"file:///workspace/demo.ipynb","cell_ids":["cell-1"],"select":true}',
      '{"notebook_uri":"file:///workspace/demo.ipynb","range":{"start":10,"end":15},"reveal_type":"center"}',
      '{"notebook_uri":"file:///workspace/demo.ipynb","cell_ids":["cell-1"],"focus_target":"output"}',
    ],
  },
  set_notebook_cell_input_visibility: {
    title: "Set Notebook Cell Input Visibility",
    summary: "Collapse or expand cell input areas in the editor UI. Does not change notebook content.",
    schema:
      '{"notebook_uri":"file:///.../demo.ipynb","range"?:{"start":0,"end":5},"cell_ids"?:["cell-1"],"input_visibility":"collapse"|"expand"}',
    examples: [
      '{"notebook_uri":"file:///workspace/demo.ipynb","cell_ids":["cell-1"],"input_visibility":"collapse"}',
      '{"notebook_uri":"file:///workspace/demo.ipynb","range":{"start":10,"end":15},"input_visibility":"expand"}',
    ],
  },
  run_notebook_workflow: {
    title: "Run Notebook Workflow",
    summary: "Execute a multi-step notebook plan in one call. Each step reuses an existing tool's input shape.",
    schema:
      '{"notebook_uri":"file:///.../demo.ipynb","on_error"?:"stop"|"continue","steps":[{"id":"step-1","tool":"execute_cells","with":{"cell_ids":["cell-1"],"stop_on_error":true},"depends_on"?:["earlier-step"]}]}',
    examples: [
      '{"notebook_uri":"file:///workspace/demo.ipynb","steps":[{"id":"execute","tool":"execute_cells","with":{"cell_ids":["cell-1"]}},{"id":"reveal","tool":"reveal_notebook_cells","with":{"cell_ids":["cell-1"],"focus_target":"output"},"depends_on":["execute"]}]}',
    ],
  },
  get_kernel_info: {
    title: "Get Kernel Info",
    summary: "Read current kernel metadata for the notebook.",
    schema: '{"notebook_uri":"file:///.../demo.ipynb"}',
    examples: ['{"notebook_uri":"file:///workspace/demo.ipynb"}'],
  },
  select_kernel: {
    title: "Select Kernel",
    summary: "Open the kernel picker or select a specific kernel by controller id.",
    schema:
      '{"notebook_uri":"file:///.../demo.ipynb","kernel_id"?: "controller-id","extension_id"?: "publisher.extension","skip_if_already_selected"?: true}',
    examples: [
      '{"notebook_uri":"file:///workspace/demo.ipynb"}',
      '{"notebook_uri":"file:///workspace/demo.ipynb","kernel_id":"python-env","extension_id":"ms-toolsai.jupyter"}',
    ],
  },
  select_jupyter_interpreter: {
    title: "Select Jupyter Interpreter",
    summary: "Open the Jupyter interpreter picker for the notebook.",
    schema: '{"notebook_uri":"file:///.../demo.ipynb"}',
    examples: ['{"notebook_uri":"file:///workspace/demo.ipynb"}'],
  },
  summarize_notebook_state: {
    title: "Summarize Notebook State",
    summary: "Return a compact notebook status summary with kernel info and error/image cell counts.",
    schema: '{"notebook_uri":"file:///.../demo.ipynb"}',
    examples: ['{"notebook_uri":"file:///workspace/demo.ipynb"}'],
  },
};

export const NOTEBOOK_RULES = [
  "Keep context small: use notebook tools before shell or ad-hoc Python.",
  "Tools remain the universal interface. MCP resources are optional read-only discovery affordances.",
  "Use strict JSON types. Do not quote booleans or numbers.",
  "Kernel state changes only when code cells execute.",
  "Editing source changes notebook text, not runtime state.",
  "For structured notebooks: get_notebook_outline first.",
  "For code-heavy notebooks: list_notebook_cells first.",
  "Use search_notebook or find_symbols before broad reads.",
  "Read only needed ranges or cell_ids, not whole notebooks.",
  "Do not read raw .ipynb JSON when notebook tools are available.",
  "Use read_cell_outputs for one cell instead of full outputs.",
  "Plain notebook stdout, stderr, and error payloads are returned by default.",
  "Rich rendered HTML/JS/widget outputs are omitted by default.",
  "Only request include_rich_output_text when raw rendered payload is necessary.",
  "Use output_file_path to route heavy results to disk instead of context.",
  "Page variables with query, offset, and max_results.",
  "Use search_notebook for text, find_symbols for semantic names.",
  "Use get_diagnostics for editor errors. Runtime errors are in outputs.",
  "Use select_kernel or select_jupyter_interpreter when the notebook kernel or Python environment needs user-driven setup.",
  "Use get_kernel_info or wait_for_kernel_ready to reason about a notebook's current kernel generation and readiness.",
  "Use execute_cells_async with get_execution_status or wait_for_execution for long-running executions.",
  "Use run_notebook_workflow when a multi-step notebook procedure is known in advance and does not need LLM inspection between steps.",
  "In run_notebook_workflow, step.tool reuses an existing notebook tool name and step.with should match that tool's normal input JSON.",
  "Then use targeted read_notebook, go_to_definition, or read_cell_outputs.",
  "Notebook data may change between turns because the user can edit cells.",
  "Use notebook versions and source_fingerprint values to avoid stale edits or executions.",
  "Treat cell_id as stable identity and source_fingerprint as mutable cell state.",
  "Cell-mutating and execution tools (insert_cell, replace_cell_source, patch_cell_source, format_cell, delete_cell, move_cell, execute_cells, execute_cells_async) accept an optional reveal boolean (default true) that scrolls the editor to the affected cell so the user can follow along. Pass reveal=false to suppress.",
];

export const NOTEBOOK_TOOL_INPUT_SCHEMAS: Record<ToolName, z.ZodTypeAny> = {
  list_open_notebooks: permissiveObjectSchema,
  describe_tool: z.object({ tool_name: toolNameSchema }).passthrough(),
  open_notebook: openNotebookInputSchema,
  get_notebook_outline: singleNotebookInputSchema,
  list_notebook_cells: listNotebookCellsInputSchema,
  list_variables: listVariablesInputSchema,
  search_notebook: searchNotebookInputSchema,
  find_symbols: findSymbolsInputSchema,
  get_diagnostics: getDiagnosticsInputSchema,
  go_to_definition: goToDefinitionInputSchema,
  read_notebook: readNotebookInputSchema,
  insert_cell: insertCellInputSchema,
  replace_cell_source: replaceCellSourceInputSchema,
  patch_cell_source: patchCellSourceInputSchema,
  format_cell: formatCellInputSchema,
  delete_cell: deleteCellInputSchema,
  move_cell: moveCellInputSchema,
  execute_cells: executeCellsInputSchema,
  execute_cells_async: executeCellsAsyncInputSchema,
  get_execution_status: executionStatusInputSchema,
  wait_for_execution: waitForExecutionInputSchema,
  interrupt_execution: singleNotebookInputSchema,
  restart_kernel: singleNotebookInputSchema,
  wait_for_kernel_ready: waitForKernelReadyInputSchema,
  read_cell_outputs: readCellOutputsInputSchema,
  reveal_notebook_cells: revealNotebookCellsInputSchema,
  set_notebook_cell_input_visibility: setNotebookCellInputVisibilityInputSchema,
  run_notebook_workflow: notebookWorkflowInputSchema,
  get_kernel_info: singleNotebookInputSchema,
  select_kernel: selectKernelInputSchema,
  select_jupyter_interpreter: singleNotebookInputSchema,
  summarize_notebook_state: singleNotebookInputSchema,
};

export const NOTEBOOK_TOOL_OUTPUT_SCHEMAS: Record<ToolName, z.ZodTypeAny> = {
  list_open_notebooks: z
    .object({
      notebooks: z.array(notebookSummaryOutputSchema),
    })
    .passthrough(),
  describe_tool: z
    .object({
      name: z.string().optional(),
      title: z.string().optional(),
      summary: z.string().optional(),
      type_rules: z.array(z.string()),
      schema: z.string().optional(),
      examples: z.array(z.string()).optional(),
      notebook_rules: z.array(z.string()),
      tools: z.array(toolSummaryOutputSchema).optional(),
    })
    .passthrough(),
  open_notebook: notebookSummaryOutputSchema,
  get_notebook_outline: z
    .object({
      notebook_uri: z.string(),
      notebook_version: z.number().int(),
      headings: z.array(notebookOutlineHeadingOutputSchema),
    })
    .passthrough(),
  list_notebook_cells: z
    .object({
      notebook_uri: z.string(),
      notebook_version: z.number().int(),
      cells: z.array(notebookCellPreviewOutputSchema),
    })
    .passthrough(),
  list_variables: z
    .object({
      notebook_uri: z.string(),
      notebook_version: z.number().int(),
      query: z.string().optional(),
      offset: z.number().int(),
      max_results: z.number().int(),
      total_available: z.number().int(),
      next_offset: z.number().int().nullable(),
      truncated: z.boolean(),
      variables: z.array(notebookVariableSummaryOutputSchema),
    })
    .passthrough(),
  search_notebook: z
    .object({
      notebook_uri: z.string(),
      notebook_version: z.number().int(),
      query: z.string(),
      regex: z.boolean(),
      case_sensitive: z.boolean(),
      whole_word: z.boolean(),
      max_results: z.number().int(),
      truncated: z.boolean(),
      matches: z.array(searchNotebookMatchOutputSchema),
    })
    .passthrough(),
  find_symbols: z
    .object({
      notebook_uri: z.string(),
      notebook_version: z.number().int(),
      query: z.string().optional(),
      truncated: z.boolean(),
      symbols: z.array(notebookSymbolOutputSchema),
    })
    .passthrough(),
  get_diagnostics: z
    .object({
      notebook_uri: z.string(),
      notebook_version: z.number().int(),
      truncated: z.boolean(),
      diagnostics: z.array(notebookDiagnosticOutputSchema),
    })
    .passthrough(),
  go_to_definition: z
    .object({
      notebook_uri: z.string(),
      notebook_version: z.number().int(),
      cell_id: z.string(),
      line: z.number().int(),
      column: z.number().int(),
      source_fingerprint: z.string(),
      definitions: z.array(definitionTargetOutputSchema),
    })
    .passthrough(),
  read_notebook: z
    .object({
      notebook: notebookSummaryOutputSchema.optional(),
      cells: z.array(cellSnapshotOutputSchema).optional(),
      written_to_file: fileReceiptOutputSchema.shape.written_to_file,
      tool: fileReceiptOutputSchema.shape.tool,
      output_file_path: fileReceiptOutputSchema.shape.output_file_path,
      bytes_written: fileReceiptOutputSchema.shape.bytes_written,
      summary: fileReceiptOutputSchema.shape.summary,
    })
    .passthrough(),
  insert_cell: z
    .object({
      notebook: notebookSummaryOutputSchema,
      operation: z.enum(["insert_cell"]),
      changed_cell_ids: z.array(z.string()),
      deleted_cell_ids: z.array(z.string()),
      cells: z.array(cellSnapshotOutputSchema),
      outline_maybe_changed: z.boolean(),
    })
    .passthrough(),
  replace_cell_source: z
    .object({
      notebook: notebookSummaryOutputSchema,
      operation: z.enum(["replace_cell_source"]),
      changed_cell_ids: z.array(z.string()),
      deleted_cell_ids: z.array(z.string()),
      cells: z.array(cellSnapshotOutputSchema),
      outline_maybe_changed: z.boolean(),
    })
    .passthrough(),
  patch_cell_source: z
    .object({
      notebook: notebookSummaryOutputSchema,
      operation: z.enum(["patch_cell_source"]),
      changed_cell_ids: z.array(z.string()),
      deleted_cell_ids: z.array(z.string()),
      cells: z.array(cellSnapshotOutputSchema),
      outline_maybe_changed: z.boolean(),
      applied_patch_format: z.enum(["unified_diff", "codex_apply_patch", "search_replace_json"]),
      before_source_fingerprint: z.string(),
      after_source_fingerprint: z.string(),
    })
    .passthrough(),
  format_cell: z
    .object({
      notebook: notebookSummaryOutputSchema,
      operation: z.enum(["format_cell"]),
      changed_cell_ids: z.array(z.string()),
      deleted_cell_ids: z.array(z.string()),
      cells: z.array(cellSnapshotOutputSchema),
      outline_maybe_changed: z.boolean(),
      formatter_found: z.boolean(),
      formatted: z.boolean(),
      applied_edit_count: z.number().int(),
      before_source_fingerprint: z.string(),
      after_source_fingerprint: z.string(),
    })
    .passthrough(),
  delete_cell: z
    .object({
      notebook: notebookSummaryOutputSchema,
      operation: z.enum(["delete_cell"]),
      changed_cell_ids: z.array(z.string()),
      deleted_cell_ids: z.array(z.string()),
      cells: z.array(cellSnapshotOutputSchema),
      outline_maybe_changed: z.boolean(),
    })
    .passthrough(),
  move_cell: z
    .object({
      notebook: notebookSummaryOutputSchema,
      operation: z.enum(["move_cell"]),
      changed_cell_ids: z.array(z.string()),
      deleted_cell_ids: z.array(z.string()),
      cells: z.array(cellSnapshotOutputSchema),
      outline_maybe_changed: z.boolean(),
    })
    .passthrough(),
  execute_cells: z
    .object({
      notebook_uri: z.string(),
      notebook_version: z.number().int(),
      kernel: kernelInfoOutputSchema.nullable(),
      results: z.array(executeCellResultOutputSchema),
    })
    .passthrough(),
  execute_cells_async: z
    .object({
      execution_id: z.string(),
      notebook_uri: z.string(),
      cell_ids: z.array(z.string()),
      status: z.enum(["queued", "running", "completed", "failed", "timed_out"]),
      submitted_at: z.string(),
      started_at: z.string().optional(),
      completed_at: z.string().optional(),
      message: z.string(),
      result: z
        .object({
          notebook_uri: z.string(),
          notebook_version: z.number().int(),
          kernel: kernelInfoOutputSchema.nullable(),
          results: z.array(executeCellResultOutputSchema),
        })
        .passthrough()
        .optional(),
      error: bridgeErrorOutputSchema.optional(),
    })
    .passthrough(),
  get_execution_status: z
    .object({
      execution_id: z.string(),
      notebook_uri: z.string(),
      cell_ids: z.array(z.string()),
      status: z.enum(["queued", "running", "completed", "failed", "timed_out"]),
      submitted_at: z.string(),
      started_at: z.string().optional(),
      completed_at: z.string().optional(),
      message: z.string(),
      result: z
        .object({
          notebook_uri: z.string(),
          notebook_version: z.number().int(),
          kernel: kernelInfoOutputSchema.nullable(),
          results: z.array(executeCellResultOutputSchema),
        })
        .passthrough()
        .optional(),
      error: bridgeErrorOutputSchema.optional(),
    })
    .passthrough(),
  wait_for_execution: z
    .object({
      execution_id: z.string(),
      notebook_uri: z.string(),
      cell_ids: z.array(z.string()),
      status: z.enum(["queued", "running", "completed", "failed", "timed_out"]),
      submitted_at: z.string(),
      started_at: z.string().optional(),
      completed_at: z.string().optional(),
      message: z.string(),
      result: z
        .object({
          notebook_uri: z.string(),
          notebook_version: z.number().int(),
          kernel: kernelInfoOutputSchema.nullable(),
          results: z.array(executeCellResultOutputSchema),
        })
        .passthrough()
        .optional(),
      error: bridgeErrorOutputSchema.optional(),
      wait_timed_out: z.boolean(),
    })
    .passthrough(),
  interrupt_execution: z
    .object({
      notebook_uri: z.string(),
      notebook_version: z.number().int(),
      kernel: kernelInfoOutputSchema.nullable(),
      status: z.enum(["requested", "prompted", "selected"]),
      requires_user_interaction: z.boolean(),
      message: z.string(),
    })
    .passthrough(),
  restart_kernel: z
    .object({
      notebook_uri: z.string(),
      notebook_version: z.number().int(),
      kernel: kernelInfoOutputSchema.nullable(),
      status: z.enum(["requested", "prompted", "selected"]),
      requires_user_interaction: z.boolean(),
      message: z.string(),
    })
    .passthrough(),
  wait_for_kernel_ready: z
    .object({
      notebook_uri: z.string(),
      notebook_version: z.number().int(),
      kernel: kernelInfoOutputSchema.nullable(),
      ready: z.boolean(),
      timed_out: z.boolean(),
      target_generation: z.number().int(),
      message: z.string(),
    })
    .passthrough(),
  read_cell_outputs: z
    .object({
      notebook_uri: z.string().optional(),
      notebook_version: z.number().int().optional(),
      cell_id: z.string().optional(),
      outputs: z.array(normalizedOutputSchema).optional(),
      written_to_file: fileReceiptOutputSchema.shape.written_to_file,
      tool: fileReceiptOutputSchema.shape.tool,
      output_file_path: fileReceiptOutputSchema.shape.output_file_path,
      bytes_written: fileReceiptOutputSchema.shape.bytes_written,
      summary: fileReceiptOutputSchema.shape.summary,
    })
    .passthrough(),
  reveal_notebook_cells: z
    .object({
      notebook_uri: z.string(),
      notebook_version: z.number().int(),
      revealed_cell_ids: z.array(z.string()),
      selected: z.boolean(),
      focused_target: z.enum(["cell", "output"]),
      visible_ranges: z.array(
        z
          .object({
            start: z.number().int(),
            end: z.number().int(),
          })
          .passthrough(),
      ),
    })
    .passthrough(),
  set_notebook_cell_input_visibility: z
    .object({
      notebook_uri: z.string(),
      notebook_version: z.number().int(),
      updated_cell_ids: z.array(z.string()),
      input_visibility: z.enum(["collapse", "expand"]),
    })
    .passthrough(),
  run_notebook_workflow: z
    .object({
      notebook_uri: z.string(),
      on_error: z.enum(["stop", "continue"]),
      completed_step_ids: z.array(z.string()),
      failed_step_ids: z.array(z.string()),
      skipped_step_ids: z.array(z.string()),
      steps: z.array(notebookWorkflowStepResultOutputSchema),
    })
    .passthrough(),
  get_kernel_info: z
    .object({
      notebook_uri: z.string(),
      notebook_version: z.number().int(),
      kernel: kernelInfoOutputSchema.nullable(),
    })
    .passthrough(),
  select_kernel: z
    .object({
      notebook_uri: z.string(),
      notebook_version: z.number().int(),
      kernel: kernelInfoOutputSchema.nullable(),
      status: z.enum(["requested", "prompted", "selected"]),
      requires_user_interaction: z.boolean(),
      message: z.string(),
    })
    .passthrough(),
  select_jupyter_interpreter: z
    .object({
      notebook_uri: z.string(),
      notebook_version: z.number().int(),
      kernel: kernelInfoOutputSchema.nullable(),
      status: z.enum(["requested", "prompted", "selected"]),
      requires_user_interaction: z.boolean(),
      message: z.string(),
    })
    .passthrough(),
  summarize_notebook_state: z
    .object({
      notebook_uri: z.string(),
      notebook_version: z.number().int(),
      dirty: z.boolean(),
      kernel: kernelInfoOutputSchema.nullable(),
      cells_with_errors: z.array(z.string()),
      cells_with_images: z.array(z.string()),
      active_cell_id: z.string().optional(),
    })
    .passthrough(),
};

export function buildToolDescription(toolName: ToolName): string {
  return TOOL_HELP[toolName].summary;
}

export function describeNotebookTool(toolName?: ToolName): unknown {
  if (!toolName) {
    return {
      type_rules: ["Use strict JSON types. Do not quote booleans or numbers."],
      notebook_rules: NOTEBOOK_RULES,
      tools: TOOL_NAMES.map((name) => ({
        name,
        title: TOOL_HELP[name].title,
        summary: TOOL_HELP[name].summary,
        schema: TOOL_HELP[name].schema,
        examples: TOOL_HELP[name].examples,
      })),
    };
  }

  return {
    name: toolName,
    title: TOOL_HELP[toolName].title,
    summary: TOOL_HELP[toolName].summary,
    type_rules: ["Use strict JSON types. Do not quote booleans or numbers."],
    schema: TOOL_HELP[toolName].schema,
    examples: TOOL_HELP[toolName].examples,
    notebook_rules: NOTEBOOK_RULES,
  };
}
