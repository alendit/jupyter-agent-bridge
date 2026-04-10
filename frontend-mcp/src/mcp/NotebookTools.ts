import { asBridgeError } from "../../../packages/protocol/src";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { NotebookBridgeClient } from "../bridge/NotebookBridgeClient";
import {
  buildToolDescription,
  describeNotebookTool,
  NOTEBOOK_TOOL_INPUT_SCHEMAS,
  ReadCellOutputsToolRequest,
  ReadNotebookToolRequest,
  TOOL_HELP,
  ToolName,
} from "./NotebookToolCatalog";
import { NotebookToolInputParser } from "./NotebookToolInputParser";
import { NotebookToolResultRenderer } from "./NotebookToolResultRenderer";

export class NotebookTools {
  private readonly parser = new NotebookToolInputParser();
  private readonly renderer = new NotebookToolResultRenderer();

  public constructor(
    private readonly getClient: () => Promise<NotebookBridgeClient>,
    private readonly log?: (message: string) => void,
  ) {}

  public register(server: McpServer): void {
    const register = (toolName: ToolName, handler: (input: unknown) => Promise<unknown>): void => {
      server.registerTool(
        toolName,
        {
          title: TOOL_HELP[toolName].title,
          description: this.buildToolDescription(toolName),
          inputSchema: NOTEBOOK_TOOL_INPUT_SCHEMAS[toolName],
        },
        async (input) => this.runTool(toolName, input, () => handler(input)),
      );
    };

    register("list_open_notebooks", async (input) => {
      this.parseEmptyInput("list_open_notebooks", input);
      return (await this.getClient()).listOpenNotebooks();
    });

    register("describe_tool", async (input) => this.describeTool(this.parseDescribeToolInput(input).tool_name));

    register("open_notebook", async (input) =>
      (await this.getClient()).openNotebook(this.parseOpenNotebookRequest(input)),
    );

    register("get_notebook_outline", async (input) =>
      (await this.getClient()).getNotebookOutline(this.parseNotebookUriOnlyInput("get_notebook_outline", input).notebook_uri),
    );

    register("list_notebook_cells", async (input) =>
      (await this.getClient()).listNotebookCells(this.parseListNotebookCellsRequest(input)),
    );

    register("list_variables", async (input) =>
      (await this.getClient()).listVariables(this.parseListVariablesRequest(input)),
    );

    register("search_notebook", async (input) =>
      (await this.getClient()).searchNotebook(this.parseSearchNotebookRequest(input)),
    );

    register("find_symbols", async (input) =>
      (await this.getClient()).findSymbols(this.parseFindSymbolsRequest(input)),
    );

    register("get_diagnostics", async (input) =>
      (await this.getClient()).getDiagnostics(this.parseGetDiagnosticsRequest(input)),
    );

    register("go_to_definition", async (input) =>
      (await this.getClient()).goToDefinition(this.parseGoToDefinitionRequest(input)),
    );

    register("read_notebook", async (input) => {
      const request = this.parseReadNotebookRequest(input);
      const result = await (await this.getClient()).readNotebook(request);
      return this.routeResultToFileIfRequested("read_notebook", result, request.output_file_path);
    });

    register("insert_cell", async (input) =>
      (await this.getClient()).insertCell(this.normalizeInsertCellRequest(input)),
    );

    register("replace_cell_source", async (input) =>
      (await this.getClient()).replaceCellSource(this.parseReplaceCellSourceRequest(input)),
    );

    register("patch_cell_source", async (input) =>
      (await this.getClient()).patchCellSource(this.parsePatchCellSourceRequest(input)),
    );

    register("format_cell", async (input) =>
      (await this.getClient()).formatCell(this.parseFormatCellRequest(input)),
    );

    register("delete_cell", async (input) =>
      (await this.getClient()).deleteCell(this.parseDeleteCellRequest(input)),
    );

    register("move_cell", async (input) =>
      (await this.getClient()).moveCell(this.parseMoveCellRequest(input)),
    );

    register("execute_cells", async (input) =>
      (await this.getClient()).executeCells(this.parseExecuteCellsRequest(input)),
    );

    register("interrupt_execution", async (input) =>
      (await this.getClient()).interruptExecution(this.parseNotebookUriOnlyInput("interrupt_execution", input)),
    );

    register("restart_kernel", async (input) =>
      (await this.getClient()).restartKernel(this.parseNotebookUriOnlyInput("restart_kernel", input)),
    );

    register("wait_for_kernel_ready", async (input) =>
      (await this.getClient()).waitForKernelReady(this.parseWaitForKernelReadyRequest(input)),
    );

    register("read_cell_outputs", async (input) => {
      const request = this.parseReadCellOutputsRequest(input);
      const result = await (await this.getClient()).readCellOutputs(request);
      return this.routeResultToFileIfRequested("read_cell_outputs", result, request.output_file_path);
    });

    register("reveal_notebook_cells", async (input) =>
      (await this.getClient()).revealCells(this.parseRevealNotebookCellsRequest(input)),
    );

    register("get_kernel_info", async (input) =>
      (await this.getClient()).getKernelInfo(this.parseNotebookUriOnlyInput("get_kernel_info", input).notebook_uri),
    );

    register("select_kernel", async (input) =>
      (await this.getClient()).selectKernel(this.parseSelectKernelRequest(input)),
    );

    register("select_jupyter_interpreter", async (input) =>
      (await this.getClient()).selectJupyterInterpreter(
        this.parseNotebookUriOnlyInput("select_jupyter_interpreter", input),
      ),
    );

    register("summarize_notebook_state", async (input) =>
      (await this.getClient()).summarizeNotebookState(
        this.parseNotebookUriOnlyInput("summarize_notebook_state", input).notebook_uri,
      ),
    );
  }

