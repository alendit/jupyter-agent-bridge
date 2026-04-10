import {
  asBridgeError,
  DeleteCellRequest,
  ExecuteCellsRequest,
  FindSymbolsRequest,
  FormatCellRequest,
  GoToDefinitionRequest,
  InterruptExecutionRequest,
  InsertCellRequest,
  ListNotebookCellsRequest,
  ListNotebookVariablesRequest,
  MoveCellRequest,
  NotebookDiagnosticsRequest,
  NormalizedOutput,
  OpenNotebookRequest,
  PatchCellSourceRequest,
  ReadCellOutputsRequest,
  ReadNotebookRequest,
  ReplaceCellSourceRequest,
  RestartKernelRequest,
  SearchNotebookRequest,
  SelectJupyterInterpreterRequest,
  SelectKernelRequest,
  WaitForKernelReadyRequest,
} from "../../../packages/protocol/src";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult, ImageContent } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { NotebookBridgeClient } from "../bridge/NotebookBridgeClient";

const TOOL_NAMES = [
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
  "interrupt_execution",
  "restart_kernel",
  "wait_for_kernel_ready",
  "read_cell_outputs",
  "get_kernel_info",
  "select_kernel",
  "select_jupyter_interpreter",
  "summarize_notebook_state",
] as const;

type ToolName = (typeof TOOL_NAMES)[number];

type ToolInput = Record<string, unknown>;
type NotebookCellInput = InsertCellRequest["cell"];

interface ToolHelp {
  title: string;
  summary: string;
  schema: string;
  examples: string[];
}

interface ReadNotebookToolRequest extends ReadNotebookRequest {
  output_file_path?: string;
}

interface ReadCellOutputsToolRequest extends ReadCellOutputsRequest {
  output_file_path?: string;
}

const toolNameSchema = z.enum(TOOL_NAMES).optional();
const permissiveObjectSchema = z.object({}).catchall(z.unknown());
const notebookUriSchema = z.string().describe("Absolute notebook URI, for example file:///workspace/demo.ipynb").optional();
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
    expected_cell_source_sha256: optionalStringSchema,
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
        before_index: optionalNumberSchema,
        before_cell_id: optionalStringSchema,
        after_cell_id: optionalStringSchema,
        at_end: optionalBooleanSchema,
      })
      .passthrough()
      .optional()
      .describe(
        'Preferred shape: {"mode":"before_index","index":0} | {"mode":"before_cell_id","cell_id":"..."} | {"mode":"after_cell_id","cell_id":"..."} | {"mode":"at_end"}. Legacy one-key shapes are also accepted.',
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
    expected_cell_source_sha256: optionalStringSchema,
  })
  .passthrough();

