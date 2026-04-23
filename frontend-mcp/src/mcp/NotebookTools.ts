import { asBridgeError } from "../../../packages/protocol/src";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { NotebookBridgeClient } from "../bridge/NotebookBridgeClient";
import { ExecutionProgressReporter } from "./ExecutionProgressReporter";
import { ToolRequestExtra } from "./SessionSelection";
import {
  buildToolDescription,
  describeNotebookTool,
  NOTEBOOK_TOOL_INPUT_SCHEMAS,
  NOTEBOOK_TOOL_OUTPUT_SCHEMAS,
  ReadCellOutputsToolRequest,
  ReadNotebookToolRequest,
  resolveToolProfile,
  TOOL_ANNOTATIONS,
  TOOL_HELP,
  toolsForProfile,
  ToolName,
} from "./NotebookToolCatalog";
import {
  NotebookToolInputParser,
  NotebookWorkflowRequest,
} from "./NotebookToolInputParser";
import { NotebookReadOperations } from "./NotebookReadOperations";
import { NotebookToolResultRenderer } from "./NotebookToolResultRenderer";
import { NotebookWorkflowExecutor } from "./NotebookWorkflowExecutor";

export class NotebookTools {
  private readonly parser = new NotebookToolInputParser();
  private readonly renderer = new NotebookToolResultRenderer();
  private readonly reads: NotebookReadOperations;
  private readonly workflowExecutor = new NotebookWorkflowExecutor();

  public constructor(
    private readonly getClient: (extra: ToolRequestExtra) => Promise<NotebookBridgeClient>,
    private readonly log?: (message: string) => void,
  ) {
    this.reads = new NotebookReadOperations(getClient);
  }

