import {
  BRIDGE_METHODS,
  BridgeErrorCode,
  BridgeErrorException,
  BridgeSessionInfo,
  DeleteCellRequest,
  ExecuteCellsAsyncRequest,
  ExecuteCellsAsyncResult,
  ExecuteCellsRequest,
  ExecuteCellsResult,
  ExecutionStatusResult,
  FindSymbolsRequest,
  FindSymbolsResult,
  FormatCellRequest,
  FormatCellResult,
  GetExecutionStatusRequest,
  GetKernelInfoResult,
  GoToDefinitionRequest,
  GoToDefinitionResult,
  InterruptExecutionRequest,
  InsertCellRequest,
  JSON_RPC_ERRORS,
  KernelCommandResult,
  ListNotebookCellsRequest,
  ListNotebookCellsResult,
  ListNotebookVariablesRequest,
  ListNotebookVariablesResult,
  ListOpenNotebooksResult,
  MutationResult,
  NotebookDiagnosticsRequest,
  NotebookDiagnosticsResult,
  NotebookOutlineResult,
  OpenNotebookRequest,
  OpenNotebookResult,
  PatchCellSourceRequest,
  PatchCellSourceResult,
  ReplaceCellSourceResult,
  PreviewCellEditRequest,
  PreviewCellEditResult,
  ReadCellOutputsRequest,
  ReadCellOutputsResult,
  ReadNotebookRequest,
  ReadNotebookResult,
  RevealNotebookCellsRequest,
  RevealNotebookCellsResult,
  SetNotebookCellInputVisibilityRequest,
  SetNotebookCellInputVisibilityResult,
  ReplaceCellSourceRequest,
  RestartKernelRequest,
  SearchNotebookRequest,
  SearchNotebookResult,
  SelectJupyterInterpreterRequest,
  SelectKernelRequest,
  WaitForExecutionRequest,
  WaitForExecutionResult,
  WaitForKernelReadyRequest,
  WaitForKernelReadyResult,
  MoveCellRequest,
  SummarizeNotebookStateResult,
} from "../../../packages/protocol/src";
import { NotebookBridgeClient } from "./NotebookBridgeClient";

interface JsonRpcEnvelope {
  jsonrpc: "2.0";
  id: string;
  method: string;
  params?: unknown;
}

interface JsonRpcResponseEnvelope {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: {
      code?: string;
      message?: string;
      detail?: unknown;
      recoverable?: boolean;
    };
  };
}

export class HttpJsonRpcBridgeClient implements NotebookBridgeClient {
  private requestCounter = 0;

  public constructor(
    private readonly bridgeUrl: string,
    private readonly authToken: string,
  ) {}

  public getSessionInfo(): Promise<BridgeSessionInfo> {
    return this.call(BRIDGE_METHODS.getSessionInfo);
  }

  public listOpenNotebooks(): Promise<ListOpenNotebooksResult> {
    return this.call(BRIDGE_METHODS.listOpen);
  }

  public openNotebook(request: OpenNotebookRequest): Promise<OpenNotebookResult> {
    return this.call(BRIDGE_METHODS.open, request);
  }

  public getNotebookOutline(notebookUri: string): Promise<NotebookOutlineResult> {
    return this.call(BRIDGE_METHODS.getOutline, { notebook_uri: notebookUri });
  }

  public listNotebookCells(request: ListNotebookCellsRequest): Promise<ListNotebookCellsResult> {
    return this.call(BRIDGE_METHODS.listCells, request);
  }

  public listVariables(request: ListNotebookVariablesRequest): Promise<ListNotebookVariablesResult> {
    return this.call(BRIDGE_METHODS.listVariables, request);
  }

  public searchNotebook(request: SearchNotebookRequest): Promise<SearchNotebookResult> {
    return this.call(BRIDGE_METHODS.search, request);
  }

  public getDiagnostics(request: NotebookDiagnosticsRequest): Promise<NotebookDiagnosticsResult> {
    return this.call(BRIDGE_METHODS.getDiagnostics, request);
  }

  public findSymbols(request: FindSymbolsRequest): Promise<FindSymbolsResult> {
    return this.call(BRIDGE_METHODS.findSymbols, request);
  }

  public goToDefinition(request: GoToDefinitionRequest): Promise<GoToDefinitionResult> {
    return this.call(BRIDGE_METHODS.goToDefinition, request);
  }

  public readNotebook(request: ReadNotebookRequest): Promise<ReadNotebookResult> {
    return this.call(BRIDGE_METHODS.read, request);
  }

  public insertCell(request: InsertCellRequest): Promise<MutationResult> {
    return this.call(BRIDGE_METHODS.insertCell, request);
  }

