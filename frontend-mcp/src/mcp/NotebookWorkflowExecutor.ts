import { asBridgeError } from "../../../packages/protocol/src";
import { orderWorkflowSteps, runWorkflow, WorkflowStepResult } from "@jupyter-agent-bridge/notebook-domain";
import { NotebookBridgeClient } from "../bridge/NotebookBridgeClient";
import { NotebookWorkflowRequest } from "./NotebookToolInputParser";
import { NotebookWorkflowStepToolName, ReadCellOutputsToolRequest, ReadNotebookToolRequest } from "./NotebookToolCatalog";

type WorkflowResultRouter = (
  toolName: "read_notebook" | "read_cell_outputs",
  result: unknown,
  outputFilePath?: string,
) => Promise<unknown>;

export class NotebookWorkflowExecutor {
  public async execute(
    client: NotebookBridgeClient,
    request: NotebookWorkflowRequest,
    routeResultToFileIfRequested: WorkflowResultRouter,
  ): Promise<unknown> {
    const workflowResult = await runWorkflow(
      orderWorkflowSteps(request.steps),
      request.on_error,
      (toolName, input) =>
        this.executeWorkflowStep(
          client,
          toolName as NotebookWorkflowStepToolName,
          input,
          routeResultToFileIfRequested,
        ),
      asBridgeError,
    );

    return {
      notebook_uri: request.notebook_uri,
      on_error: request.on_error,
      completed_step_ids: workflowResult.completed_step_ids,
      failed_step_ids: workflowResult.failed_step_ids,
      skipped_step_ids: workflowResult.skipped_step_ids,
      steps: workflowResult.steps as WorkflowStepResult[],
    };
  }

  private async executeWorkflowStep(
    client: NotebookBridgeClient,
    toolName: NotebookWorkflowStepToolName,
    input: unknown,
    routeResultToFileIfRequested: WorkflowResultRouter,
  ): Promise<unknown> {
    switch (toolName) {
      case "get_notebook_outline":
        return client.getNotebookOutline((input as { notebook_uri: string }).notebook_uri);
      case "list_notebook_cells":
        return client.listNotebookCells(input as never);
      case "list_variables":
        return client.listVariables(input as never);
      case "search_notebook":
        return client.searchNotebook(input as never);
      case "find_symbols":
        return client.findSymbols(input as never);
      case "get_diagnostics":
        return client.getDiagnostics(input as never);
      case "go_to_definition":
        return client.goToDefinition(input as never);
      case "read_notebook": {
        const request = input as ReadNotebookToolRequest;
        return routeResultToFileIfRequested(
          "read_notebook",
          await client.readNotebook(request),
          request.output_file_path,
        );
      }
      case "insert_cell":
        return client.insertCell(input as never);
      case "replace_cell_source":
        return client.replaceCellSource(input as never);
      case "patch_cell_source":
        return client.patchCellSource(input as never);
      case "format_cell":
        return client.formatCell(input as never);
      case "delete_cell":
        return client.deleteCell(input as never);
      case "move_cell":
        return client.moveCell(input as never);
      case "execute_cells":
        return client.executeCells(input as never);
      case "interrupt_execution":
        return client.interruptExecution(input as never);
      case "restart_kernel":
        return client.restartKernel(input as never);
      case "wait_for_kernel_ready":
        return client.waitForKernelReady(input as never);
      case "read_cell_outputs": {
        const request = input as ReadCellOutputsToolRequest;
        return routeResultToFileIfRequested(
          "read_cell_outputs",
          await client.readCellOutputs(request),
          request.output_file_path,
        );
      }
      case "reveal_notebook_cells":
        return client.revealCells(input as never);
      case "set_notebook_cell_input_visibility":
        return client.setCellInputVisibility(input as never);
      case "get_kernel_info":
        return client.getKernelInfo((input as { notebook_uri: string }).notebook_uri);
      case "select_kernel":
        return client.selectKernel(input as never);
      case "select_jupyter_interpreter":
        return client.selectJupyterInterpreter(input as never);
      case "summarize_notebook_state":
        return client.summarizeNotebookState((input as { notebook_uri: string }).notebook_uri);
    }
  }
}
