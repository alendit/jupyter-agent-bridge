import {
  DeleteCellRequest,
  ExecuteCellsRequest,
  InsertCellRequest,
  MoveCellRequest,
  NormalizedOutput,
  OpenNotebookRequest,
  ReadCellOutputsRequest,
  ReadNotebookRequest,
  ReplaceCellSourceRequest,
} from "../../../packages/protocol/src";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult, ImageContent } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { NotebookBridgeClient } from "../bridge/NotebookBridgeClient";

const TOOL_NAMES = [
  "list_open_notebooks",
  "describe_tool",
  "open_notebook",
  "read_notebook",
  "insert_cell",
  "replace_cell_source",
  "delete_cell",
  "move_cell",
  "execute_cells",
  "read_cell_outputs",
  "get_kernel_info",
  "summarize_notebook_state",
] as const;

type ToolName = (typeof TOOL_NAMES)[number];

const toolNameSchema = z.enum(TOOL_NAMES);

const emptyInputSchema = z.object({}).strict();
const notebookUriSchema = z.string().describe("Absolute notebook URI, for example file:///workspace/demo.ipynb");
const notebookCellSchema = z
  .object({
    kind: z.enum(["markdown", "code"]),
    language: z.string().nullable().optional(),
    source: z.string(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();
const insertCellInputSchema = z
  .object({
    notebook_uri: notebookUriSchema,
    expected_notebook_version: z.number().int().optional(),
    position: z
      .object({})
      .catchall(z.unknown())
      .describe(
        'Preferred shape: {"mode":"before_index","index":0} | {"mode":"before_cell_id","cell_id":"..."} | {"mode":"after_cell_id","cell_id":"..."} | {"mode":"at_end"}. Legacy one-key shapes are also accepted.',
      ),
    cell: notebookCellSchema,
  })
  .strict();

interface ToolHelp {
  title: string;
  summary: string;
  schema: string;
  examples: string[];
}

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
    summary: "Open a notebook in the live editor session.",
    schema: '{"notebook_uri":"file:///.../demo.ipynb","view_column"?: "active"|"beside"}',
    examples: [
      '{"notebook_uri":"file:///workspace/demo.ipynb"}',
      '{"notebook_uri":"file:///workspace/demo.ipynb","view_column":"beside"}',
    ],
  },
  read_notebook: {
    title: "Read Notebook",
    summary: "Read the live notebook state. `cell_ids` is more specific than `range` if both are provided.",
    schema:
      '{"notebook_uri":"file:///.../demo.ipynb","include_outputs"?:boolean,"range"?:{"start":0,"end":5},"cell_ids"?:["cell-1","cell-2"]}',
    examples: [
      '{"notebook_uri":"file:///workspace/demo.ipynb","include_outputs":true}',
      '{"notebook_uri":"file:///workspace/demo.ipynb","cell_ids":["cell-1"]}',
    ],
  },
  insert_cell: {
    title: "Insert Cell",
    summary: "Insert a new cell. Prefer the `position.mode` form instead of legacy one-key union objects.",
    schema:
      '{"notebook_uri":"file:///.../demo.ipynb","expected_notebook_version"?:7,"position":{"mode":"before_index","index":0}|{"mode":"before_cell_id","cell_id":"cell-1"}|{"mode":"after_cell_id","cell_id":"cell-1"}|{"mode":"at_end"},"cell":{"kind":"markdown"|"code","source":"...","language"?:string|null,"metadata"?:object}}',
    examples: [
      '{"notebook_uri":"file:///workspace/demo.ipynb","position":{"mode":"at_end"},"cell":{"kind":"code","language":"python","source":"print(1)"}}',
      '{"notebook_uri":"file:///workspace/demo.ipynb","position":{"mode":"after_cell_id","cell_id":"cell-1"},"cell":{"kind":"markdown","source":"## Notes"}}',
    ],
  },
  replace_cell_source: {
    title: "Replace Cell Source",
    summary: "Replace the source text of one existing cell.",
    schema: '{"notebook_uri":"file:///.../demo.ipynb","cell_id":"cell-1","expected_notebook_version"?:7,"source":"..."}',
    examples: [
      '{"notebook_uri":"file:///workspace/demo.ipynb","cell_id":"cell-1","source":"print(2)"}',
    ],
  },
  delete_cell: {
    title: "Delete Cell",
    summary: "Delete one cell from the live notebook.",
    schema: '{"notebook_uri":"file:///.../demo.ipynb","cell_id":"cell-1","expected_notebook_version"?:7}',
    examples: ['{"notebook_uri":"file:///workspace/demo.ipynb","cell_id":"cell-1"}'],
  },
  move_cell: {
    title: "Move Cell",
    summary: "Move one cell to a target notebook index.",
    schema: '{"notebook_uri":"file:///.../demo.ipynb","cell_id":"cell-1","target_index":0,"expected_notebook_version"?:7}',
    examples: ['{"notebook_uri":"file:///workspace/demo.ipynb","cell_id":"cell-1","target_index":0}'],
  },
  execute_cells: {
    title: "Execute Cells",
    summary: "Execute one or more code cells and return normalized outputs, including native MCP image blocks.",
    schema:
      '{"notebook_uri":"file:///.../demo.ipynb","cell_ids":["cell-1"],"expected_notebook_version"?:7,"timeout_ms"?:30000,"wait_for_completion"?:true}',
    examples: [
      '{"notebook_uri":"file:///workspace/demo.ipynb","cell_ids":["cell-1"]}',
      '{"notebook_uri":"file:///workspace/demo.ipynb","cell_ids":["cell-1","cell-2"],"timeout_ms":45000,"wait_for_completion":true}',
    ],
  },
  read_cell_outputs: {
    title: "Read Cell Outputs",
    summary: "Read normalized outputs for one cell.",
    schema: '{"notebook_uri":"file:///.../demo.ipynb","cell_id":"cell-1"}',
    examples: ['{"notebook_uri":"file:///workspace/demo.ipynb","cell_id":"cell-1"}'],
  },
  get_kernel_info: {
    title: "Get Kernel Info",
    summary: "Read best-effort kernel information for the notebook.",
    schema: '{"notebook_uri":"file:///.../demo.ipynb"}',
    examples: ['{"notebook_uri":"file:///workspace/demo.ipynb"}'],
  },
  summarize_notebook_state: {
    title: "Summarize Notebook State",
    summary: "Return a compact machine-readable notebook summary.",
    schema: '{"notebook_uri":"file:///.../demo.ipynb"}',
    examples: ['{"notebook_uri":"file:///workspace/demo.ipynb"}'],
  },
};

export class NotebookTools {
  public constructor(private readonly getClient: () => Promise<NotebookBridgeClient>) {}

  public register(server: McpServer): void {
    server.registerTool(
      "list_open_notebooks",
      {
        title: TOOL_HELP.list_open_notebooks.title,
        description: this.buildToolDescription("list_open_notebooks"),
        inputSchema: emptyInputSchema,
      },
      async () => this.toToolResult(await (await this.getClient()).listOpenNotebooks()),
    );

    server.registerTool(
      "describe_tool",
      {
        title: TOOL_HELP.describe_tool.title,
        description: this.buildToolDescription("describe_tool"),
        inputSchema: z.object({ tool_name: toolNameSchema.optional() }).strict(),
      },
      async (input) => this.toToolResult(this.describeTool((input as { tool_name?: ToolName }).tool_name)),
    );

    server.registerTool(
      "open_notebook",
      {
        title: TOOL_HELP.open_notebook.title,
        description: this.buildToolDescription("open_notebook"),
        inputSchema: z
          .object({
            notebook_uri: notebookUriSchema,
            view_column: z.enum(["active", "beside"]).optional(),
          })
          .strict(),
      },
      async (input) => this.toToolResult(await (await this.getClient()).openNotebook(input as OpenNotebookRequest)),
    );

    server.registerTool(
      "read_notebook",
      {
        title: TOOL_HELP.read_notebook.title,
        description: this.buildToolDescription("read_notebook"),
        inputSchema: z
          .object({
            notebook_uri: notebookUriSchema,
            include_outputs: z.boolean().optional(),
            range: z.object({ start: z.number().int(), end: z.number().int() }).strict().optional(),
            cell_ids: z.array(z.string()).optional(),
          })
          .strict(),
      },
      async (input) => this.toToolResult(await (await this.getClient()).readNotebook(input as ReadNotebookRequest)),
    );

    server.registerTool(
      "insert_cell",
      {
        title: TOOL_HELP.insert_cell.title,
        description: this.buildToolDescription("insert_cell"),
        inputSchema: insertCellInputSchema,
      },
      async (input) =>
        this.toToolResult(await (await this.getClient()).insertCell(this.normalizeInsertCellRequest(input))),
    );

    server.registerTool(
      "replace_cell_source",
      {
        title: TOOL_HELP.replace_cell_source.title,
        description: this.buildToolDescription("replace_cell_source"),
        inputSchema: z
          .object({
            notebook_uri: notebookUriSchema,
            cell_id: z.string(),
            expected_notebook_version: z.number().int().optional(),
            source: z.string(),
          })
          .strict(),
      },
      async (input) =>
        this.toToolResult(await (await this.getClient()).replaceCellSource(input as ReplaceCellSourceRequest)),
    );

    server.registerTool(
      "delete_cell",
      {
        title: TOOL_HELP.delete_cell.title,
        description: this.buildToolDescription("delete_cell"),
        inputSchema: z
          .object({
            notebook_uri: notebookUriSchema,
            cell_id: z.string(),
            expected_notebook_version: z.number().int().optional(),
          })
          .strict(),
      },
      async (input) => this.toToolResult(await (await this.getClient()).deleteCell(input as DeleteCellRequest)),
    );

    server.registerTool(
      "move_cell",
      {
        title: TOOL_HELP.move_cell.title,
        description: this.buildToolDescription("move_cell"),
        inputSchema: z
          .object({
            notebook_uri: notebookUriSchema,
            cell_id: z.string(),
            expected_notebook_version: z.number().int().optional(),
            target_index: z.number().int().nonnegative(),
          })
          .strict(),
      },
      async (input) => this.toToolResult(await (await this.getClient()).moveCell(input as MoveCellRequest)),
    );

    server.registerTool(
      "execute_cells",
      {
        title: TOOL_HELP.execute_cells.title,
        description: this.buildToolDescription("execute_cells"),
        inputSchema: z
          .object({
            notebook_uri: notebookUriSchema,
            cell_ids: z.array(z.string()),
            expected_notebook_version: z.number().int().optional(),
            timeout_ms: z.number().int().positive().optional(),
            wait_for_completion: z.literal(true).optional(),
          })
          .strict(),
      },
      async (input) => this.toToolResult(await (await this.getClient()).executeCells(input as ExecuteCellsRequest)),
    );

    server.registerTool(
      "read_cell_outputs",
      {
        title: TOOL_HELP.read_cell_outputs.title,
        description: this.buildToolDescription("read_cell_outputs"),
        inputSchema: z
          .object({
            notebook_uri: notebookUriSchema,
            cell_id: z.string(),
          })
          .strict(),
      },
      async (input) =>
        this.toToolResult(await (await this.getClient()).readCellOutputs(input as ReadCellOutputsRequest)),
    );

    server.registerTool(
      "get_kernel_info",
      {
        title: TOOL_HELP.get_kernel_info.title,
        description: this.buildToolDescription("get_kernel_info"),
        inputSchema: z
          .object({
            notebook_uri: notebookUriSchema,
          })
          .strict(),
      },
      async (input) =>
        this.toToolResult(await (await this.getClient()).getKernelInfo((input as { notebook_uri: string }).notebook_uri)),
    );

    server.registerTool(
      "summarize_notebook_state",
      {
        title: TOOL_HELP.summarize_notebook_state.title,
        description: this.buildToolDescription("summarize_notebook_state"),
        inputSchema: z
          .object({
            notebook_uri: notebookUriSchema,
          })
          .strict(),
      },
      async (input) =>
        this.toToolResult(
          await (await this.getClient()).summarizeNotebookState((input as { notebook_uri: string }).notebook_uri),
        ),
    );
  }

  private buildToolDescription(toolName: ToolName): string {
    const help = TOOL_HELP[toolName];
    const examples = help.examples.map((example, index) => `${index + 1}. ${example}`).join("\n");
    return `${help.summary}\n\nSchema:\n${help.schema}\n\nExamples:\n${examples}`;
  }

  private describeTool(toolName?: ToolName): unknown {
    if (!toolName) {
      return {
        tools: TOOL_NAMES.map((name) => ({
          name,
          title: TOOL_HELP[name].title,
          summary: TOOL_HELP[name].summary,
          schema: TOOL_HELP[name].schema,
        })),
      };
    }

    return {
      name: toolName,
      title: TOOL_HELP[toolName].title,
      summary: TOOL_HELP[toolName].summary,
      schema: TOOL_HELP[toolName].schema,
      examples: TOOL_HELP[toolName].examples,
    };
  }

  private normalizeInsertCellRequest(input: unknown): InsertCellRequest {
    const parsed = insertCellInputSchema.parse(input);
    return {
      notebook_uri: parsed.notebook_uri,
      expected_notebook_version: parsed.expected_notebook_version,
      position: this.normalizeInsertCellPosition(parsed.position),
      cell: parsed.cell,
    };
  }

  private normalizeInsertCellPosition(position: Record<string, unknown>): InsertCellRequest["position"] {
    if ("mode" in position) {
      return this.normalizeModeInsertPosition(position);
    }

    const keys = Object.keys(position);
    if (keys.length !== 1) {
      this.failInsertCellValidation(
        'position must be exactly one preferred shape like {"mode":"after_cell_id","cell_id":"cell-1"} or one legacy one-key object like {"after_cell_id":"cell-1"}.',
      );
    }

    const key = keys[0] as string;
    const value = position[key];
    switch (key) {
      case "before_index":
        return { before_index: this.requiredNonNegativeInteger(value, "position.before_index") };
      case "before_cell_id":
        return { before_cell_id: this.requiredString(value, "position.before_cell_id") };
      case "after_cell_id":
        return { after_cell_id: this.requiredString(value, "position.after_cell_id") };
      case "at_end":
        if (value !== true) {
          this.failInsertCellValidation('Legacy position {"at_end":true} requires the boolean value true.');
        }
        return { at_end: true };
      default:
        this.failInsertCellValidation(this.unknownPositionKeyMessage(key));
    }
  }

  private normalizeModeInsertPosition(position: Record<string, unknown>): InsertCellRequest["position"] {
    const mode = position.mode;
    if (typeof mode !== "string") {
      this.failInsertCellValidation('position.mode must be one of "before_index", "before_cell_id", "after_cell_id", or "at_end".');
    }

    switch (mode) {
      case "before_index":
        this.assertKnownKeys(position, ["mode", "index"], mode);
        return { before_index: this.requiredNonNegativeInteger(position.index, "position.index") };
      case "before_cell_id":
        this.assertKnownKeys(position, ["mode", "cell_id"], mode);
        return { before_cell_id: this.requiredString(position.cell_id, "position.cell_id") };
      case "after_cell_id":
        this.assertKnownKeys(position, ["mode", "cell_id"], mode);
        return { after_cell_id: this.requiredString(position.cell_id, "position.cell_id") };
      case "at_end":
        this.assertKnownKeys(position, ["mode"], mode);
        return { at_end: true };
      default: {
        const suggestion = this.closestMatch(mode, ["before_index", "before_cell_id", "after_cell_id", "at_end"]);
        const message = suggestion
          ? `Unknown position.mode "${mode}"; did you mean "${suggestion}"?`
          : `Unknown position.mode "${mode}". Expected "before_index", "before_cell_id", "after_cell_id", or "at_end".`;
        this.failInsertCellValidation(message);
      }
    }
  }

  private assertKnownKeys(position: Record<string, unknown>, allowedKeys: readonly string[], mode: string): void {
    const allowed = new Set(allowedKeys);
    const unknownKey = Object.keys(position).find((key) => !allowed.has(key));
    if (!unknownKey) {
      return;
    }

    const expectedKey = this.closestMatch(unknownKey, allowedKeys.filter((key) => key !== "mode"));
    if (expectedKey) {
      this.failInsertCellValidation(
        `Unknown key "${unknownKey}" in position for mode "${mode}"; expected "${expectedKey}".`,
      );
    }

    this.failInsertCellValidation(
      `Unknown key "${unknownKey}" in position for mode "${mode}". Allowed keys: ${allowedKeys.join(", ")}.`,
    );
  }

  private requiredString(value: unknown, label: string): string {
    if (typeof value === "string" && value.length > 0) {
      return value;
    }

    this.failInsertCellValidation(`${label} must be a non-empty string.`);
  }

  private requiredNonNegativeInteger(value: unknown, label: string): number {
    if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
      return value;
    }

    this.failInsertCellValidation(`${label} must be a non-negative integer.`);
  }

  private unknownPositionKeyMessage(key: string): string {
    const specialCases: Record<string, string> = {
      after: "after_cell_id",
      before: "before_cell_id",
      index: "before_index",
    };
    const suggestion = specialCases[key] ?? this.closestMatch(key, ["before_index", "before_cell_id", "after_cell_id", "at_end"]);
    if (suggestion) {
      return `Unknown key "${key}"; expected "${suggestion}".`;
    }

    return `Unknown key "${key}" in position. Expected one of "before_index", "before_cell_id", "after_cell_id", or "at_end".`;
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

  private failInsertCellValidation(message: string): never {
    throw new Error(`Invalid arguments for tool insert_cell: ${message}`);
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