  private buildToolDescription(toolName: ToolName): string {
    return buildToolDescription(toolName);
  }

  private describeTool(toolName?: ToolName): unknown {
    return describeNotebookTool(toolName);
  }

  private parseEmptyInput(toolName: ToolName, input: unknown): void {
    return this.parser.parseEmptyInput(toolName, input);
  }

  private parseDescribeToolInput(input: unknown): { tool_name?: ToolName } {
    return this.parser.parseDescribeToolInput(input);
  }

  private parseOpenNotebookRequest(input: unknown) {
    return this.parser.parseOpenNotebookRequest(input);
  }

  private parseReadNotebookRequest(input: unknown): ReadNotebookToolRequest {
    return this.parser.parseReadNotebookRequest(input);
  }

  private parseListNotebookCellsRequest(input: unknown) {
    return this.parser.parseListNotebookCellsRequest(input);
  }

  private parseListVariablesRequest(input: unknown) {
    return this.parser.parseListVariablesRequest(input);
  }

  private parseSearchNotebookRequest(input: unknown) {
    return this.parser.parseSearchNotebookRequest(input);
  }

  private parseFindSymbolsRequest(input: unknown) {
    return this.parser.parseFindSymbolsRequest(input);
  }

  private parseGetDiagnosticsRequest(input: unknown) {
    return this.parser.parseGetDiagnosticsRequest(input);
  }

  private parseGoToDefinitionRequest(input: unknown) {
    return this.parser.parseGoToDefinitionRequest(input);
  }

  private normalizeInsertCellRequest(input: unknown) {
    return this.parser.normalizeInsertCellRequest(input);
  }

  private parseReplaceCellSourceRequest(input: unknown) {
    return this.parser.parseReplaceCellSourceRequest(input);
  }

  private parsePatchCellSourceRequest(input: unknown) {
    return this.parser.parsePatchCellSourceRequest(input);
  }

  private parseFormatCellRequest(input: unknown) {
    return this.parser.parseFormatCellRequest(input);
  }

  private parseDeleteCellRequest(input: unknown) {
    return this.parser.parseDeleteCellRequest(input);
  }

  private parseMoveCellRequest(input: unknown) {
    return this.parser.parseMoveCellRequest(input);
  }

  private parseExecuteCellsRequest(input: unknown) {
    return this.parser.parseExecuteCellsRequest(input);
  }

  private parseSelectKernelRequest(input: unknown) {
    return this.parser.parseSelectKernelRequest(input);
  }

  private parseWaitForKernelReadyRequest(input: unknown) {
    return this.parser.parseWaitForKernelReadyRequest(input);
  }

  private parseReadCellOutputsRequest(input: unknown): ReadCellOutputsToolRequest {
    return this.parser.parseReadCellOutputsRequest(input);
  }

  private parseRevealNotebookCellsRequest(input: unknown) {
    return this.parser.parseRevealNotebookCellsRequest(input);
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
  ) {
    return this.parser.parseNotebookUriOnlyInput(toolName, input);
  }

  private async routeResultToFileIfRequested(
    toolName: "read_notebook" | "read_cell_outputs",
    result: unknown,
    outputFilePath?: string,
  ): Promise<unknown> {
    return this.renderer.routeResultToFileIfRequested(toolName, result, outputFilePath);
  }

  private toToolResult(result: unknown): CallToolResult {
    return this.renderer.toToolResult(result);
  }

  private toErrorToolResult(error: unknown): CallToolResult {
    return this.renderer.toErrorToolResult(error);
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
}
