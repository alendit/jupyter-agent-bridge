import {
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
  PreviewCellEditRequest,
  PreviewCellEditResult,
} from "../../../packages/protocol/src";

export interface NotebookBridgeClient {
  getSessionInfo(): Promise<BridgeSessionInfo>;
  listOpenNotebooks(): Promise<ListOpenNotebooksResult>;
  openNotebook(request: OpenNotebookRequest): Promise<OpenNotebookResult>;
  getNotebookOutline(notebookUri: string): Promise<NotebookOutlineResult>;
  listNotebookCells(request: ListNotebookCellsRequest): Promise<ListNotebookCellsResult>;
  listVariables(request: ListNotebookVariablesRequest): Promise<ListNotebookVariablesResult>;
  searchNotebook(request: SearchNotebookRequest): Promise<SearchNotebookResult>;
  getDiagnostics(request: NotebookDiagnosticsRequest): Promise<NotebookDiagnosticsResult>;
  findSymbols(request: FindSymbolsRequest): Promise<FindSymbolsResult>;
  goToDefinition(request: GoToDefinitionRequest): Promise<GoToDefinitionResult>;
  readNotebook(request: ReadNotebookRequest): Promise<ReadNotebookResult>;
  insertCell(request: InsertCellRequest): Promise<MutationResult>;
  replaceCellSource(request: ReplaceCellSourceRequest): Promise<ReplaceCellSourceResult>;
  patchCellSource(request: PatchCellSourceRequest): Promise<PatchCellSourceResult>;
  previewCellEdit?(request: PreviewCellEditRequest): Promise<PreviewCellEditResult>;
  formatCell(request: FormatCellRequest): Promise<FormatCellResult>;
  deleteCell(request: DeleteCellRequest): Promise<MutationResult>;
  moveCell(request: MoveCellRequest): Promise<MutationResult>;
  executeCells(request: ExecuteCellsRequest): Promise<ExecuteCellsResult>;
  executeCellsAsync(request: ExecuteCellsAsyncRequest): Promise<ExecuteCellsAsyncResult>;
  getExecutionStatus(request: GetExecutionStatusRequest): Promise<ExecutionStatusResult>;
  waitForExecution(request: WaitForExecutionRequest): Promise<WaitForExecutionResult>;
  interruptExecution(request: InterruptExecutionRequest): Promise<KernelCommandResult>;
  restartKernel(request: RestartKernelRequest): Promise<KernelCommandResult>;
  waitForKernelReady(request: WaitForKernelReadyRequest): Promise<WaitForKernelReadyResult>;
  readCellOutputs(request: ReadCellOutputsRequest): Promise<ReadCellOutputsResult>;
  revealCells(request: RevealNotebookCellsRequest): Promise<RevealNotebookCellsResult>;
  setCellInputVisibility(
    request: SetNotebookCellInputVisibilityRequest,
  ): Promise<SetNotebookCellInputVisibilityResult>;
  getKernelInfo(notebookUri: string): Promise<GetKernelInfoResult>;
  selectKernel(request: SelectKernelRequest): Promise<KernelCommandResult>;
  selectJupyterInterpreter(request: SelectJupyterInterpreterRequest): Promise<KernelCommandResult>;
  summarizeNotebookState(notebookUri: string): Promise<SummarizeNotebookStateResult>;
}
