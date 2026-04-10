import * as vscode from "vscode";
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
import { fail } from "../../../packages/protocol/src";
import { NotebookRegistry } from "./NotebookRegistry";
import { NotebookReadService } from "./NotebookReadService";
import { NotebookMutationService } from "./NotebookMutationService";
import { NotebookExecutionService } from "./NotebookExecutionService";
import { NotebookKernelCommandService } from "./NotebookKernelCommandService";
import { NotebookSearchService } from "./NotebookSearchService";
import { CellPatchService } from "./CellPatchService";
import { computeSourceSha256 } from "./cells";
import { NotebookLanguageService } from "./NotebookLanguageService";
import { NotebookVariableService } from "./NotebookVariableService";
import { HostKernelObservationService } from "./HostKernelObservationService";

export class NotebookBridgeService {
  public constructor(
    private readonly registry: NotebookRegistry,
    private readonly readService: NotebookReadService,
    private readonly mutationService: NotebookMutationService,
    private readonly executionService: NotebookExecutionService,
    private readonly kernelCommandService: NotebookKernelCommandService,
    private readonly searchService: NotebookSearchService,
    private readonly cellPatchService: CellPatchService,
    private readonly languageService: NotebookLanguageService,
    private readonly hostKernelObservationService: HostKernelObservationService,
    private readonly variableService: NotebookVariableService,
  ) {}

  public async listOpenNotebooks(): Promise<ListOpenNotebooksResult> {
    const documents = this.registry.listDocuments().filter((document) => document.notebookType === "jupyter-notebook");
    return this.readService.listOpenNotebooks(documents);
  }

  public async openNotebook(request: OpenNotebookRequest): Promise<OpenNotebookResult> {
    const uri = this.resolveOpenNotebookUri(request);
    const document = await vscode.workspace.openNotebookDocument(uri);
    this.assertSupportedDocument(document);
    this.registry.ensureState(document);
    await this.mutationService.ensureStableCellIds(document);
    await vscode.window.showNotebookDocument(document, {
      preview: false,
      preserveFocus: true,
      viewColumn: request.view_column === "beside" ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active,
    });
    return this.readService.toNotebookSummary(document);
  }

  public async getNotebookOutline(notebookUri: string): Promise<NotebookOutlineResult> {
    const document = await this.requireDocument(notebookUri);
    await this.mutationService.ensureStableCellIds(document);
    return this.readService.getNotebookOutline(document);
  }

  public async listNotebookCells(request: ListNotebookCellsRequest): Promise<ListNotebookCellsResult> {
    const document = await this.requireDocument(request.notebook_uri);
    await this.mutationService.ensureStableCellIds(document);
    return this.readService.listNotebookCells(document, request);
  }

  public async listVariables(request: ListNotebookVariablesRequest): Promise<ListNotebookVariablesResult> {
    const document = await this.requireDocument(request.notebook_uri);
    await this.mutationService.ensureStableCellIds(document);
    return this.variableService.listVariables(document, request);
  }

  public async searchNotebook(request: SearchNotebookRequest): Promise<SearchNotebookResult> {
    const document = await this.requireDocument(request.notebook_uri);
    await this.mutationService.ensureStableCellIds(document);
    return this.searchService.search(document, request);
  }

  public async getDiagnostics(request: NotebookDiagnosticsRequest): Promise<NotebookDiagnosticsResult> {
    const document = await this.requireDocument(request.notebook_uri);
    await this.mutationService.ensureStableCellIds(document);
    return this.languageService.getDiagnostics(document, request);
  }

  public async findSymbols(request: FindSymbolsRequest): Promise<FindSymbolsResult> {
    const document = await this.requireDocument(request.notebook_uri);
    await this.mutationService.ensureStableCellIds(document);
    return this.languageService.findSymbols(document, request);
  }

  public async goToDefinition(request: GoToDefinitionRequest): Promise<GoToDefinitionResult> {
    const document = await this.requireDocument(request.notebook_uri);
    await this.mutationService.ensureStableCellIds(document);
    return this.languageService.goToDefinition(document, request);
  }

  public async readNotebook(request: ReadNotebookRequest): Promise<ReadNotebookResult> {
    const document = await this.requireDocument(request.notebook_uri);
    await this.mutationService.ensureStableCellIds(document);
    return this.readService.readNotebook(document, request);
  }

  public async insertCell(request: InsertCellRequest): Promise<MutationResult> {
    return this.registry.runExclusive(request.notebook_uri, async () => {
      const document = await this.requireDocument(request.notebook_uri);
      await this.mutationService.ensureStableCellIds(document);
      this.mutationService.assertExpectedVersion(
        this.registry.getVersion(request.notebook_uri),
        request.expected_notebook_version,
      );
      const outcome = await this.mutationService.insertCell(document, request);
      return this.readService.toMutationResult(
        this.requireDocumentSync(request.notebook_uri),
        outcome.operation,
        outcome.changed_cell_ids,
        outcome.deleted_cell_ids,
        outcome.outline_maybe_changed,
      );
    });
  }