  public replaceCellSource(request: ReplaceCellSourceRequest): Promise<ReplaceCellSourceResult> {
    return this.call(BRIDGE_METHODS.replaceCellSource, request);
  }

  public patchCellSource(request: PatchCellSourceRequest): Promise<PatchCellSourceResult> {
    return this.call(BRIDGE_METHODS.patchCellSource, request);
  }

  public previewCellEdit(request: PreviewCellEditRequest): Promise<PreviewCellEditResult> {
    return this.call(BRIDGE_METHODS.previewCellEdit, request);
  }

  public formatCell(request: FormatCellRequest): Promise<FormatCellResult> {
    return this.call(BRIDGE_METHODS.formatCell, request);
  }

  public deleteCell(request: DeleteCellRequest): Promise<MutationResult> {
    return this.call(BRIDGE_METHODS.deleteCell, request);
  }

  public moveCell(request: MoveCellRequest): Promise<MutationResult> {
    return this.call(BRIDGE_METHODS.moveCell, request);
  }

  public executeCells(request: ExecuteCellsRequest): Promise<ExecuteCellsResult> {
    return this.call(BRIDGE_METHODS.executeCells, request);
  }

  public executeCellsAsync(request: ExecuteCellsAsyncRequest): Promise<ExecuteCellsAsyncResult> {
    return this.call(BRIDGE_METHODS.executeCellsAsync, request);
  }

  public getExecutionStatus(request: GetExecutionStatusRequest): Promise<ExecutionStatusResult> {
    return this.call(BRIDGE_METHODS.getExecutionStatus, request);
  }

  public waitForExecution(request: WaitForExecutionRequest): Promise<WaitForExecutionResult> {
    return this.call(BRIDGE_METHODS.waitForExecution, request);
  }

  public interruptExecution(request: InterruptExecutionRequest): Promise<KernelCommandResult> {
    return this.call(BRIDGE_METHODS.interruptExecution, request);
  }

  public restartKernel(request: RestartKernelRequest): Promise<KernelCommandResult> {
    return this.call(BRIDGE_METHODS.restartKernel, request);
  }

  public waitForKernelReady(request: WaitForKernelReadyRequest): Promise<WaitForKernelReadyResult> {
    return this.call(BRIDGE_METHODS.waitForKernelReady, request);
  }

  public readCellOutputs(request: ReadCellOutputsRequest): Promise<ReadCellOutputsResult> {
    return this.call(BRIDGE_METHODS.readCellOutputs, request);
  }

  public revealCells(request: RevealNotebookCellsRequest): Promise<RevealNotebookCellsResult> {
    return this.call(BRIDGE_METHODS.revealCells, request);
  }

  public setCellInputVisibility(
    request: SetNotebookCellInputVisibilityRequest,
  ): Promise<SetNotebookCellInputVisibilityResult> {
    return this.call(BRIDGE_METHODS.setCellInputVisibility, request);
  }

  public getKernelInfo(notebookUri: string): Promise<GetKernelInfoResult> {
    return this.call(BRIDGE_METHODS.getKernelInfo, { notebook_uri: notebookUri });
  }

  public selectKernel(request: SelectKernelRequest): Promise<KernelCommandResult> {
    return this.call(BRIDGE_METHODS.selectKernel, request);
  }

  public selectJupyterInterpreter(request: SelectJupyterInterpreterRequest): Promise<KernelCommandResult> {
    return this.call(BRIDGE_METHODS.selectJupyterInterpreter, request);
  }

  public summarizeNotebookState(notebookUri: string): Promise<SummarizeNotebookStateResult> {
    return this.call(BRIDGE_METHODS.summarizeState, { notebook_uri: notebookUri });
  }

  private async call<T>(method: string, params?: unknown): Promise<T> {
    const payload: JsonRpcEnvelope = {
      jsonrpc: "2.0",
      id: `req-${++this.requestCounter}`,
      method,
      params,
    };

    const response = await fetch(this.bridgeUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.authToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new BridgeErrorException({
        code: "BridgeUnavailable",
        message: `Bridge HTTP request failed with ${response.status}.`,
      });
    }

    const envelope = (await response.json()) as JsonRpcResponseEnvelope;
    if (envelope.error) {
      if (envelope.error.data?.code && envelope.error.data?.message) {
        throw new BridgeErrorException({
          code: envelope.error.data.code as BridgeErrorCode,
          message: envelope.error.data.message,
          detail: envelope.error.data.detail,
          recoverable: envelope.error.data.recoverable,
        });
      }

      throw new BridgeErrorException({
        code:
          envelope.error.code === JSON_RPC_ERRORS.invalidParams ? "InvalidRequest" : "BridgeUnavailable",
        message: envelope.error.message,
      });
    }

    return envelope.result as T;
  }
}
