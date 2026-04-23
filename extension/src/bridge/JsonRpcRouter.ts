import {
  BRIDGE_METHODS,
  BridgeSessionInfo,
  JSON_RPC_ERRORS,
  JsonRpcRequest,
  JsonRpcResponse,
  asBridgeError,
} from "../../../packages/protocol/src";
import { NotebookBridgeService } from "../notebook/NotebookBridgeService";

export class JsonRpcRouter {
  public constructor(
    private readonly notebookBridgeService: NotebookBridgeService,
    private readonly getSessionInfo: () => BridgeSessionInfo,
  ) {}

  public async route(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    try {
      const result = await this.dispatch(request.method, request.params);
      return {
        jsonrpc: "2.0",
        id: request.id ?? null,
        result,
      };
    } catch (error) {
      const bridgeError = asBridgeError(error);
      return {
        jsonrpc: "2.0",
        id: request.id ?? null,
        error: {
          code: JSON_RPC_ERRORS.domainError,
          message: bridgeError.message,
          data: bridgeError,
        },
      };
    }
  }

  private dispatch(method: string, params: unknown): Promise<unknown> {
    switch (method) {
      case BRIDGE_METHODS.getSessionInfo:
        return Promise.resolve(this.getSessionInfo());
      case BRIDGE_METHODS.listOpen:
        return this.notebookBridgeService.listOpenNotebooks();
      case BRIDGE_METHODS.open:
        return this.notebookBridgeService.openNotebook(object(params) as never);
      case BRIDGE_METHODS.getOutline:
        return this.notebookBridgeService.getNotebookOutline(requiredString(params, "notebook_uri"));
      case BRIDGE_METHODS.listCells:
        return this.notebookBridgeService.listNotebookCells(object(params) as never);
      case BRIDGE_METHODS.listVariables:
        return this.notebookBridgeService.listVariables(object(params) as never);
      case BRIDGE_METHODS.search:
        return this.notebookBridgeService.searchNotebook(object(params) as never);
      case BRIDGE_METHODS.getDiagnostics:
        return this.notebookBridgeService.getDiagnostics(object(params) as never);
      case BRIDGE_METHODS.findSymbols:
        return this.notebookBridgeService.findSymbols(object(params) as never);
      case BRIDGE_METHODS.goToDefinition:
        return this.notebookBridgeService.goToDefinition(object(params) as never);
      case BRIDGE_METHODS.read:
        return this.notebookBridgeService.readNotebook(object(params) as never);
      case BRIDGE_METHODS.insertCell:
        return this.notebookBridgeService.insertCell(object(params) as never);
      case BRIDGE_METHODS.replaceCellSource:
        return this.notebookBridgeService.replaceCellSource(object(params) as never);
      case BRIDGE_METHODS.patchCellSource:
        return this.notebookBridgeService.patchCellSource(object(params) as never);
      case BRIDGE_METHODS.previewCellEdit:
        return this.notebookBridgeService.previewCellEdit(object(params) as never);
      case BRIDGE_METHODS.formatCell:
        return this.notebookBridgeService.formatCell(object(params) as never);
      case BRIDGE_METHODS.deleteCell:
        return this.notebookBridgeService.deleteCell(object(params) as never);
      case BRIDGE_METHODS.moveCell:
        return this.notebookBridgeService.moveCell(object(params) as never);
      case BRIDGE_METHODS.executeCells:
        return this.notebookBridgeService.executeCells(object(params) as never);
      case BRIDGE_METHODS.executeCellsAsync:
        return this.notebookBridgeService.executeCellsAsync(object(params) as never);
      case BRIDGE_METHODS.getExecutionStatus:
        return Promise.resolve(this.notebookBridgeService.getExecutionStatus(object(params) as never));
      case BRIDGE_METHODS.waitForExecution:
        return this.notebookBridgeService.waitForExecution(object(params) as never);
      case BRIDGE_METHODS.interruptExecution:
        return this.notebookBridgeService.interruptExecution(object(params) as never);
      case BRIDGE_METHODS.restartKernel:
        return this.notebookBridgeService.restartKernel(object(params) as never);
      case BRIDGE_METHODS.waitForKernelReady:
        return this.notebookBridgeService.waitForKernelReady(object(params) as never);
      case BRIDGE_METHODS.readCellOutputs:
        return this.notebookBridgeService.readCellOutputs(object(params) as never);
      case BRIDGE_METHODS.revealCells:
        return this.notebookBridgeService.revealCells(object(params) as never);
      case BRIDGE_METHODS.setCellInputVisibility:
        return this.notebookBridgeService.setCellInputVisibility(object(params) as never);
      case BRIDGE_METHODS.getKernelInfo:
        return this.notebookBridgeService.getKernelInfo(requiredString(params, "notebook_uri"));
      case BRIDGE_METHODS.selectKernel:
        return this.notebookBridgeService.selectKernel(object(params) as never);
      case BRIDGE_METHODS.selectJupyterInterpreter:
        return this.notebookBridgeService.selectJupyterInterpreter(object(params) as never);
      case BRIDGE_METHODS.summarizeState:
        return this.notebookBridgeService.summarizeNotebookState(requiredString(params, "notebook_uri"));
      case BRIDGE_METHODS.getEditorState:
        return this.notebookBridgeService.getNotebookEditorState(object(params) as never);
      default:
        return Promise.reject({
          code: "InvalidRequest",
          message: `Unknown method: ${method}`,
        });
    }
  }
}

function object(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function requiredString(value: unknown, key: string): string {
  const params = object(value);
  const candidate = params[key];
  if (typeof candidate !== "string" || candidate.length === 0) {
    throw {
      code: "InvalidRequest",
      message: `Missing string parameter: ${key}`,
      recoverable: true,
    };
  }

  return candidate;
}