  public async replaceCellSource(request: ReplaceCellSourceRequest): Promise<MutationResult> {
    return this.registry.runExclusive(request.notebook_uri, async () => {
      const document = await this.requireDocument(request.notebook_uri);
      await this.mutationService.ensureStableCellIds(document);
      this.mutationService.assertExpectedVersion(
        this.registry.getVersion(request.notebook_uri),
        request.expected_notebook_version,
      );
      const outcome = await this.mutationService.replaceCellSource(document, request);
      return this.readService.toMutationResult(
        this.requireDocumentSync(request.notebook_uri),
        outcome.operation,
        outcome.changed_cell_ids,
        outcome.deleted_cell_ids,
        outcome.outline_maybe_changed,
      );
    });
  }

  public async patchCellSource(request: PatchCellSourceRequest): Promise<PatchCellSourceResult> {
    return this.registry.runExclusive(request.notebook_uri, async () => {
      const document = await this.requireDocument(request.notebook_uri);
      await this.mutationService.ensureStableCellIds(document);
      const currentVersion = this.registry.getVersion(request.notebook_uri);
      const cell = this.readService.requireCell(document, request.cell_id);
      const currentSource = cell.document.getText();
      const currentSourceSha256 = computeSourceSha256(currentSource);

      if (request.expected_cell_source_sha256 && request.expected_cell_source_sha256 !== currentSourceSha256) {
        fail({
          code: "NotebookChanged",
          message: `Cell source changed since last read. Expected sha256 ${request.expected_cell_source_sha256}, got ${currentSourceSha256}.`,
          recoverable: true,
        });
      }

      if (
        request.expected_notebook_version !== undefined &&
        currentVersion !== request.expected_notebook_version &&
        !request.expected_cell_source_sha256
      ) {
        this.mutationService.assertExpectedVersion(currentVersion, request.expected_notebook_version);
      }

      const patchResult = this.cellPatchService.applyPatch(currentSource, request.patch, request.format);
      const outcome = await this.mutationService.replaceCellSource(document, {
        notebook_uri: request.notebook_uri,
        cell_id: request.cell_id,
        source: patchResult.updatedSource,
      });
      const mutation = this.readService.toMutationResult(
        this.requireDocumentSync(request.notebook_uri),
        "patch_cell_source",
        outcome.changed_cell_ids,
        outcome.deleted_cell_ids,
        outcome.outline_maybe_changed,
      );

      return {
        ...mutation,
        operation: "patch_cell_source",
        applied_patch_format: patchResult.format,
        before_source_sha256: currentSourceSha256,
        after_source_sha256: computeSourceSha256(patchResult.updatedSource),
      };
    });
  }

  public async formatCell(request: FormatCellRequest): Promise<FormatCellResult> {
    return this.registry.runExclusive(request.notebook_uri, async () => {
      const document = await this.requireDocument(request.notebook_uri);
      await this.mutationService.ensureStableCellIds(document);
      return this.languageService.formatCell(document, request);
    });
  }

  public async deleteCell(request: DeleteCellRequest): Promise<MutationResult> {
    return this.registry.runExclusive(request.notebook_uri, async () => {
      const document = await this.requireDocument(request.notebook_uri);
      await this.mutationService.ensureStableCellIds(document);
      this.mutationService.assertExpectedVersion(
        this.registry.getVersion(request.notebook_uri),
        request.expected_notebook_version,
      );
      const outcome = await this.mutationService.deleteCell(document, request);
      return this.readService.toMutationResult(
        this.requireDocumentSync(request.notebook_uri),
        outcome.operation,
        outcome.changed_cell_ids,
        outcome.deleted_cell_ids,
        outcome.outline_maybe_changed,
      );
    });
  }

  public async moveCell(request: MoveCellRequest): Promise<MutationResult> {
    return this.registry.runExclusive(request.notebook_uri, async () => {
      const document = await this.requireDocument(request.notebook_uri);
      await this.mutationService.ensureStableCellIds(document);
      this.mutationService.assertExpectedVersion(
        this.registry.getVersion(request.notebook_uri),
        request.expected_notebook_version,
      );
      const outcome = await this.mutationService.moveCell(document, request);
      return this.readService.toMutationResult(
        this.requireDocumentSync(request.notebook_uri),
        outcome.operation,
        outcome.changed_cell_ids,
        outcome.deleted_cell_ids,
        outcome.outline_maybe_changed,
      );
    });
  }

  public async executeCells(request: ExecuteCellsRequest): Promise<ExecuteCellsResult> {
    if ((request as { wait_for_completion?: boolean }).wait_for_completion === false) {
      fail({
        code: "InvalidRequest",
        message: "wait_for_completion=false is not supported in the MVP.",
        recoverable: true,
      });
    }

    return this.registry.runExclusive(request.notebook_uri, async () => {
      const document = await this.requireDocument(request.notebook_uri);
      await this.mutationService.ensureStableCellIds(document);
      this.mutationService.assertExpectedVersion(
        this.registry.getVersion(request.notebook_uri),
        request.expected_notebook_version,
      );
      return this.executionService.executeCells(document, request);
    });
  }

