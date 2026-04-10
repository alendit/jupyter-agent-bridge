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
  ReplaceCellSourceRequest,
  RestartKernelRequest,
  SearchNotebookRequest,
  SearchNotebookResult,
  SelectJupyterInterpreterRequest,
  SelectKernelRequest,
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
      select_kernel: boolean;
      select_jupyter_interpreter: boolean;
    };
  }>;
  listOpenNotebooks(): Promise<ListOpenNotebooksResult>;
  openNotebook(request: OpenNotebookRequest): Promise<OpenNotebookResult>;
  getNotebookOutline(notebookUri: string): Promise<NotebookOutlineResult>;
  listNotebookCells(request: ListNotebookCellsRequest): Promise<ListNotebookCellsResult>;
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
  readCellOutputs(request: ReadCellOutputsRequest): Promise<ReadCellOutputsResult>;
  getKernelInfo(notebookUri: string): Promise<GetKernelInfoResult>;
  selectKernel(request: SelectKernelRequest): Promise<KernelCommandResult>;
  selectJupyterInterpreter(request: SelectJupyterInterpreterRequest): Promise<KernelCommandResult>;
  summarizeNotebookState(notebookUri: string): Promise<SummarizeNotebookStateResult>;
}
