import { asBridgeError } from "../../../packages/protocol/src";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult, ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types.js";
import { NotebookBridgeClient } from "../bridge/NotebookBridgeClient";
import { ToolRequestExtra } from "./SessionSelection";
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

const EXECUTION_STATUS_PROGRESS: Record<string, number> = {
  queued: 10,
  running: 50,
  completed: 100,
  failed: 100,
  timed_out: 100,
};

const WAIT_FOR_EXECUTION_POLL_INTERVAL_MS = 250;

export class NotebookTools {
  private readonly parser = new NotebookToolInputParser();
  private readonly renderer = new NotebookToolResultRenderer();

  public constructor(
    private readonly getClient: (extra: ToolRequestExtra) => Promise<NotebookBridgeClient>,
    private readonly log?: (message: string) => void,
  ) {}

  public register(server: McpServer): void {
    const register = (toolName: ToolName, handler: (input: unknown, extra: ToolRequestExtra) => Promise<unknown>): void => {
      server.registerTool(
        toolName,
        {
          title: TOOL_HELP[toolName].title,
          description: this.buildToolDescription(toolName),
          inputSchema: NOTEBOOK_TOOL_INPUT_SCHEMAS[toolName],
        },
        async (input, extra) => this.runTool(toolName, input, extra, () => handler(input, extra)),
      );
    };

    register("list_open_notebooks", async (input, extra) => {
      this.parseEmptyInput("list_open_notebooks", input);
      return (await this.getClient(extra)).listOpenNotebooks();
    });

    register("describe_tool", async (input) => this.describeTool(this.parseDescribeToolInput(input).tool_name));

    register("open_notebook", async (input, extra) =>
      (await this.getClient(extra)).openNotebook(this.parseOpenNotebookRequest(input)),
    );

    register("get_notebook_outline", async (input, extra) =>
      (await this.getClient(extra)).getNotebookOutline(
        this.parseNotebookUriOnlyInput("get_notebook_outline", input).notebook_uri,
      ),
    );

    register("list_notebook_cells", async (input, extra) =>
      (await this.getClient(extra)).listNotebookCells(this.parseListNotebookCellsRequest(input)),
    );

    register("list_variables", async (input, extra) =>
      (await this.getClient(extra)).listVariables(this.parseListVariablesRequest(input)),
    );

    register("search_notebook", async (input, extra) =>
      (await this.getClient(extra)).searchNotebook(this.parseSearchNotebookRequest(input)),
    );

    register("find_symbols", async (input, extra) =>
      (await this.getClient(extra)).findSymbols(this.parseFindSymbolsRequest(input)),
    );

    register("get_diagnostics", async (input, extra) =>
      (await this.getClient(extra)).getDiagnostics(this.parseGetDiagnosticsRequest(input)),
    );

    register("go_to_definition", async (input, extra) =>
      (await this.getClient(extra)).goToDefinition(this.parseGoToDefinitionRequest(input)),
    );

    register("read_notebook", async (input, extra) => {
      const request = this.parseReadNotebookRequest(input);
      const result = await (await this.getClient(extra)).readNotebook(request);
      return this.routeResultToFileIfRequested("read_notebook", result, request.output_file_path);
    });

    register("insert_cell", async (input, extra) =>
      (await this.getClient(extra)).insertCell(this.normalizeInsertCellRequest(input)),
    );

    register("replace_cell_source", async (input, extra) =>
      (await this.getClient(extra)).replaceCellSource(this.parseReplaceCellSourceRequest(input)),
    );

    register("patch_cell_source", async (input, extra) =>
      (await this.getClient(extra)).patchCellSource(this.parsePatchCellSourceRequest(input)),
    );

    register("format_cell", async (input, extra) =>
      (await this.getClient(extra)).formatCell(this.parseFormatCellRequest(input)),
    );

    register("delete_cell", async (input, extra) =>
      (await this.getClient(extra)).deleteCell(this.parseDeleteCellRequest(input)),
    );

    register("move_cell", async (input, extra) =>
      (await this.getClient(extra)).moveCell(this.parseMoveCellRequest(input)),
    );

    register("execute_cells", async (input, extra) =>
      (await this.getClient(extra)).executeCells(this.parseExecuteCellsRequest(input)),
    );

    register("execute_cells_async", async (input, extra) =>
      (await this.getClient(extra)).executeCellsAsync(this.parseExecuteCellsAsyncRequest(input)),
    );

    register("get_execution_status", async (input, extra) =>
      (await this.getClient(extra)).getExecutionStatus(this.parseGetExecutionStatusRequest(input)),
    );

    register("wait_for_execution", async (input, extra) => {
      const request = this.parseWaitForExecutionRequest(input);
      if (extra._meta?.progressToken === undefined) {
        return (await this.getClient(extra)).waitForExecution(request);
      }

      return this.waitForExecutionWithProgress(request, extra);
    });

    register("interrupt_execution", async (input, extra) =>
      (await this.getClient(extra)).interruptExecution(this.parseNotebookUriOnlyInput("interrupt_execution", input)),
    );

    register("restart_kernel", async (input, extra) =>
      (await this.getClient(extra)).restartKernel(this.parseNotebookUriOnlyInput("restart_kernel", input)),
    );

    register("wait_for_kernel_ready", async (input, extra) =>
      (await this.getClient(extra)).waitForKernelReady(this.parseWaitForKernelReadyRequest(input)),
    );

    register("read_cell_outputs", async (input, extra) => {
      const request = this.parseReadCellOutputsRequest(input);
      const result = await (await this.getClient(extra)).readCellOutputs(request);
      return this.routeResultToFileIfRequested("read_cell_outputs", result, request.output_file_path);
    });

    register("reveal_notebook_cells", async (input, extra) =>
      (await this.getClient(extra)).revealCells(this.parseRevealNotebookCellsRequest(input)),
    );

    register("set_notebook_cell_input_visibility", async (input, extra) =>
      (await this.getClient(extra)).setCellInputVisibility(this.parseSetNotebookCellInputVisibilityRequest(input)),
    );

    register("get_kernel_info", async (input, extra) =>
      (await this.getClient(extra)).getKernelInfo(this.parseNotebookUriOnlyInput("get_kernel_info", input).notebook_uri),
    );

    register("select_kernel", async (input, extra) =>
      (await this.getClient(extra)).selectKernel(this.parseSelectKernelRequest(input)),
    );

    register("select_jupyter_interpreter", async (input, extra) =>
      (await this.getClient(extra)).selectJupyterInterpreter(
        this.parseNotebookUriOnlyInput("select_jupyter_interpreter", input),
      ),
    );

    register("summarize_notebook_state", async (input, extra) =>
      (await this.getClient(extra)).summarizeNotebookState(
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

  private parseExecuteCellsAsyncRequest(input: unknown) {
    return this.parser.parseExecuteCellsAsyncRequest(input);
  }

  private parseGetExecutionStatusRequest(input: unknown) {
    return this.parser.parseGetExecutionStatusRequest(input);
  }

  private parseWaitForExecutionRequest(input: unknown) {
    return this.parser.parseWaitForExecutionRequest(input);
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

  private parseSetNotebookCellInputVisibilityRequest(input: unknown) {
    return this.parser.parseSetNotebookCellInputVisibilityRequest(input);
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

  private async runTool<T>(
    toolName: ToolName,
    input: unknown,
    _extra: ToolRequestExtra,
    operation: () => Promise<T>,
  ): Promise<CallToolResult> {
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
    if (typeof record.execution_id === "string") {
      parts.push(` execution_id=${this.shortString(record.execution_id)}`);
    }

    return parts.join("");
  }

  private async waitForExecutionWithProgress(
    request: { execution_id: string; timeout_ms?: number },
    extra: ToolRequestExtra,
  ): Promise<unknown> {
    const client = await this.getClient(extra);
    const timeoutMs = request.timeout_ms ?? 30_000;
    const deadline = Date.now() + timeoutMs;
    let lastStatus: string | null = null;

    while (true) {
      const status = await client.getExecutionStatus({
        execution_id: request.execution_id,
      });
      if (status.status !== lastStatus) {
        await this.sendExecutionProgress(extra, status.status, status.message);
        lastStatus = status.status;
      }

      if (this.isTerminalExecutionStatus(status.status)) {
        return {
          ...status,
          wait_timed_out: false,
        };
      }

      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        return {
          ...status,
          wait_timed_out: true,
        };
      }

      await this.sleep(Math.min(WAIT_FOR_EXECUTION_POLL_INTERVAL_MS, remainingMs));
    }
  }

  private async sendExecutionProgress(
    extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
    status: string,
    message: string,
  ): Promise<void> {
    const progressToken = extra._meta?.progressToken;
    if (progressToken === undefined) {
      return;
    }

    await extra.sendNotification({
      method: "notifications/progress",
      params: {
        progressToken,
        progress: EXECUTION_STATUS_PROGRESS[status] ?? 0,
        total: 100,
        message,
      },
    });
  }

  private isTerminalExecutionStatus(status: string): boolean {
    return status === "completed" || status === "failed" || status === "timed_out";
  }

  private async sleep(durationMs: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, durationMs));
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
