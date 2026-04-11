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
  "get_kernel_info",
  "select_kernel",
  "select_jupyter_interpreter",
  "summarize_notebook_state",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

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
  })
  .passthrough();

const replaceCellSourceInputSchema = z
  .object({
    notebook_uri: notebookUriSchema,
    cell_id: optionalStringSchema,
    expected_notebook_version: notebookVersionSchema,
    expected_cell_source_fingerprint: optionalStringSchema,
    source: optionalStringSchema,
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
  })
  .passthrough();

const formatCellInputSchema = z
  .object({
    notebook_uri: notebookUriSchema,
    cell_id: optionalStringSchema,
    expected_notebook_version: notebookVersionSchema,
    expected_cell_source_fingerprint: optionalStringSchema,
  })
  .passthrough();

const deleteCellInputSchema = z
  .object({
    notebook_uri: notebookUriSchema,
    cell_id: optionalStringSchema,
    expected_notebook_version: notebookVersionSchema,
  })
  .passthrough();

const moveCellInputSchema = z
  .object({
    notebook_uri: notebookUriSchema,
    cell_id: optionalStringSchema,
    expected_notebook_version: notebookVersionSchema,
    target_index: optionalNumberSchema,
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

const singleNotebookInputSchema = z
  .object({
    notebook_uri: notebookUriSchema,
  })
  .passthrough();

export const TOOL_HELP: Record<ToolName, ToolHelp> = {
  list_open_notebooks: {
    title: "List Open Notebooks",
    summary: "List Jupyter notebooks currently visible to the live editor bridge.",
    schema: "{}",
    examples: ["{}"],
  },
  describe_tool: {
    title: "Describe Tool",
    summary: "Return the exact input shape, examples, and notes for one tool or a compact index for all tools.",
    schema: '{"tool_name"?: "<tool-name>"}',
    examples: ["{}", '{"tool_name":"insert_cell"}'],
  },
  open_notebook: {
    title: "Open Notebook",
    summary: "Open a notebook in the live editor session. Returns notebook summary only, not cells.",
    schema: '{"notebook_uri":"file:///.../demo.ipynb","view_column"?: "active"|"beside"}',
    examples: [
      '{"notebook_uri":"file:///workspace/demo.ipynb"}',
      '{"notebook_uri":"file:///workspace/demo.ipynb","view_column":"beside"}',
    ],
  },
  get_notebook_outline: {
    title: "Get Notebook Outline",
    summary: "Cheap notebook structure view from markdown headings. Use this first on large notebooks, then read only the relevant range or cell_ids.",
    schema: '{"notebook_uri":"file:///.../demo.ipynb"}',
    examples: ['{"notebook_uri":"file:///workspace/demo.ipynb"}'],
  },
  list_notebook_cells: {
    title: "List Notebook Cells",
    summary:
      "Cheap per-cell previews for navigation, especially for code-heavy notebooks without useful headings. Returns no full source, no outputs, and includes notebook_line_start/end plus a short source fingerprint for stale-safe patching.",
    schema:
      '{"notebook_uri":"file:///.../demo.ipynb","range"?:{"start":0,"end":50},"cell_ids"?:["cell-1","cell-2"]}',
    examples: [
      '{"notebook_uri":"file:///workspace/demo.ipynb"}',
      '{"notebook_uri":"file:///workspace/demo.ipynb","range":{"start":10,"end":30}}',
    ],
  },
  list_variables: {
    title: "List Variables",
    summary:
      "List variables from the active kernel for one notebook using VS Code Jupyter's variable explorer command. Results are paged and preview fields are capped so agents can fetch small chunks incrementally.",
    schema: '{"notebook_uri":"file:///.../demo.ipynb","query"?: "df","offset"?:0,"max_results"?:50}',
    examples: [
      '{"notebook_uri":"file:///workspace/demo.ipynb"}',
      '{"notebook_uri":"file:///workspace/demo.ipynb","query":"dataframe","offset":0,"max_results":25}',
    ],
  },
  search_notebook: {
    title: "Search Notebook",
    summary: "Fast source search across notebook cells. Use this to find symbols or strings before reading specific cells.",
    schema:
      '{"notebook_uri":"file:///.../demo.ipynb","query":"fit_model","case_sensitive"?:false,"regex"?:false,"whole_word"?:false,"max_results"?:50,"range"?:{"start":0,"end":50},"cell_ids"?:["cell-1"],"cell_kind"?: "code"|"markdown"}',
    examples: [
      '{"notebook_uri":"file:///workspace/demo.ipynb","query":"fit_model","cell_kind":"code"}',
      '{"notebook_uri":"file:///workspace/demo.ipynb","query":"^## ","regex":true,"cell_kind":"markdown"}',
    ],
  },
  find_symbols: {
    title: "Find Symbols",
    summary: "Cheap semantic symbol scan for selected cells. Use this when text search is too noisy or you need symbol kinds and positions.",
    schema:
      '{"notebook_uri":"file:///.../demo.ipynb","query"?: "Trainer","max_results"?:50,"range"?:{"start":0,"end":50},"cell_ids"?:["cell-1"]}',
    examples: [
      '{"notebook_uri":"file:///workspace/demo.ipynb","query":"fit"}',
      '{"notebook_uri":"file:///workspace/demo.ipynb","cell_ids":["cell-4","cell-5"]}',
    ],
  },
  get_diagnostics: {
    title: "Get Diagnostics",
    summary: "Read current editor diagnostics for selected cells. Use this for syntax, type, import, or lint signals. Runtime exceptions are in cell outputs, not here.",
    schema:
      '{"notebook_uri":"file:///.../demo.ipynb","severities"?:["error","warning"],"max_results"?:100,"range"?:{"start":0,"end":20},"cell_ids"?:["cell-1"]}',
    examples: [
      '{"notebook_uri":"file:///workspace/demo.ipynb","severities":["error","warning"]}',
      '{"notebook_uri":"file:///workspace/demo.ipynb","cell_ids":["cell-9"]}',
    ],
  },
  go_to_definition: {
    title: "Go To Definition",
    summary: "Resolve one symbol reference from an exact cell position. Use this after a targeted read when you need the defining cell or external file location.",
    schema:
      '{"notebook_uri":"file:///.../demo.ipynb","cell_id":"cell-1","line":12,"column":9,"expected_cell_source_fingerprint"?: "<fingerprint>"}',
    examples: [
      '{"notebook_uri":"file:///workspace/demo.ipynb","cell_id":"cell-4","line":12,"column":9,"expected_cell_source_fingerprint":"<fingerprint>"}',
    ],
  },
  read_notebook: {
    title: "Read Notebook",
    summary:
      "Read live notebook cells. Outputs are excluded by default and cells include notebook_line_start/end plus a short source fingerprint. Plain notebook stdout, stderr, and error payloads are normalized and returned automatically when outputs are included. Rich rendered HTML/JS/widget output text is omitted by default; set include_rich_output_text=true only if you need the raw payload. Use output_file_path to write the result to disk and keep it out of context.",
    schema:
      '{"notebook_uri":"file:///.../demo.ipynb","include_outputs"?:boolean,"include_rich_output_text"?:boolean,"output_file_path"?:"/tmp/notebook.json","range"?:{"start":0,"end":5},"cell_ids"?:["cell-1","cell-2"]}',
    examples: [
      '{"notebook_uri":"file:///workspace/demo.ipynb","range":{"start":10,"end":18}}',
      '{"notebook_uri":"file:///workspace/demo.ipynb","cell_ids":["cell-1"]}',
    ],
  },
  insert_cell: {
    title: "Insert Cell",
    summary: "Insert a new cell. position must use the mode form. Returns only a compact mutation receipt, not the whole notebook.",
    schema:
      '{"notebook_uri":"file:///.../demo.ipynb","expected_notebook_version"?:7,"position":{"mode":"before_index","index":0}|{"mode":"before_cell_id","cell_id":"cell-1"}|{"mode":"after_cell_id","cell_id":"cell-1"}|{"mode":"at_end"},"cell":{"kind":"markdown"|"code","source":"...","language"?:string|null,"metadata"?:object}}',
    examples: [
      '{"notebook_uri":"file:///workspace/demo.ipynb","position":{"mode":"at_end"},"cell":{"kind":"code","language":"python","source":"print(1)"}}',
      '{"notebook_uri":"file:///workspace/demo.ipynb","position":{"mode":"after_cell_id","cell_id":"cell-1"},"cell":{"kind":"markdown","source":"## Notes"}}',
    ],
  },
  replace_cell_source: {
    title: "Replace Cell Source",
    summary: "Replace one cell source. Prefer this for medium or large rewrites where resending full source is simpler than constructing a patch. Editing source does not change kernel state until code cells are executed. Prefer the last seen source_fingerprint to stay stale-safe. Returns a compact mutation receipt.",
    schema:
      '{"notebook_uri":"file:///.../demo.ipynb","cell_id":"cell-1","expected_notebook_version"?:7,"expected_cell_source_fingerprint"?: "<fingerprint>","source":"..."}',
    examples: [
      '{"notebook_uri":"file:///workspace/demo.ipynb","cell_id":"cell-1","source":"print(2)","expected_cell_source_fingerprint":"<fingerprint>"}',
    ],
  },
  patch_cell_source: {
    title: "Patch Cell Source",
    summary: "Apply a patch to one cell without resending full source. Prefer this for small, local edits where minimizing text churn matters. Use format=search_replace_json when you want the least brittle patch shape. Prefer the current source_fingerprint from a recent read or preview to guard against stale cell state.",
    schema:
      '{"notebook_uri":"file:///.../demo.ipynb","cell_id":"cell-1","patch":"...","format"?: "auto"|"unified_diff"|"codex_apply_patch"|"search_replace_json","expected_notebook_version"?:7,"expected_cell_source_fingerprint"?: "<fingerprint>"}',
    examples: [
      '{"notebook_uri":"file:///workspace/demo.ipynb","cell_id":"cell-1","format":"unified_diff","patch":"@@\\n-print(x)\\n+print(x + 1)","expected_cell_source_fingerprint":"<fingerprint>"}',
      '{"notebook_uri":"file:///workspace/demo.ipynb","cell_id":"cell-1","format":"search_replace_json","patch":"[{\\"old\\":\\"epochs=10\\",\\"new\\":\\"epochs=20\\"}]","expected_cell_source_fingerprint":"<fingerprint>"}',
    ],
  },
  format_cell: {
    title: "Format Cell",
    summary: "Run the editor formatter on one cell if available. Use this after code edits. Formatting changes source only and clears stale outputs when source changes.",
    schema:
      '{"notebook_uri":"file:///.../demo.ipynb","cell_id":"cell-1","expected_notebook_version"?:7,"expected_cell_source_fingerprint"?: "<fingerprint>"}',
    examples: [
      '{"notebook_uri":"file:///workspace/demo.ipynb","cell_id":"cell-1","expected_cell_source_fingerprint":"<fingerprint>"}',
    ],
  },
  delete_cell: {
    title: "Delete Cell",
    summary: "Delete one cell from the live notebook. Returns a compact mutation receipt.",
    schema: '{"notebook_uri":"file:///.../demo.ipynb","cell_id":"cell-1","expected_notebook_version"?:7}',
    examples: ['{"notebook_uri":"file:///workspace/demo.ipynb","cell_id":"cell-1"}'],
  },
  move_cell: {
    title: "Move Cell",
    summary: "Move one cell to a target notebook index. Returns a compact mutation receipt.",
    schema: '{"notebook_uri":"file:///.../demo.ipynb","cell_id":"cell-1","target_index":0,"expected_notebook_version"?:7}',
    examples: ['{"notebook_uri":"file:///workspace/demo.ipynb","cell_id":"cell-1","target_index":0}'],
  },
  execute_cells: {
    title: "Execute Cells",
    summary: "Execute code cells and wait for completion before returning. Executing mutates kernel state immediately; editing source alone does not. Re-run changed definitions and dependents. Carry source_fingerprint values when you want an optimistic stale check before execution. Use execute_cells_async for non-blocking execution. With stop_on_error=true, untouched later cells are reported as cancelled after the first failed cell instead of hanging until timeout.",
    schema:
      '{"notebook_uri":"file:///.../demo.ipynb","cell_ids":["cell-1"],"expected_notebook_version"?:7,"expected_cell_source_fingerprint_by_id"?:{"cell-1":"<fingerprint>"},"timeout_ms"?:30000,"stop_on_error"?:true}',
    examples: [
      '{"notebook_uri":"file:///workspace/demo.ipynb","cell_ids":["cell-1"]}',
      '{"notebook_uri":"file:///workspace/demo.ipynb","cell_ids":["cell-1","cell-2"],"expected_cell_source_fingerprint_by_id":{"cell-1":"<fingerprint-1>","cell-2":"<fingerprint-2>"},"timeout_ms":45000,"stop_on_error":true}',
    ],
  },
  execute_cells_async: {
    title: "Execute Cells Async",
    summary: "Queue code cell execution and return an execution handle immediately. Use get_execution_status or wait_for_execution to observe the terminal result. Carry source_fingerprint values when you want an optimistic stale check before the request is accepted.",
    schema:
      '{"notebook_uri":"file:///.../demo.ipynb","cell_ids":["cell-1"],"expected_notebook_version"?:7,"expected_cell_source_fingerprint_by_id"?:{"cell-1":"<fingerprint>"},"timeout_ms"?:30000,"stop_on_error"?:true}',
    examples: [
      '{"notebook_uri":"file:///workspace/demo.ipynb","cell_ids":["cell-1"]}',
      '{"notebook_uri":"file:///workspace/demo.ipynb","cell_ids":["cell-1","cell-2"],"expected_cell_source_fingerprint_by_id":{"cell-1":"<fingerprint-1>","cell-2":"<fingerprint-2>"},"timeout_ms":45000,"stop_on_error":true}',
    ],
  },
  get_execution_status: {
    title: "Get Execution Status",
    summary: "Read the latest status snapshot for a previously accepted async execution handle.",
    schema: '{"execution_id":"<execution-id>"}',
    examples: ['{"execution_id":"a2f9a034-8f55-4ae7-81ba-9d2a18b74951"}'],
  },
  wait_for_execution: {
    title: "Wait For Execution",
    summary: "Wait for an async execution handle to reach a terminal state, or return the latest non-terminal snapshot if the wait itself times out.",
    schema: '{"execution_id":"<execution-id>","timeout_ms"?:30000}',
    examples: [
      '{"execution_id":"a2f9a034-8f55-4ae7-81ba-9d2a18b74951"}',
      '{"execution_id":"a2f9a034-8f55-4ae7-81ba-9d2a18b74951","timeout_ms":45000}',
    ],
  },
  interrupt_execution: {
    title: "Interrupt Execution",
    summary: "Ask VS Code/Jupyter to interrupt the active notebook kernel.",
    schema: '{"notebook_uri":"file:///.../demo.ipynb"}',
    examples: ['{"notebook_uri":"file:///workspace/demo.ipynb"}'],
  },
  restart_kernel: {
    title: "Restart Kernel",
    summary: "Ask VS Code/Jupyter to restart the active notebook kernel.",
    schema: '{"notebook_uri":"file:///.../demo.ipynb"}',
    examples: ['{"notebook_uri":"file:///workspace/demo.ipynb"}'],
  },
  wait_for_kernel_ready: {
    title: "Wait For Kernel Ready",
    summary: "Wait until the notebook's current or target kernel generation is ready, or return the latest not-ready state if setup is still in progress or times out.",
    schema:
      '{"notebook_uri":"file:///.../demo.ipynb","timeout_ms"?:30000,"target_generation"?:2}',
    examples: [
      '{"notebook_uri":"file:///workspace/demo.ipynb"}',
      '{"notebook_uri":"file:///workspace/demo.ipynb","timeout_ms":45000,"target_generation":2}',
    ],
  },
  read_cell_outputs: {
    title: "Read Cell Outputs",
    summary:
      "Read normalized outputs for one cell. Prefer this over read_notebook(include_outputs=true) when you only need one cell's outputs. Plain notebook stdout, stderr, and error payloads are returned by default. Rich rendered HTML/JS/widget output text is omitted by default; set include_rich_output_text=true only if you need the raw payload. Use output_file_path to write the result to disk and keep it out of context.",
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
    summary:
      "Reveal cells in the live notebook editor and optionally select them or focus the first matching cell output. Use this to demonstrate results without reading raw .ipynb JSON.",
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
    summary:
      "Collapse or expand the input area for selected notebook cells in the live editor UI without changing notebook content.",
    schema:
      '{"notebook_uri":"file:///.../demo.ipynb","range"?:{"start":0,"end":5},"cell_ids"?:["cell-1"],"input_visibility":"collapse"|"expand"}',
    examples: [
      '{"notebook_uri":"file:///workspace/demo.ipynb","cell_ids":["cell-1"],"input_visibility":"collapse"}',
      '{"notebook_uri":"file:///workspace/demo.ipynb","range":{"start":10,"end":15},"input_visibility":"expand"}',
    ],
  },
  get_kernel_info: {
    title: "Get Kernel Info",
    summary: "Read best-effort kernel information for the notebook.",
    schema: '{"notebook_uri":"file:///.../demo.ipynb"}',
    examples: ['{"notebook_uri":"file:///workspace/demo.ipynb"}'],
  },
  select_kernel: {
    title: "Select Kernel",
    summary: "Open the VS Code kernel picker or directly select a known kernel controller by id and extension id.",
    schema:
      '{"notebook_uri":"file:///.../demo.ipynb","kernel_id"?: "controller-id","extension_id"?: "publisher.extension","skip_if_already_selected"?: true}',
    examples: [
      '{"notebook_uri":"file:///workspace/demo.ipynb"}',
      '{"notebook_uri":"file:///workspace/demo.ipynb","kernel_id":"python-env","extension_id":"ms-toolsai.jupyter"}',
    ],
  },
  select_jupyter_interpreter: {
    title: "Select Jupyter Interpreter",
    summary: "Open the VS Code Jupyter interpreter picker for the active notebook. VS Code may prompt to install ipykernel for the chosen environment.",
    schema: '{"notebook_uri":"file:///.../demo.ipynb"}',
    examples: ['{"notebook_uri":"file:///workspace/demo.ipynb"}'],
  },
  summarize_notebook_state: {
    title: "Summarize Notebook State",
    summary: "Return a compact machine-readable notebook status summary.",
    schema: '{"notebook_uri":"file:///.../demo.ipynb"}',
    examples: ['{"notebook_uri":"file:///workspace/demo.ipynb"}'],
  },
};

export const NOTEBOOK_RULES = [
  "Keep context small: use notebook tools before shell or ad-hoc Python.",
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
  "Then use targeted read_notebook, go_to_definition, or read_cell_outputs.",
  "Notebook data may change between turns because the user can edit cells.",
  "Use notebook versions and source_fingerprint values to avoid stale edits or executions.",
  "Treat cell_id as stable identity and source_fingerprint as mutable cell state.",
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
  get_kernel_info: singleNotebookInputSchema,
  select_kernel: selectKernelInputSchema,
  select_jupyter_interpreter: singleNotebookInputSchema,
  summarize_notebook_state: singleNotebookInputSchema,
};

export function buildToolDescription(toolName: ToolName): string {
  const help = TOOL_HELP[toolName];
  const examples = help.examples.map((example, index) => `${index + 1}. ${example}`).join("\n");
  const preferred = toolName === "describe_tool" ? "" : "Preferred notebook interface.\n\n";
  return `${preferred}${help.summary}\n\nStrict JSON types only. Do not quote booleans or numbers.\n\nSchema:\n${help.schema}\n\nExamples:\n${examples}`;
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