  public register(server: McpServer): void {
    const profile = resolveToolProfile();
    const enabledTools = new Set(toolsForProfile(profile));
    this.log?.(`tool profile=${profile} enabled_tools=${enabledTools.size}`);

    const register = (toolName: ToolName, handler: (input: unknown, extra: ToolRequestExtra) => Promise<unknown>): void => {
      if (!enabledTools.has(toolName)) {
        return;
      }

      const annotations = TOOL_ANNOTATIONS[toolName];
      server.registerTool(
        toolName,
        {
          title: annotations.title,
          description: this.buildToolDescription(toolName),
          annotations: {
            readOnlyHint: annotations.readOnlyHint,
            destructiveHint: annotations.destructiveHint,
            idempotentHint: annotations.idempotentHint,
            openWorldHint: annotations.openWorldHint,
          },
          inputSchema: NOTEBOOK_TOOL_INPUT_SCHEMAS[toolName],
          outputSchema: NOTEBOOK_TOOL_OUTPUT_SCHEMAS[toolName],
        },
        async (input, extra) => this.runTool(toolName, input, extra, () => handler(input, extra)),
      );
    };

    register("list_open_notebooks", async (input, extra) => {
      this.parseEmptyInput("list_open_notebooks", input);
      return this.reads.listOpenNotebooks(extra);
    });

    register("describe_tool", async (input) => this.describeTool(this.parseDescribeToolInput(input).tool_name));

    register("open_notebook", async (input, extra) =>
      (await this.getClient(extra)).openNotebook(this.parseOpenNotebookRequest(input)),
    );

    register("get_notebook_editor_state", async (input, extra) =>
      this.reads.getNotebookEditorState(this.parseGetNotebookEditorStateRequest(input), extra),
    );

    register("get_notebook_outline", async (input, extra) =>
      this.reads.getNotebookOutline(this.parseNotebookUriOnlyInput("get_notebook_outline", input).notebook_uri, extra),
    );

    register("list_notebook_cells", async (input, extra) =>
      this.reads.listNotebookCells(this.parseListNotebookCellsRequest(input), extra),
    );

    register("list_variables", async (input, extra) =>
      this.reads.listVariables(this.parseListVariablesRequest(input), extra),
    );

    register("search_notebook", async (input, extra) =>
      this.reads.searchNotebook(this.parseSearchNotebookRequest(input), extra),
    );

    register("find_symbols", async (input, extra) =>
      this.reads.findSymbols(this.parseFindSymbolsRequest(input), extra),
    );

    register("get_diagnostics", async (input, extra) =>
      this.reads.getDiagnostics(this.parseGetDiagnosticsRequest(input), extra),
    );

    register("go_to_definition", async (input, extra) =>
      (await this.getClient(extra)).goToDefinition(this.parseGoToDefinitionRequest(input)),
    );

    register("read_notebook", async (input, extra) => {
      const request = this.parseReadNotebookRequest(input);
      const result = await this.reads.readNotebook(request, extra);
      return this.routeResultToFileIfRequested("read_notebook", result, request.output_file_path);
    });

    register("insert_cell", async (input, extra) => {
      const client = await this.getClient(extra);
      const request = this.normalizeInsertCellRequest(input);
      const revealCell = this.extractRevealCell(input);
      const result = await client.insertCell(request);
      await this.revealAfterMutation(client, result.notebook.notebook_uri, result.changed_cell_ids, revealCell);
      return result;
    });

    register("replace_cell_source", async (input, extra) => {
      const client = await this.getClient(extra);
      const request = this.parseReplaceCellSourceRequest(input);
      const revealCell = this.extractRevealCell(input);
      const result = await client.replaceCellSource(request);
      await this.revealAfterMutation(client, result.notebook.notebook_uri, result.changed_cell_ids, revealCell);
      return result;
    });

    register("patch_cell_source", async (input, extra) => {
      const client = await this.getClient(extra);
      const request = this.parsePatchCellSourceRequest(input);
      const revealCell = this.extractRevealCell(input);
      const result = await client.patchCellSource(request);
      await this.revealAfterMutation(client, result.notebook.notebook_uri, result.changed_cell_ids, revealCell);
      return result;
    });

    register("format_cell", async (input, extra) => {
      const client = await this.getClient(extra);
      const request = this.parseFormatCellRequest(input);
      const revealCell = this.extractRevealCell(input);
      const result = await client.formatCell(request);
      await this.revealAfterMutation(client, result.notebook.notebook_uri, result.changed_cell_ids, revealCell);
      return result;
    });

    register("delete_cell", async (input, extra) => {
      const client = await this.getClient(extra);
      const request = this.parseDeleteCellRequest(input);
      const revealCell = this.extractRevealCell(input);
      const result = await client.deleteCell(request);
      await this.revealAfterMutation(client, result.notebook.notebook_uri, result.changed_cell_ids, revealCell);
      return result;
    });

    register("move_cell", async (input, extra) => {
      const client = await this.getClient(extra);
      const request = this.parseMoveCellRequest(input);
      const revealCell = this.extractRevealCell(input);
      const result = await client.moveCell(request);
      await this.revealAfterMutation(client, result.notebook.notebook_uri, result.changed_cell_ids, revealCell);
      return result;
    });

    register("execute_cells", async (input, extra) => {
      const client = await this.getClient(extra);
      const request = this.parseExecuteCellsRequest(input);
      const revealCell = this.extractRevealCell(input);
      await this.revealBeforeExecution(client, request.notebook_uri, request.cell_ids, revealCell);
      return client.executeCells(request);
    });

    register("execute_cells_async", async (input, extra) => {
      const client = await this.getClient(extra);
      const request = this.parseExecuteCellsAsyncRequest(input);
      const revealCell = this.extractRevealCell(input);
      await this.revealBeforeExecution(client, request.notebook_uri, request.cell_ids, revealCell);
      return client.executeCellsAsync(request);
    });

    register("get_execution_status", async (input, extra) =>
      (await this.getClient(extra)).getExecutionStatus(this.parseGetExecutionStatusRequest(input)),
    );

    register("wait_for_execution", async (input, extra) => {
      const request = this.parseWaitForExecutionRequest(input);
      const client = await this.getClient(extra);
      const progressReporter = new ExecutionProgressReporter(extra);
      if (!progressReporter.isEnabled()) {
        return client.waitForExecution(request);
      }

      return progressReporter.waitForExecution(client, request);
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
      const result = await this.reads.readCellOutputs(request, extra);
      return this.routeResultToFileIfRequested("read_cell_outputs", result, request.output_file_path);
    });

    register("reveal_notebook_cells", async (input, extra) =>
      (await this.getClient(extra)).revealCells(this.parseRevealNotebookCellsRequest(input)),
    );

    register("set_notebook_cell_input_visibility", async (input, extra) =>
      (await this.getClient(extra)).setCellInputVisibility(this.parseSetNotebookCellInputVisibilityRequest(input)),
    );

    register("run_notebook_workflow", async (input, extra) =>
      this.executeNotebookWorkflow(this.parseNotebookWorkflowRequest(input), extra),
    );

    register("get_kernel_info", async (input, extra) =>
      this.reads.getKernelInfo(this.parseNotebookUriOnlyInput("get_kernel_info", input).notebook_uri, extra),
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
      this.reads.summarizeNotebookState(this.parseNotebookUriOnlyInput("summarize_notebook_state", input).notebook_uri, extra),
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

  private parseGetNotebookEditorStateRequest(input: unknown) {
    return this.parser.parseGetNotebookEditorStateRequest(input);
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

  private parseNotebookWorkflowRequest(input: unknown) {
    return this.parser.parseNotebookWorkflowRequest(input);
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

  private async executeNotebookWorkflow(request: NotebookWorkflowRequest, extra: ToolRequestExtra): Promise<unknown> {
    return this.workflowExecutor.execute(
      await this.getClient(extra),
      request,
      (toolName, result, outputFilePath) => this.routeResultToFileIfRequested(toolName, result, outputFilePath),
    );
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

  private extractRevealCell(input: unknown): boolean {
    if (input && typeof input === "object" && !Array.isArray(input)) {
      const record = input as Record<string, unknown>;
      if (record.reveal_cell === undefined) {
        return true;
      }
      return record.reveal_cell !== false;
    }
    return true;
  }

  private async revealAfterMutation(
    client: NotebookBridgeClient,
    notebookUri: string,
    cellIds: string[],
    reveal: boolean,
  ): Promise<void> {
    if (!reveal || cellIds.length === 0) {
      return;
    }
    try {
      await client.revealCells({
        notebook_uri: notebookUri,
        cell_ids: cellIds,
        reveal_type: "center_if_outside_viewport",
      });
    } catch {
      // Best-effort: do not fail the mutation if the reveal fails.
    }
  }

  private async revealBeforeExecution(
    client: NotebookBridgeClient,
    notebookUri: string,
    cellIds: string[],
    reveal: boolean,
  ): Promise<void> {
    if (!reveal || cellIds.length === 0) {
      return;
    }
    try {
      await client.revealCells({
        notebook_uri: notebookUri,
        cell_ids: [cellIds[0]],
        reveal_type: "center_if_outside_viewport",
      });
    } catch {
      // Best-effort: do not fail execution if the reveal fails.
    }
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
