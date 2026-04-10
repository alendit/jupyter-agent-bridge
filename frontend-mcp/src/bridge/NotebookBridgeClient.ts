import {
  DeleteCellRequest,
  ExecuteCellsRequest,
  ExecuteCellsResult,
  GetKernelInfoResult,
  InsertCellRequest,
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
    };
  }>;
  listOpenNotebooks(): Promise<ListOpenNotebooksResult>;
  openNotebook(request: OpenNotebookRequest): Promise<OpenNotebookResult>;
  getNotebookOutline(notebookUri: string): Promise<NotebookOutlineResult>;
  listNotebookCells(request: ListNotebookCellsRequest): Promise<ListNotebookCellsResult>;
  searchNotebook(request: SearchNotebookRequest): Promise<SearchNotebookResult>;
  readNotebook(request: ReadNotebookRequest): Promise<ReadNotebookResult>;
  insertCell(request: InsertCellRequest): Promise<MutationResult>;
  replaceCellSource(request: ReplaceCellSourceRequest): Promise<MutationResult>;
  patchCellSource(request: PatchCellSourceRequest): Promise<PatchCellSourceResult>;
  deleteCell(request: DeleteCellRequest): Promise<MutationResult>;
  moveCell(request: MoveCellRequest): Promise<MutationResult>;
  executeCells(request: ExecuteCellsRequest): Promise<ExecuteCellsResult>;
  readCellOutputs(request: ReadCellOutputsRequest): Promise<ReadCellOutputsResult>;
  getKernelInfo(notebookUri: string): Promise<GetKernelInfoResult>;
  summarizeNotebookState(notebookUri: string): Promise<SummarizeNotebookStateResult>;
}
