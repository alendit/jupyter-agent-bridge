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
import { NotebookQueryApplicationService } from "./NotebookQueryApplicationService";
import { NotebookEditApplicationService } from "./NotebookEditApplicationService";
import { NotebookRuntimeApplicationService } from "./NotebookRuntimeApplicationService";

export class NotebookBridgeService {
  public constructor(
    private readonly queryService: NotebookQueryApplicationService,
    private readonly editService: NotebookEditApplicationService,
    private readonly runtimeService: NotebookRuntimeApplicationService,
  ) {}

  public async listOpenNotebooks(): Promise<ListOpenNotebooksResult> {
    return this.queryService.listOpenNotebooks();
  }

  public async openNotebook(request: OpenNotebookRequest): Promise<OpenNotebookResult> {
    return this.queryService.openNotebook(request);
  }

  public async getNotebookOutline(notebookUri: string): Promise<NotebookOutlineResult> {
    return this.queryService.getNotebookOutline(notebookUri);
  }

  public async listNotebookCells(request: ListNotebookCellsRequest): Promise<ListNotebookCellsResult> {
    return this.queryService.listNotebookCells(request);
  }

  public async listVariables(request: ListNotebookVariablesRequest): Promise<ListNotebookVariablesResult> {
    return this.queryService.listVariables(request);
  }

  public async searchNotebook(request: SearchNotebookRequest): Promise<SearchNotebookResult> {
    return this.queryService.searchNotebook(request);
  }

  public async getDiagnostics(request: NotebookDiagnosticsRequest): Promise<NotebookDiagnosticsResult> {
    return this.queryService.getDiagnostics(request);
  }

  public async findSymbols(request: FindSymbolsRequest): Promise<FindSymbolsResult> {
    return this.queryService.findSymbols(request);
  }

  public async goToDefinition(request: GoToDefinitionRequest): Promise<GoToDefinitionResult> {
    return this.queryService.goToDefinition(request);
  }

  public async readNotebook(request: ReadNotebookRequest): Promise<ReadNotebookResult> {
    return this.queryService.readNotebook(request);
  }

  public async insertCell(request: InsertCellRequest): Promise<MutationResult> {
    return this.editService.insertCell(request);
  }

  public async replaceCellSource(request: ReplaceCellSourceRequest): Promise<MutationResult> {
    return this.editService.replaceCellSource(request);
  }

  public async patchCellSource(request: PatchCellSourceRequest): Promise<PatchCellSourceResult> {
    return this.editService.patchCellSource(request);
  }

  public async formatCell(request: FormatCellRequest): Promise<FormatCellResult> {
    return this.editService.formatCell(request);
  }

  public async deleteCell(request: DeleteCellRequest): Promise<MutationResult> {
    return this.editService.deleteCell(request);
  }

  public async moveCell(request: MoveCellRequest): Promise<MutationResult> {
    return this.editService.moveCell(request);
  }

  public async executeCells(request: ExecuteCellsRequest): Promise<ExecuteCellsResult> {
    return this.runtimeService.executeCells(request);
  }

  public async readCellOutputs(request: ReadCellOutputsRequest): Promise<ReadCellOutputsResult> {
    return this.queryService.readCellOutputs(request);
  }

  public async revealCells(request: RevealNotebookCellsRequest): Promise<RevealNotebookCellsResult> {
    return this.queryService.revealCells(request);
  }

  public async getKernelInfo(notebookUri: string): Promise<GetKernelInfoResult> {
    return this.queryService.getKernelInfo(notebookUri);
  }

  public async selectKernel(request: SelectKernelRequest): Promise<KernelCommandResult> {
    return this.runtimeService.selectKernel(request);
  }

  public async selectJupyterInterpreter(request: SelectJupyterInterpreterRequest): Promise<KernelCommandResult> {
    return this.runtimeService.selectJupyterInterpreter(request);
  }

  public async restartKernel(request: RestartKernelRequest): Promise<KernelCommandResult> {
    return this.runtimeService.restartKernel(request);
  }

  public async interruptExecution(request: InterruptExecutionRequest): Promise<KernelCommandResult> {
    return this.runtimeService.interruptExecution(request);
  }

  public async waitForKernelReady(request: WaitForKernelReadyRequest): Promise<WaitForKernelReadyResult> {
    return this.runtimeService.waitForKernelReady(request);
  }

  public async summarizeNotebookState(notebookUri: string): Promise<SummarizeNotebookStateResult> {
    return this.queryService.summarizeNotebookState(notebookUri);
  }
}
