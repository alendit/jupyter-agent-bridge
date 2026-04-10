import {
  DeleteCellRequest,
  ExecuteCellsRequest,
  ExecuteCellsResult,
  FindSymbolsRequest,
  FindSymbolsResult,
  FormatCellRequest,
  FormatCellResult,
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
  ReadCellOutputsRequest,
  ReadCellOutputsResult,
  ReadNotebookRequest,
  ReadNotebookResult,
  RevealNotebookCellsRequest,
  RevealNotebookCellsResult,
  ReplaceCellSourceRequest,
  RestartKernelRequest,
  SearchNotebookRequest,
  SearchNotebookResult,
  SelectJupyterInterpreterRequest,
  SelectKernelRequest,
  WaitForKernelReadyRequest,
  WaitForKernelReadyResult,
  MoveCellRequest,
  SummarizeNotebookStateResult,
} from "../../../packages/protocol/src";

export interface NotebookBridgeClient {
  getSessionInfo(): Promise<{
    session_id: string;
    workspace_id: string | null;
    workspace_folders: string[];
    bridge_url: string;
    extension_version: string;
    capabilities: {
      execute_cells: boolean;
      interrupt_execution: boolean;
      restart_kernel: boolean;
      list_variables: boolean;
      wait_for_kernel_ready: boolean;
      select_kernel: boolean;
      select_jupyter_interpreter: boolean;
    };
  }>;
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
  replaceCellSource(request: ReplaceCellSourceRequest): Promise<MutationResult>;
  patchCellSource(request: PatchCellSourceRequest): Promise<PatchCellSourceResult>;
  formatCell(request: FormatCellRequest): Promise<FormatCellResult>;
  deleteCell(request: DeleteCellRequest): Promise<MutationResult>;
  moveCell(request: MoveCellRequest): Promise<MutationResult>;
  executeCells(request: ExecuteCellsRequest): Promise<ExecuteCellsResult>;
  interruptExecution(request: InterruptExecutionRequest): Promise<KernelCommandResult>;
  restartKernel(request: RestartKernelRequest): Promise<KernelCommandResult>;
  waitForKernelReady(request: WaitForKernelReadyRequest): Promise<WaitForKernelReadyResult>;
  readCellOutputs(request: ReadCellOutputsRequest): Promise<ReadCellOutputsResult>;
  revealCells(request: RevealNotebookCellsRequest): Promise<RevealNotebookCellsResult>;
  getKernelInfo(notebookUri: string): Promise<GetKernelInfoResult>;
  selectKernel(request: SelectKernelRequest): Promise<KernelCommandResult>;
  selectJupyterInterpreter(request: SelectJupyterInterpreterRequest): Promise<KernelCommandResult>;
  summarizeNotebookState(notebookUri: string): Promise<SummarizeNotebookStateResult>;
}