  public async readCellOutputs(request: ReadCellOutputsRequest): Promise<ReadCellOutputsResult> {
    const document = await this.requireDocument(request.notebook_uri);
    await this.mutationService.ensureStableCellIds(document);
    const cell = this.readService.requireCell(document, request.cell_id);
    return this.readService.readCellOutputs(document, cell, request.include_rich_output_text ?? false);
  }

  public async getKernelInfo(notebookUri: string): Promise<GetKernelInfoResult> {
    const document = await this.requireDocument(notebookUri);
    await this.mutationService.ensureStableCellIds(document);
    await this.hostKernelObservationService.refresh(document);
    return this.readService.getKernelInfo(document);
  }

  public async selectKernel(request: SelectKernelRequest): Promise<KernelCommandResult> {
    return this.registry.runExclusive(request.notebook_uri, async () => {
      const document = await this.requireDocument(request.notebook_uri);
      await this.mutationService.ensureStableCellIds(document);
      return this.kernelCommandService.selectKernel(document, request);
    });
  }

  public async selectJupyterInterpreter(request: SelectJupyterInterpreterRequest): Promise<KernelCommandResult> {
    return this.registry.runExclusive(request.notebook_uri, async () => {
      const document = await this.requireDocument(request.notebook_uri);
      await this.mutationService.ensureStableCellIds(document);
      return this.kernelCommandService.selectJupyterInterpreter(document);
    });
  }

  public async restartKernel(request: RestartKernelRequest): Promise<KernelCommandResult> {
    return this.registry.runExclusive(request.notebook_uri, async () => {
      const document = await this.requireDocument(request.notebook_uri);
      await this.mutationService.ensureStableCellIds(document);
      return this.kernelCommandService.restartKernel(document);
    });
  }

  public async interruptExecution(request: InterruptExecutionRequest): Promise<KernelCommandResult> {
    return this.registry.runExclusive(request.notebook_uri, async () => {
      const document = await this.requireDocument(request.notebook_uri);
      await this.mutationService.ensureStableCellIds(document);
      return this.kernelCommandService.interruptExecution(document);
    });
  }

  public async waitForKernelReady(request: WaitForKernelReadyRequest): Promise<WaitForKernelReadyResult> {
    const document = await this.requireDocument(request.notebook_uri);
    await this.mutationService.ensureStableCellIds(document);
    return this.kernelCommandService.waitForKernelReady(document, request);
  }

  public async summarizeNotebookState(notebookUri: string): Promise<SummarizeNotebookStateResult> {
    const document = await this.requireDocument(notebookUri);
    await this.mutationService.ensureStableCellIds(document);
    await this.hostKernelObservationService.refresh(document);
    return this.readService.summarizeNotebookState(document);
  }

  private resolveOpenNotebookUri(request: OpenNotebookRequest): vscode.Uri {
    let uri: vscode.Uri;
    try {
      uri = vscode.Uri.parse(request.notebook_uri);
    } catch {
      fail({
        code: "InvalidRequest",
        message: "open_notebook requires an absolute notebook_uri.",
        recoverable: true,
      });
    }

    if (!uri.scheme) {
      fail({
        code: "InvalidRequest",
        message: "open_notebook requires an absolute notebook_uri.",
        recoverable: true,
      });
    }

    if (uri.scheme === "file" && !pathIsAbsolute(uri.fsPath)) {
      fail({
        code: "InvalidRequest",
        message: "open_notebook requires an absolute file URI.",
        recoverable: true,
      });
    }

    return uri;
  }

  private async requireDocument(notebookUri: string): Promise<vscode.NotebookDocument> {
    const document = this.registry.getDocument(notebookUri);
    if (document) {
      this.assertSupportedDocument(document);
      return document;
    }

    try {
      const opened = await vscode.workspace.openNotebookDocument(vscode.Uri.parse(notebookUri));
      this.assertSupportedDocument(opened);
      this.registry.ensureState(opened);
      return opened;
    } catch (error) {
      fail({
        code: "NotebookNotFound",
        message: `Notebook not found: ${notebookUri}`,
        detail: error instanceof Error ? error.message : error,
        recoverable: true,
      });
      throw new Error("Unreachable");
    }
  }

  private requireDocumentSync(notebookUri: string): vscode.NotebookDocument {
    const document = this.registry.getDocument(notebookUri);
    if (!document) {
      fail({
        code: "NotebookNotOpen",
        message: `Notebook is not open: ${notebookUri}`,
      });
    }

    return document as vscode.NotebookDocument;
  }

  private assertSupportedDocument(document: vscode.NotebookDocument): void {
    if (document.uri.scheme !== "file") {
      fail({
        code: "UnsupportedEnvironment",
        message: `Only file-backed notebooks are supported in the MVP. Got ${document.uri.scheme}.`,
      });
    }

    if (document.notebookType !== "jupyter-notebook") {
      fail({
        code: "UnsupportedNotebookType",
        message: `Unsupported notebook type: ${document.notebookType}`,
      });
    }
  }
}

function pathIsAbsolute(filePath: string): boolean {
  return filePath.startsWith("/");
}
