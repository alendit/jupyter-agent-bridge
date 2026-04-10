import {
  BRIDGE_METHODS,
  BridgeErrorCode,
  BridgeErrorException,
  BridgeSessionInfo,
  DeleteCellRequest,
  ExecuteCellsRequest,
  ExecuteCellsResult,
  GetKernelInfoResult,
  InsertCellRequest,
  JSON_RPC_ERRORS,
  ListNotebookCellsRequest,
  ListNotebookCellsResult,
  ListOpenNotebooksResult,
  MutationResult,
  NotebookOutlineResult,
  OpenNotebookRequest,
  OpenNotebookResult,
  PatchCellSourceRequest,
  PatchCellSourceResult,
  ReadCellOutputsRequest,
  ReadCellOutputsResult,
  ReadNotebookRequest,
  ReadNotebookResult,
  ReplaceCellSourceRequest,
  SearchNotebookRequest,
  SearchNotebookResult,
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

  public searchNotebook(request: SearchNotebookRequest): Promise<SearchNotebookResult> {
    return this.call(BRIDGE_METHODS.search, request);
  }

  public readNotebook(request: ReadNotebookRequest): Promise<ReadNotebookResult> {
    return this.call(BRIDGE_METHODS.read, request);
  }

  public insertCell(request: InsertCellRequest): Promise<MutationResult> {
    return this.call(BRIDGE_METHODS.insertCell, request);
  }

  public replaceCellSource(request: ReplaceCellSourceRequest): Promise<MutationResult> {
    return this.call(BRIDGE_METHODS.replaceCellSource, request);
  }

  public patchCellSource(request: PatchCellSourceRequest): Promise<PatchCellSourceResult> {
    return this.call(BRIDGE_METHODS.patchCellSource, request);
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

  public readCellOutputs(request: ReadCellOutputsRequest): Promise<ReadCellOutputsResult> {
    return this.call(BRIDGE_METHODS.readCellOutputs, request);
  }

  public getKernelInfo(notebookUri: string): Promise<GetKernelInfoResult> {
    return this.call(BRIDGE_METHODS.getKernelInfo, { notebook_uri: notebookUri });
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