const formatCellInputSchema = z
  .object({
    notebook_uri: notebookUriSchema,
    cell_id: optionalStringSchema,
    expected_notebook_version: notebookVersionSchema,
    expected_cell_source_sha256: optionalStringSchema,
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
    timeout_ms: optionalNumberSchema,
    stop_on_error: optionalBooleanSchema,
    wait_for_completion: optionalBooleanSchema,
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

const singleNotebookInputSchema = z
  .object({
    notebook_uri: notebookUriSchema,
  })
  .passthrough();

const TOOL_HELP: Record<ToolName, ToolHelp> = {
  list_open_notebooks: {
    title: "List Open Notebooks",
    summary: "List Jupyter notebooks currently visible to the live editor bridge.",
    schema: "{}",
    examples: ['{}'],
  },
  describe_tool: {
    title: "Describe Tool",
    summary: "Return the exact input shape, examples, and notes for one tool or a compact index for all tools.",
    schema: '{"tool_name"?: "<tool-name>"}',
    examples: ['{}', '{"tool_name":"insert_cell"}'],
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
    summary: "Cheap per-cell previews for navigation, especially for code-heavy notebooks without useful headings. Returns no full source, no outputs, and includes source_sha256 for stale-safe patching.",
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
      '{"notebook_uri":"file:///.../demo.ipynb","cell_id":"cell-1","line":12,"column":9,"expected_cell_source_sha256"?: "<sha256>"}',
    examples: [
      '{"notebook_uri":"file:///workspace/demo.ipynb","cell_id":"cell-4","line":12,"column":9,"expected_cell_source_sha256":"<sha256>"}',
    ],
  },
  read_notebook: {
    title: "Read Notebook",
    summary:
      "Read live notebook cells. Outputs are excluded by default and cells include source_sha256. Rich rendered HTML/JS/widget output text is also omitted by default when outputs are included; set include_rich_output_text=true only if you need the raw payload. Use output_file_path to write the result to disk and keep it out of context.",
    schema:
      '{"notebook_uri":"file:///.../demo.ipynb","include_outputs"?:boolean,"include_rich_output_text"?:boolean,"output_file_path"?:"/tmp/notebook.json","range"?:{"start":0,"end":5},"cell_ids"?:["cell-1","cell-2"]}',
    examples: [
      '{"notebook_uri":"file:///workspace/demo.ipynb","range":{"start":10,"end":18}}',
      '{"notebook_uri":"file:///workspace/demo.ipynb","cell_ids":["cell-1"]}',
    ],
  },
  insert_cell: {
    title: "Insert Cell",
    summary: "Insert a new cell. Prefer the position.mode form. Returns only a compact mutation receipt, not the whole notebook.",
    schema:
      '{"notebook_uri":"file:///.../demo.ipynb","expected_notebook_version"?:7,"position":{"mode":"before_index","index":0}|{"mode":"before_cell_id","cell_id":"cell-1"}|{"mode":"after_cell_id","cell_id":"cell-1"}|{"mode":"at_end"},"cell":{"kind":"markdown"|"code","source":"...","language"?:string|null,"metadata"?:object}}',
    examples: [
      '{"notebook_uri":"file:///workspace/demo.ipynb","position":{"mode":"at_end"},"cell":{"kind":"code","language":"python","source":"print(1)"}}',
      '{"notebook_uri":"file:///workspace/demo.ipynb","position":{"mode":"after_cell_id","cell_id":"cell-1"},"cell":{"kind":"markdown","source":"## Notes"}}',
    ],
  },
  replace_cell_source: {
    title: "Replace Cell Source",
    summary: "Replace one cell source. Editing source does not change kernel state until code cells are executed. Returns a compact mutation receipt.",
    schema: '{"notebook_uri":"file:///.../demo.ipynb","cell_id":"cell-1","expected_notebook_version"?:7,"source":"..."}',
    examples: ['{"notebook_uri":"file:///workspace/demo.ipynb","cell_id":"cell-1","source":"print(2)"}'],
  },
  patch_cell_source: {
    title: "Patch Cell Source",
    summary: "Apply a patch to one cell without resending full source. Prefer expected_cell_source_sha256 from a recent read or preview to guard against stale cell state.",
    schema:
      '{"notebook_uri":"file:///.../demo.ipynb","cell_id":"cell-1","patch":"...","format"?: "auto"|"unified_diff"|"codex_apply_patch"|"search_replace_json","expected_notebook_version"?:7,"expected_cell_source_sha256"?: "<sha256>"}',
    examples: [
      '{"notebook_uri":"file:///workspace/demo.ipynb","cell_id":"cell-1","format":"unified_diff","patch":"@@\\n-print(x)\\n+print(x + 1)","expected_cell_source_sha256":"<sha256>"}',
      '{"notebook_uri":"file:///workspace/demo.ipynb","cell_id":"cell-1","format":"search_replace_json","patch":"[{\"old\":\"epochs=10\",\"new\":\"epochs=20\"}]","expected_cell_source_sha256":"<sha256>"}',
    ],
  },
  format_cell: {
    title: "Format Cell",
    summary: "Run the editor formatter on one cell if available. Use this after code edits. Formatting changes source only and clears stale outputs when source changes.",
    schema:
      '{"notebook_uri":"file:///.../demo.ipynb","cell_id":"cell-1","expected_notebook_version"?:7,"expected_cell_source_sha256"?: "<sha256>"}',
    examples: [
      '{"notebook_uri":"file:///workspace/demo.ipynb","cell_id":"cell-1","expected_cell_source_sha256":"<sha256>"}',
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
    summary: "Execute code cells. Executing mutates kernel state immediately; editing source alone does not. Re-run changed definitions and dependents. With stop_on_error=true, untouched later cells are reported as cancelled after the first failed cell instead of hanging until timeout.",
    schema:
      '{"notebook_uri":"file:///.../demo.ipynb","cell_ids":["cell-1"],"expected_notebook_version"?:7,"timeout_ms"?:30000,"stop_on_error"?:true,"wait_for_completion"?:true}',
    examples: [
      '{"notebook_uri":"file:///workspace/demo.ipynb","cell_ids":["cell-1"]}',
      '{"notebook_uri":"file:///workspace/demo.ipynb","cell_ids":["cell-1","cell-2"],"timeout_ms":45000,"stop_on_error":true,"wait_for_completion":true}',
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
      "Read normalized outputs for one cell. Prefer this over read_notebook(include_outputs=true) when you only need one cell's outputs. Rich rendered HTML/JS/widget output text is omitted by default; set include_rich_output_text=true only if you need the raw payload. Use output_file_path to write the result to disk and keep it out of context.",
    schema:
      '{"notebook_uri":"file:///.../demo.ipynb","cell_id":"cell-1","include_rich_output_text"?:boolean,"output_file_path"?:"/tmp/cell-output.json"}',
    examples: [
      '{"notebook_uri":"file:///workspace/demo.ipynb","cell_id":"cell-1"}',
      '{"notebook_uri":"file:///workspace/demo.ipynb","cell_id":"cell-1","include_rich_output_text":true}',
      '{"notebook_uri":"file:///workspace/demo.ipynb","cell_id":"cell-1","output_file_path":"/tmp/cell-output.json"}',
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

const NOTEBOOK_RULES = [
  "Keep context small: use notebook tools before shell or ad-hoc Python.",
  "Kernel state changes only when code cells execute.",
  "Editing source changes notebook text, not runtime state.",
  "For structured notebooks: get_notebook_outline first.",
  "For code-heavy notebooks: list_notebook_cells first.",
  "Use search_notebook or find_symbols before broad reads.",
  "Read only needed ranges or cell_ids, not whole notebooks.",
  "Use read_cell_outputs for one cell instead of full outputs.",
  "Rich rendered HTML/JS/widget outputs are omitted by default.",
  "Only request include_rich_output_text when raw rendered payload is necessary.",
  "Use output_file_path to route heavy results to disk instead of context.",
  "Page variables with query, offset, and max_results.",
  "Use search_notebook for text, find_symbols for semantic names.",
  "Use get_diagnostics for editor errors. Runtime errors are in outputs.",
  "Use select_kernel or select_jupyter_interpreter when the notebook kernel or Python environment needs user-driven setup.",
  "Use get_kernel_info or wait_for_kernel_ready to reason about a notebook's current kernel generation and readiness.",
  "Then use targeted read_notebook, go_to_definition, or read_cell_outputs.",
  "Notebook data may change between turns because the user can edit cells.",
  "Use notebook versions and source_sha256 values to avoid stale edits.",
];

export class NotebookTools {
  public constructor(
    private readonly getClient: () => Promise<NotebookBridgeClient>,
    private readonly log?: (message: string) => void,
  ) {}

  public register(server: McpServer): void {
    const register = (toolName: ToolName, inputSchema: z.ZodTypeAny, handler: (input: unknown) => Promise<unknown>): void => {
      server.registerTool(
        toolName,
        {
          title: TOOL_HELP[toolName].title,
          description: this.buildToolDescription(toolName),
          inputSchema,
        },
        async (input) => this.runTool(toolName, input, () => handler(input)),
      );
    };

    register("list_open_notebooks", permissiveObjectSchema, async (input) => {
      this.parseEmptyInput("list_open_notebooks", input);
      return (await this.getClient()).listOpenNotebooks();
    });

    register("describe_tool", z.object({ tool_name: toolNameSchema }).passthrough(), async (input) =>
      this.describeTool(this.parseDescribeToolInput(input).tool_name),
    );

    register("open_notebook", openNotebookInputSchema, async (input) =>
      (await this.getClient()).openNotebook(this.parseOpenNotebookRequest(input)),
    );

    register("get_notebook_outline", singleNotebookInputSchema, async (input) =>
      (await this.getClient()).getNotebookOutline(this.parseNotebookUriOnlyInput("get_notebook_outline", input).notebook_uri),
    );

    register("list_notebook_cells", listNotebookCellsInputSchema, async (input) =>
      (await this.getClient()).listNotebookCells(this.parseListNotebookCellsRequest(input)),
    );

    register("list_variables", listVariablesInputSchema, async (input) =>
      (await this.getClient()).listVariables(this.parseListVariablesRequest(input)),
    );

    register("search_notebook", searchNotebookInputSchema, async (input) =>
      (await this.getClient()).searchNotebook(this.parseSearchNotebookRequest(input)),
    );

    register("find_symbols", findSymbolsInputSchema, async (input) =>
      (await this.getClient()).findSymbols(this.parseFindSymbolsRequest(input)),
    );

    register("get_diagnostics", getDiagnosticsInputSchema, async (input) =>
      (await this.getClient()).getDiagnostics(this.parseGetDiagnosticsRequest(input)),
    );

    register("go_to_definition", goToDefinitionInputSchema, async (input) =>
      (await this.getClient()).goToDefinition(this.parseGoToDefinitionRequest(input)),
    );

    register("read_notebook", readNotebookInputSchema, async (input) => {
      const request = this.parseReadNotebookRequest(input);
      const result = await (await this.getClient()).readNotebook(request);
      return this.routeResultToFileIfRequested("read_notebook", result, request.output_file_path);
    });

    register("insert_cell", insertCellInputSchema, async (input) =>
      (await this.getClient()).insertCell(this.normalizeInsertCellRequest(input)),
    );

    register("replace_cell_source", replaceCellSourceInputSchema, async (input) =>
      (await this.getClient()).replaceCellSource(this.parseReplaceCellSourceRequest(input)),
    );

    register("patch_cell_source", patchCellSourceInputSchema, async (input) =>
      (await this.getClient()).patchCellSource(this.parsePatchCellSourceRequest(input)),
    );

    register("format_cell", formatCellInputSchema, async (input) =>
      (await this.getClient()).formatCell(this.parseFormatCellRequest(input)),
    );

    register("delete_cell", deleteCellInputSchema, async (input) =>
      (await this.getClient()).deleteCell(this.parseDeleteCellRequest(input)),
    );

    register("move_cell", moveCellInputSchema, async (input) =>
      (await this.getClient()).moveCell(this.parseMoveCellRequest(input)),
    );

    register("execute_cells", executeCellsInputSchema, async (input) =>
      (await this.getClient()).executeCells(this.parseExecuteCellsRequest(input)),
    );

    register("interrupt_execution", singleNotebookInputSchema, async (input) =>
      (await this.getClient()).interruptExecution(this.parseNotebookUriOnlyInput("interrupt_execution", input)),
    );

    register("restart_kernel", singleNotebookInputSchema, async (input) =>
      (await this.getClient()).restartKernel(this.parseNotebookUriOnlyInput("restart_kernel", input)),
    );

    register("wait_for_kernel_ready", waitForKernelReadyInputSchema, async (input) =>
      (await this.getClient()).waitForKernelReady(this.parseWaitForKernelReadyRequest(input)),
    );

    register("read_cell_outputs", readCellOutputsInputSchema, async (input) => {
      const request = this.parseReadCellOutputsRequest(input);
      const result = await (await this.getClient()).readCellOutputs(request);
      return this.routeResultToFileIfRequested("read_cell_outputs", result, request.output_file_path);
    });

    register("get_kernel_info", singleNotebookInputSchema, async (input) =>
      (await this.getClient()).getKernelInfo(this.parseNotebookUriOnlyInput("get_kernel_info", input).notebook_uri),
    );

    register("select_kernel", selectKernelInputSchema, async (input) =>
      (await this.getClient()).selectKernel(this.parseSelectKernelRequest(input)),
    );

    register("select_jupyter_interpreter", singleNotebookInputSchema, async (input) =>
      (await this.getClient()).selectJupyterInterpreter(
        this.parseNotebookUriOnlyInput("select_jupyter_interpreter", input),
      ),
    );

    register("summarize_notebook_state", singleNotebookInputSchema, async (input) =>
      (await this.getClient()).summarizeNotebookState(
        this.parseNotebookUriOnlyInput("summarize_notebook_state", input).notebook_uri,
      ),
    );
  }

  private buildToolDescription(toolName: ToolName): string {
    const help = TOOL_HELP[toolName];
    const examples = help.examples.map((example, index) => `${index + 1}. ${example}`).join("\n");
    const preferred =
      toolName === "describe_tool"
        ? ""
        : "Preferred notebook interface.\n\n";
    return `${preferred}${help.summary}\n\nSchema:\n${help.schema}\n\nExamples:\n${examples}`;
  }

  private describeTool(toolName?: ToolName): unknown {
    if (!toolName) {
      return {
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
      schema: TOOL_HELP[toolName].schema,
      examples: TOOL_HELP[toolName].examples,
      notebook_rules: NOTEBOOK_RULES,
    };
  }

  private parseEmptyInput(toolName: ToolName, input: unknown): void {
    const params = this.requireObject(input, toolName);
    this.assertKnownKeys(toolName, params, []);
  }

  private parseDescribeToolInput(input: unknown): { tool_name?: ToolName } {
    const toolName = "describe_tool";
    const params = this.requireObject(input, toolName);
    this.assertKnownKeys(toolName, params, ["tool_name"]);

    const candidate = params.tool_name;
    if (candidate === undefined) {
      return {};
    }

    return {
      tool_name: this.parseEnum(candidate, `${toolName}.tool_name`, TOOL_NAMES),
    };
  }

  private parseOpenNotebookRequest(input: unknown): OpenNotebookRequest {
    const toolName = "open_notebook";
    const params = this.requireObject(input, toolName);
    this.assertKnownKeys(toolName, params, ["notebook_uri", "view_column"]);

    return {
      notebook_uri: this.requiredString(params.notebook_uri, `${toolName}.notebook_uri`),
      view_column:
        params.view_column === undefined
          ? undefined
          : this.parseEnum(params.view_column, `${toolName}.view_column`, ["active", "beside"]),
    };
  }

  private parseReadNotebookRequest(input: unknown): ReadNotebookToolRequest {
    const toolName = "read_notebook";
    const params = this.requireObject(input, toolName);
    this.assertKnownKeys(toolName, params, [
      "notebook_uri",
      "include_outputs",
      "include_rich_output_text",
      "output_file_path",
      "range",
      "cell_ids",
    ]);

    return {
      notebook_uri: this.requiredString(params.notebook_uri, `${toolName}.notebook_uri`),
      include_outputs:
        params.include_outputs === undefined
          ? undefined
          : this.requiredBoolean(params.include_outputs, `${toolName}.include_outputs`),
      include_rich_output_text:
        params.include_rich_output_text === undefined
          ? undefined
          : this.requiredBoolean(params.include_rich_output_text, `${toolName}.include_rich_output_text`),
      output_file_path:
        params.output_file_path === undefined
          ? undefined
          : this.requiredString(params.output_file_path, `${toolName}.output_file_path`),
      range: params.range === undefined ? undefined : this.parseRange(toolName, params.range),
      cell_ids: params.cell_ids === undefined ? undefined : this.requiredStringArray(params.cell_ids, `${toolName}.cell_ids`),
    };
  }

  private parseListNotebookCellsRequest(input: unknown): ListNotebookCellsRequest {
    const toolName = "list_notebook_cells";
    const params = this.requireObject(input, toolName);
    this.assertKnownKeys(toolName, params, ["notebook_uri", "range", "cell_ids"]);

    return {
      notebook_uri: this.requiredString(params.notebook_uri, `${toolName}.notebook_uri`),
      range: params.range === undefined ? undefined : this.parseRange(toolName, params.range),
      cell_ids: params.cell_ids === undefined ? undefined : this.requiredStringArray(params.cell_ids, `${toolName}.cell_ids`),
    };
  }

  private parseListVariablesRequest(input: unknown): ListNotebookVariablesRequest {
    const toolName = "list_variables";
    const params = this.requireObject(input, toolName);
    this.assertKnownKeys(toolName, params, ["notebook_uri", "query", "offset", "max_results"]);

    return {
      notebook_uri: this.requiredString(params.notebook_uri, `${toolName}.notebook_uri`),
      query: params.query === undefined ? undefined : this.requiredString(params.query, `${toolName}.query`),
      offset: params.offset === undefined ? undefined : this.requiredNonNegativeInteger(params.offset, `${toolName}.offset`),
      max_results:
        params.max_results === undefined ? undefined : this.requiredPositiveInteger(params.max_results, `${toolName}.max_results`),
    };
  }

  private parseSearchNotebookRequest(input: unknown): SearchNotebookRequest {
    const toolName = "search_notebook";
    const params = this.requireObject(input, toolName);
    this.assertKnownKeys(toolName, params, [
      "notebook_uri",
      "query",
      "case_sensitive",
      "regex",
      "whole_word",
      "max_results",
      "range",
      "cell_ids",
      "cell_kind",
    ]);

    return {
      notebook_uri: this.requiredString(params.notebook_uri, `${toolName}.notebook_uri`),
      query: this.requiredString(params.query, `${toolName}.query`),
      case_sensitive:
        params.case_sensitive === undefined ? undefined : this.requiredBoolean(params.case_sensitive, `${toolName}.case_sensitive`),
      regex: params.regex === undefined ? undefined : this.requiredBoolean(params.regex, `${toolName}.regex`),
      whole_word:
        params.whole_word === undefined ? undefined : this.requiredBoolean(params.whole_word, `${toolName}.whole_word`),
      max_results:
        params.max_results === undefined ? undefined : this.requiredPositiveInteger(params.max_results, `${toolName}.max_results`),
      range: params.range === undefined ? undefined : this.parseRange(toolName, params.range),
      cell_ids: params.cell_ids === undefined ? undefined : this.requiredStringArray(params.cell_ids, `${toolName}.cell_ids`),
      cell_kind:
        params.cell_kind === undefined
          ? undefined
          : this.parseEnum(params.cell_kind, `${toolName}.cell_kind`, ["code", "markdown"]),
    };
  }

  private parseFindSymbolsRequest(input: unknown): FindSymbolsRequest {
    const toolName = "find_symbols";
    const params = this.requireObject(input, toolName);
    this.assertKnownKeys(toolName, params, ["notebook_uri", "query", "max_results", "range", "cell_ids"]);

    return {
      notebook_uri: this.requiredString(params.notebook_uri, `${toolName}.notebook_uri`),
      query: params.query === undefined ? undefined : this.requiredString(params.query, `${toolName}.query`),
      max_results:
        params.max_results === undefined ? undefined : this.requiredPositiveInteger(params.max_results, `${toolName}.max_results`),
      range: params.range === undefined ? undefined : this.parseRange(toolName, params.range),
      cell_ids: params.cell_ids === undefined ? undefined : this.requiredStringArray(params.cell_ids, `${toolName}.cell_ids`),
    };
  }

  private parseGetDiagnosticsRequest(input: unknown): NotebookDiagnosticsRequest {
    const toolName = "get_diagnostics";
    const params = this.requireObject(input, toolName);
    this.assertKnownKeys(toolName, params, ["notebook_uri", "severities", "max_results", "range", "cell_ids"]);

    return {
      notebook_uri: this.requiredString(params.notebook_uri, `${toolName}.notebook_uri`),
      severities:
        params.severities === undefined
          ? undefined
          : this.requiredEnumArray(params.severities, `${toolName}.severities`, [
              "error",
              "warning",
              "information",
              "hint",
            ]),
      max_results:
        params.max_results === undefined ? undefined : this.requiredPositiveInteger(params.max_results, `${toolName}.max_results`),
      range: params.range === undefined ? undefined : this.parseRange(toolName, params.range),
      cell_ids: params.cell_ids === undefined ? undefined : this.requiredStringArray(params.cell_ids, `${toolName}.cell_ids`),
    };
  }

  private parseGoToDefinitionRequest(input: unknown): GoToDefinitionRequest {
    const toolName = "go_to_definition";
    const params = this.requireObject(input, toolName);
    this.assertKnownKeys(toolName, params, ["notebook_uri", "cell_id", "line", "column", "expected_cell_source_sha256"]);

    return {
      notebook_uri: this.requiredString(params.notebook_uri, `${toolName}.notebook_uri`),
      cell_id: this.requiredString(params.cell_id, `${toolName}.cell_id`),
      line: this.requiredPositiveInteger(params.line, `${toolName}.line`),
      column: this.requiredPositiveInteger(params.column, `${toolName}.column`),
      expected_cell_source_sha256:
        params.expected_cell_source_sha256 === undefined
          ? undefined
          : this.requiredString(params.expected_cell_source_sha256, `${toolName}.expected_cell_source_sha256`),
    };
  }

  private normalizeInsertCellRequest(input: unknown): InsertCellRequest {
    const toolName = "insert_cell";
    const params = this.requireObject(input, toolName);
    this.assertKnownKeys(toolName, params, ["notebook_uri", "expected_notebook_version", "position", "cell"]);

    return {
      notebook_uri: this.requiredString(params.notebook_uri, `${toolName}.notebook_uri`),
      expected_notebook_version:
        params.expected_notebook_version === undefined
          ? undefined
          : this.requiredInteger(params.expected_notebook_version, `${toolName}.expected_notebook_version`),
      position: this.normalizeInsertCellPosition(this.requireObject(params.position, toolName, "position")),
      cell: this.parseCell(toolName, params.cell),
    };
  }

  private parseReplaceCellSourceRequest(input: unknown): ReplaceCellSourceRequest {
    const toolName = "replace_cell_source";
    const params = this.requireObject(input, toolName);
    this.assertKnownKeys(toolName, params, ["notebook_uri", "cell_id", "expected_notebook_version", "source"]);

    return {
      notebook_uri: this.requiredString(params.notebook_uri, `${toolName}.notebook_uri`),
      cell_id: this.requiredString(params.cell_id, `${toolName}.cell_id`),
      expected_notebook_version:
        params.expected_notebook_version === undefined
          ? undefined
          : this.requiredInteger(params.expected_notebook_version, `${toolName}.expected_notebook_version`),
      source: this.requiredString(params.source, `${toolName}.source`),
    };
  }

  private parsePatchCellSourceRequest(input: unknown): PatchCellSourceRequest {
    const toolName = "patch_cell_source";
    const params = this.requireObject(input, toolName);
    this.assertKnownKeys(toolName, params, [
      "notebook_uri",
      "cell_id",
      "patch",
      "format",
      "expected_notebook_version",
      "expected_cell_source_sha256",
    ]);

    return {
      notebook_uri: this.requiredString(params.notebook_uri, `${toolName}.notebook_uri`),
      cell_id: this.requiredString(params.cell_id, `${toolName}.cell_id`),
      patch: this.requiredString(params.patch, `${toolName}.patch`),
      format:
        params.format === undefined
          ? undefined
          : this.parseEnum(params.format, `${toolName}.format`, [
              "auto",
              "unified_diff",
              "codex_apply_patch",
              "search_replace_json",
            ]),
      expected_notebook_version:
        params.expected_notebook_version === undefined
          ? undefined
          : this.requiredInteger(params.expected_notebook_version, `${toolName}.expected_notebook_version`),
      expected_cell_source_sha256:
        params.expected_cell_source_sha256 === undefined
          ? undefined
          : this.requiredString(params.expected_cell_source_sha256, `${toolName}.expected_cell_source_sha256`),
    };
  }

  private parseFormatCellRequest(input: unknown): FormatCellRequest {
    const toolName = "format_cell";
    const params = this.requireObject(input, toolName);
    this.assertKnownKeys(toolName, params, [
      "notebook_uri",
      "cell_id",
      "expected_notebook_version",
      "expected_cell_source_sha256",
    ]);

    return {
      notebook_uri: this.requiredString(params.notebook_uri, `${toolName}.notebook_uri`),
      cell_id: this.requiredString(params.cell_id, `${toolName}.cell_id`),
      expected_notebook_version:
        params.expected_notebook_version === undefined
          ? undefined
          : this.requiredInteger(params.expected_notebook_version, `${toolName}.expected_notebook_version`),
      expected_cell_source_sha256:
        params.expected_cell_source_sha256 === undefined
          ? undefined
          : this.requiredString(params.expected_cell_source_sha256, `${toolName}.expected_cell_source_sha256`),
    };
  }

  private parseDeleteCellRequest(input: unknown): DeleteCellRequest {
    const toolName = "delete_cell";
    const params = this.requireObject(input, toolName);
    this.assertKnownKeys(toolName, params, ["notebook_uri", "cell_id", "expected_notebook_version"]);

    return {
      notebook_uri: this.requiredString(params.notebook_uri, `${toolName}.notebook_uri`),
      cell_id: this.requiredString(params.cell_id, `${toolName}.cell_id`),
      expected_notebook_version:
        params.expected_notebook_version === undefined
          ? undefined
          : this.requiredInteger(params.expected_notebook_version, `${toolName}.expected_notebook_version`),
    };
  }

  private parseMoveCellRequest(input: unknown): MoveCellRequest {
    const toolName = "move_cell";
    const params = this.requireObject(input, toolName);
    this.assertKnownKeys(toolName, params, ["notebook_uri", "cell_id", "expected_notebook_version", "target_index"]);

    return {
      notebook_uri: this.requiredString(params.notebook_uri, `${toolName}.notebook_uri`),
      cell_id: this.requiredString(params.cell_id, `${toolName}.cell_id`),
      expected_notebook_version:
        params.expected_notebook_version === undefined
          ? undefined
          : this.requiredInteger(params.expected_notebook_version, `${toolName}.expected_notebook_version`),
      target_index: this.requiredNonNegativeInteger(params.target_index, `${toolName}.target_index`),
    };
  }

  private parseExecuteCellsRequest(input: unknown): ExecuteCellsRequest {
    const toolName = "execute_cells";
    const params = this.requireObject(input, toolName);
    this.assertKnownKeys(toolName, params, [
      "notebook_uri",
      "cell_ids",
      "expected_notebook_version",
      "timeout_ms",
      "stop_on_error",
      "wait_for_completion",
    ]);

    const waitForCompletion =
      params.wait_for_completion === undefined
        ? undefined
        : this.requiredBoolean(params.wait_for_completion, `${toolName}.wait_for_completion`);
    if (waitForCompletion === false) {
      this.failValidation(toolName, "wait_for_completion may be omitted or set to true, but false is not supported.");
    }

    return {
      notebook_uri: this.requiredString(params.notebook_uri, `${toolName}.notebook_uri`),
      cell_ids: this.requiredStringArray(params.cell_ids, `${toolName}.cell_ids`),
      expected_notebook_version:
        params.expected_notebook_version === undefined
          ? undefined
          : this.requiredInteger(params.expected_notebook_version, `${toolName}.expected_notebook_version`),
      timeout_ms:
        params.timeout_ms === undefined ? undefined : this.requiredPositiveInteger(params.timeout_ms, `${toolName}.timeout_ms`),
      stop_on_error:
        params.stop_on_error === undefined ? undefined : this.requiredBoolean(params.stop_on_error, `${toolName}.stop_on_error`),
      wait_for_completion: waitForCompletion ? true : undefined,
    };
  }

  private parseSelectKernelRequest(input: unknown): SelectKernelRequest {
    const toolName = "select_kernel";
    const params = this.requireObject(input, toolName);
    this.assertKnownKeys(toolName, params, ["notebook_uri", "kernel_id", "extension_id", "skip_if_already_selected"]);

    const kernelId =
      params.kernel_id === undefined ? undefined : this.requiredString(params.kernel_id, `${toolName}.kernel_id`);
    const extensionId =
      params.extension_id === undefined ? undefined : this.requiredString(params.extension_id, `${toolName}.extension_id`);

    if ((kernelId && !extensionId) || (!kernelId && extensionId)) {
      this.failValidation(toolName, "kernel_id and extension_id must be provided together for direct kernel selection.");
    }

    return {
      notebook_uri: this.requiredString(params.notebook_uri, `${toolName}.notebook_uri`),
      kernel_id: kernelId,
      extension_id: extensionId,
      skip_if_already_selected:
        params.skip_if_already_selected === undefined
          ? undefined
          : this.requiredBoolean(params.skip_if_already_selected, `${toolName}.skip_if_already_selected`),
    };
  }

  private parseWaitForKernelReadyRequest(input: unknown): WaitForKernelReadyRequest {
    const toolName = "wait_for_kernel_ready";
    const params = this.requireObject(input, toolName);
    this.assertKnownKeys(toolName, params, ["notebook_uri", "timeout_ms", "target_generation"]);

    return {
      notebook_uri: this.requiredString(params.notebook_uri, `${toolName}.notebook_uri`),
      timeout_ms:
        params.timeout_ms === undefined
          ? undefined
          : this.requiredPositiveInteger(params.timeout_ms, `${toolName}.timeout_ms`),
      target_generation:
        params.target_generation === undefined
          ? undefined
          : this.requiredNonNegativeInteger(params.target_generation, `${toolName}.target_generation`),
    };
  }

  private parseReadCellOutputsRequest(input: unknown): ReadCellOutputsToolRequest {
    const toolName = "read_cell_outputs";
    const params = this.requireObject(input, toolName);
    this.assertKnownKeys(toolName, params, ["notebook_uri", "cell_id", "include_rich_output_text", "output_file_path"]);

    return {
      notebook_uri: this.requiredString(params.notebook_uri, `${toolName}.notebook_uri`),
      cell_id: this.requiredString(params.cell_id, `${toolName}.cell_id`),
      include_rich_output_text:
        params.include_rich_output_text === undefined
          ? undefined
          : this.requiredBoolean(params.include_rich_output_text, `${toolName}.include_rich_output_text`),
      output_file_path:
        params.output_file_path === undefined
          ? undefined
          : this.requiredString(params.output_file_path, `${toolName}.output_file_path`),
    };
  }

  private parseNotebookUriOnlyInput(
    toolName: Extract<
      ToolName,
      | "get_notebook_outline"
      | "interrupt_execution"
      | "restart_kernel"
      | "get_kernel_info"
      | "select_jupyter_interpreter"
      | "summarize_notebook_state"
    >,
    input: unknown,
  ): {
    notebook_uri: string;
  } {
    const params = this.requireObject(input, toolName);
    this.assertKnownKeys(toolName, params, ["notebook_uri"]);
    return {
      notebook_uri: this.requiredString(params.notebook_uri, `${toolName}.notebook_uri`),
    };
  }

  private parseRange(toolName: ToolName, value: unknown): { start: number; end: number } {
    const range = this.requireObject(value, toolName, "range");
    this.assertKnownKeys(toolName, range, ["start", "end"], "range");

    return {
      start: this.requiredInteger(range.start, `${toolName}.range.start`),
      end: this.requiredInteger(range.end, `${toolName}.range.end`),
    };
  }

  private async routeResultToFileIfRequested(
    toolName: "read_notebook" | "read_cell_outputs",
    result: unknown,
    outputFilePath?: string,
  ): Promise<unknown> {
    if (!outputFilePath) {
      return result;
    }

    const resolvedPath = path.resolve(outputFilePath);
    const serialized = `${JSON.stringify(result, null, 2)}\n`;
    await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
    await fs.writeFile(resolvedPath, serialized, "utf8");

    return {
      written_to_file: true,
      tool: toolName,
      output_file_path: resolvedPath,
      bytes_written: Buffer.byteLength(serialized),
      summary: "Result written to file and omitted from MCP text content.",
    };
  }

  private parseCell(toolName: ToolName, value: unknown): NotebookCellInput {
    const cell = this.requireObject(value, toolName, "cell");
    this.assertKnownKeys(toolName, cell, ["kind", "language", "source", "metadata"], "cell");

    const kind = this.parseEnum(cell.kind, `${toolName}.cell.kind`, ["markdown", "code"]);
    const languageValue = cell.language;
    const metadataValue = cell.metadata;

    const parsedCell: NotebookCellInput = {
      kind,
      source: this.requiredString(cell.source, `${toolName}.cell.source`),
    };

    if (languageValue !== undefined) {
      parsedCell.language =
        languageValue === null ? null : this.requiredString(languageValue, `${toolName}.cell.language`);
    }

    if (metadataValue !== undefined) {
      parsedCell.metadata = this.requiredPlainObject(metadataValue, `${toolName}.cell.metadata`);
    }

    return parsedCell;
  }

  private normalizeInsertCellPosition(position: Record<string, unknown>): InsertCellRequest["position"] {
    const toolName = "insert_cell";
    if ("mode" in position) {
      return this.normalizeModeInsertPosition(position);
    }

    const keys = Object.keys(position);
    if (keys.length !== 1) {
      this.failValidation(
        toolName,
        'position must be exactly one preferred shape like {"mode":"after_cell_id","cell_id":"cell-1"} or one legacy one-key object like {"after_cell_id":"cell-1"}.',
      );
    }

    const key = keys[0] as string;
    const value = position[key];
    switch (key) {
      case "before_index":
        return { before_index: this.requiredNonNegativeInteger(value, "insert_cell.position.before_index") };
      case "before_cell_id":
        return { before_cell_id: this.requiredString(value, "insert_cell.position.before_cell_id") };
      case "after_cell_id":
        return { after_cell_id: this.requiredString(value, "insert_cell.position.after_cell_id") };
      case "at_end":
        if (value !== true) {
          this.failValidation(toolName, 'Legacy position {"at_end":true} requires the boolean value true.');
        }
        return { at_end: true };
      default:
        this.failValidation(toolName, this.unknownPositionKeyMessage(key));
    }
  }

  private normalizeModeInsertPosition(position: Record<string, unknown>): InsertCellRequest["position"] {
    const toolName = "insert_cell";
    const mode = position.mode;
    if (typeof mode !== "string") {
      this.failValidation(
        toolName,
        'position.mode must be one of "before_index", "before_cell_id", "after_cell_id", or "at_end".',
      );
    }

    switch (mode) {
      case "before_index":
        this.assertKnownKeys(toolName, position, ["mode", "index"], "position");
        return { before_index: this.requiredNonNegativeInteger(position.index, "insert_cell.position.index") };
      case "before_cell_id":
        this.assertKnownKeys(toolName, position, ["mode", "cell_id"], "position");
        return { before_cell_id: this.requiredString(position.cell_id, "insert_cell.position.cell_id") };
      case "after_cell_id":
        this.assertKnownKeys(toolName, position, ["mode", "cell_id"], "position");
        return { after_cell_id: this.requiredString(position.cell_id, "insert_cell.position.cell_id") };
      case "at_end":
        this.assertKnownKeys(toolName, position, ["mode"], "position");
        return { at_end: true };
      default: {
        const suggestion = this.closestMatch(mode, ["before_index", "before_cell_id", "after_cell_id", "at_end"]);
        const message = suggestion
          ? `Unknown position.mode "${mode}"; did you mean "${suggestion}"?`
          : `Unknown position.mode "${mode}". Expected "before_index", "before_cell_id", "after_cell_id", or "at_end".`;
        this.failValidation(toolName, message);
      }
    }
  }

  private requireObject(input: unknown, toolName: ToolName, label = "arguments"): ToolInput {
    if (input && typeof input === "object" && !Array.isArray(input)) {
      return input as ToolInput;
    }

    if (input === undefined || input === null) {
      return {};
    }

    this.failValidation(toolName, `${label} must be an object.`);
  }

  private requiredPlainObject(value: unknown, label: string): Record<string, unknown> {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }

    throw new Error(`${label} must be an object.`);
  }

  private requiredString(value: unknown, label: string): string {
    if (typeof value === "string" && value.length > 0) {
      return value;
    }

    throw new Error(`${label} must be a non-empty string.`);
  }

  private requiredBoolean(value: unknown, label: string): boolean {
    if (typeof value === "boolean") {
      return value;
    }

    throw new Error(`${label} must be a boolean.`);
  }

  private requiredInteger(value: unknown, label: string): number {
    if (typeof value === "number" && Number.isInteger(value)) {
      return value;
    }

    throw new Error(`${label} must be an integer.`);
  }

  private requiredNonNegativeInteger(value: unknown, label: string): number {
    if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
      return value;
    }

    throw new Error(`${label} must be a non-negative integer.`);
  }

  private requiredPositiveInteger(value: unknown, label: string): number {
    if (typeof value === "number" && Number.isInteger(value) && value > 0) {
      return value;
    }

    throw new Error(`${label} must be a positive integer.`);
  }

  private requiredStringArray(value: unknown, label: string): string[] {
    if (Array.isArray(value) && value.every((entry) => typeof entry === "string" && entry.length > 0)) {
      return value;
    }

    throw new Error(`${label} must be an array of non-empty strings.`);
  }

  private requiredEnumArray<const TValue extends readonly string[]>(
    value: unknown,
    label: string,
    candidates: TValue,
  ): TValue[number][] {
    if (!Array.isArray(value)) {
      throw new Error(`${label} must be an array.`);
    }

    return value.map((entry, index) => this.parseEnum(entry, `${label}[${index}]`, candidates));
  }

  private parseEnum<const TValue extends readonly string[]>(value: unknown, label: string, candidates: TValue): TValue[number] {
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(`${label} must be one of ${candidates.map((candidate) => `"${candidate}"`).join(", ")}.`);
    }

    const match = candidates.find((candidate) => candidate === value);
    if (match) {
      return match;
    }

    const suggestion = this.closestMatch(value, candidates);
    if (suggestion) {
      throw new Error(`${label} has invalid value "${value}"; did you mean "${suggestion}"?`);
    }

    throw new Error(`${label} must be one of ${candidates.map((candidate) => `"${candidate}"`).join(", ")}.`);
  }

  private assertKnownKeys(toolName: ToolName, value: ToolInput, allowedKeys: readonly string[], parentLabel?: string): void {
    const allowed = new Set(allowedKeys);
    const unknownKey = Object.keys(value).find((key) => !allowed.has(key));
    if (!unknownKey) {
      return;
    }

    const suggestion = this.closestMatch(unknownKey, allowedKeys);
    if (suggestion) {
      this.failValidation(
        toolName,
        `Unknown key "${unknownKey}"${parentLabel ? ` in ${parentLabel}` : ""}; expected "${suggestion}".`,
      );
    }

    this.failValidation(
      toolName,
      `Unknown key "${unknownKey}"${parentLabel ? ` in ${parentLabel}` : ""}. Allowed keys: ${allowedKeys.join(", ") || "(none)"}.`,
    );
  }

  private unknownPositionKeyMessage(key: string): string {
    const suggestion = ({ after: "after_cell_id", before: "before_cell_id", index: "before_index" } as const)[
      key as "after" | "before" | "index"
    ] ?? this.closestMatch(key, ["before_index", "before_cell_id", "after_cell_id", "at_end"]);

    if (suggestion) {
      return `Unknown key "${key}"; expected "${suggestion}".`;
    }

    return 'Unknown key in position. Expected one of "before_index", "before_cell_id", "after_cell_id", or "at_end".';
  }

  private closestMatch(value: string, candidates: readonly string[]): string | undefined {
    let bestCandidate: string | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const candidate of candidates) {
      const distance = this.levenshteinDistance(value, candidate);
      if (distance < bestDistance) {
        bestCandidate = candidate;
        bestDistance = distance;
      }
    }

    if (!bestCandidate) {
      return undefined;
    }

    const threshold = Math.max(3, Math.floor(bestCandidate.length / 2));
    return bestDistance <= threshold ? bestCandidate : undefined;
  }

  private levenshteinDistance(left: string, right: string): number {
    const rows = left.length + 1;
    const columns = right.length + 1;
    const matrix = Array.from({ length: rows }, () => Array<number>(columns).fill(0));

    for (let row = 0; row < rows; row += 1) {
      matrix[row][0] = row;
    }
    for (let column = 0; column < columns; column += 1) {
      matrix[0][column] = column;
    }

    for (let row = 1; row < rows; row += 1) {
      for (let column = 1; column < columns; column += 1) {
        const substitutionCost = left[row - 1] === right[column - 1] ? 0 : 1;
        matrix[row][column] = Math.min(
          matrix[row - 1][column] + 1,
          matrix[row][column - 1] + 1,
          matrix[row - 1][column - 1] + substitutionCost,
        );
      }
    }

    return matrix[left.length][right.length];
  }

  private failValidation(toolName: ToolName, message: string): never {
    throw new Error(`Invalid arguments for tool ${toolName}: ${message}`);
  }

  private async runTool<T>(toolName: ToolName, input: unknown, operation: () => Promise<T>): Promise<CallToolResult> {
    const startedAt = Date.now();
    this.log?.(`tool request name=${toolName}${this.summarizeToolInput(input)}`);
    try {
      const result = await operation();
      this.log?.(`tool response name=${toolName} elapsed_ms=${Date.now() - startedAt}`);
      return this.toToolResult(result);
    } catch (error) {
      const bridgeError = asBridgeError(error);
      this.log?.(
        `tool error name=${toolName} elapsed_ms=${Date.now() - startedAt} code=${bridgeError.code} message=${JSON.stringify(bridgeError.message)}`,
      );
      return this.toErrorToolResult(error);
    }
  }

  private summarizeToolInput(input: unknown): string {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return "";
    }

    const record = input as Record<string, unknown>;
    const parts: string[] = [];
    const notebookUri = this.shortString(record.notebook_uri);
    if (notebookUri) {
      parts.push(` notebook_uri=${notebookUri}`);
    }
    const query = this.shortString(record.query, 80);
    if (query) {
      parts.push(` query=${query}`);
    }
    if (typeof record.max_results === "number") {
      parts.push(` max_results=${record.max_results}`);
    }
    if (typeof record.offset === "number") {
      parts.push(` offset=${record.offset}`);
    }
    if (Array.isArray(record.cell_ids)) {
      parts.push(` cell_ids=${record.cell_ids.length}`);
    }
    if (typeof record.cell_id === "string") {
      parts.push(` cell_id=${this.shortString(record.cell_id)}`);
    }

    return parts.join("");
  }

  private shortString(value: unknown, maxLength = 120): string | null {
    if (typeof value !== "string" || value.length === 0) {
      return null;
    }

    if (value.length <= maxLength) {
      return JSON.stringify(value);
    }

    return JSON.stringify(`${value.slice(0, maxLength - 1)}…`);
  }

  private toToolResult(result: unknown): CallToolResult {
    const images: ImageContent[] = [];
    const textResult = this.serializeForTextContent(result, images);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(textResult, null, 2),
        },
        ...images,
      ],
    };
  }

  private toErrorToolResult(error: unknown): CallToolResult {
    const bridgeError =
      error instanceof Error && error.message.startsWith("Invalid arguments for tool")
        ? {
            code: "InvalidRequest",
            message: error.message,
            recoverable: true,
          }
        : asBridgeError(error);

    return {
      isError: true,
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: bridgeError }, null, 2),
        },
      ],
    };
  }

  private serializeForTextContent(value: unknown, images: ImageContent[]): unknown {
    if (this.isNormalizedImageOutput(value)) {
      const imageIndex = images.length + 1;
      images.push({
        type: "image",
        data: value.base64,
        mimeType: value.mime,
      });

      return {
        ...value,
        base64: `[omitted: see MCP image content ${imageIndex}]`,
        mcp_image_index: imageIndex,
      };
    }

    if (Array.isArray(value)) {
      return value.map((entry) => this.serializeForTextContent(entry, images));
    }

    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [key, this.serializeForTextContent(entry, images)]),
      );
    }

    return value;
  }

  private isNormalizedImageOutput(
    value: unknown,
  ): value is NormalizedOutput & { kind: "image"; mime: string; base64: string } {
    if (!value || typeof value !== "object") {
      return false;
    }

    const candidate = value as Partial<NormalizedOutput>;
    return candidate.kind === "image" && typeof candidate.mime === "string" && typeof candidate.base64 === "string";
  }
}
