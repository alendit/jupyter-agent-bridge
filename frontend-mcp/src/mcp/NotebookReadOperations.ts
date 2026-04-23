import {
  FindSymbolsRequest,
  GetNotebookEditorStateRequest,
  ListNotebookCellsRequest,
  ListNotebookVariablesRequest,
  NotebookDiagnosticsRequest,
  ReadCellOutputsRequest,
  ReadNotebookRequest,
  SearchNotebookRequest,
} from "../../../packages/protocol/src";
import { NotebookBridgeClient } from "../bridge/NotebookBridgeClient";
import { ToolRequestExtra } from "./SessionSelection";

export class NotebookReadOperations {
  public constructor(private readonly getClient: (extra: ToolRequestExtra) => Promise<NotebookBridgeClient>) {}

  public async getSessionInfo(extra: ToolRequestExtra) {
    return (await this.getClient(extra)).getSessionInfo();
  }

  public async listOpenNotebooks(extra: ToolRequestExtra) {
    return (await this.getClient(extra)).listOpenNotebooks();
  }

  public async getNotebookOutline(notebookUri: string, extra: ToolRequestExtra) {
    return (await this.getClient(extra)).getNotebookOutline(notebookUri);
  }

  public async listNotebookCells(request: ListNotebookCellsRequest, extra: ToolRequestExtra) {
    return (await this.getClient(extra)).listNotebookCells(request);
  }

  public async listVariables(request: ListNotebookVariablesRequest, extra: ToolRequestExtra) {
    return (await this.getClient(extra)).listVariables(request);
  }

  public async searchNotebook(request: SearchNotebookRequest, extra: ToolRequestExtra) {
    return (await this.getClient(extra)).searchNotebook(request);
  }

  public async getDiagnostics(request: NotebookDiagnosticsRequest, extra: ToolRequestExtra) {
    return (await this.getClient(extra)).getDiagnostics(request);
  }

  public async findSymbols(request: FindSymbolsRequest, extra: ToolRequestExtra) {
    return (await this.getClient(extra)).findSymbols(request);
  }

  public async readNotebook(request: ReadNotebookRequest, extra: ToolRequestExtra) {
    return (await this.getClient(extra)).readNotebook(request);
  }

  public async readCellOutputs(request: ReadCellOutputsRequest, extra: ToolRequestExtra) {
    return (await this.getClient(extra)).readCellOutputs(request);
  }

  public async getKernelInfo(notebookUri: string, extra: ToolRequestExtra) {
    return (await this.getClient(extra)).getKernelInfo(notebookUri);
  }

  public async summarizeNotebookState(notebookUri: string, extra: ToolRequestExtra) {
    return (await this.getClient(extra)).summarizeNotebookState(notebookUri);
  }

  public async getNotebookEditorState(request: GetNotebookEditorStateRequest, extra: ToolRequestExtra) {
    return (await this.getClient(extra)).getNotebookEditorState(request);
  }
}
