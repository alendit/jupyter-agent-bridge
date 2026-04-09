import * as vscode from "vscode";
import {
  DeleteCellRequest,
  ExecuteCellsRequest,
  ExecuteCellsResult,
  GetKernelInfoResult,
  InsertCellRequest,
  ListOpenNotebooksResult,
  MutationResult,
  OpenNotebookRequest,
  OpenNotebookResult,
  ReadCellOutputsRequest,
  ReadCellOutputsResult,
  ReadNotebookRequest,
  ReadNotebookResult,
  ReplaceCellSourceRequest,
  MoveCellRequest,
  SummarizeNotebookStateResult,
} from "../../../packages/protocol/src";
import { fail } from "../../../packages/protocol/src";
import { NotebookRegistry } from "./NotebookRegistry";
import { NotebookReadService } from "./NotebookReadService";
import { NotebookMutationService } from "./NotebookMutationService";
import { NotebookExecutionService } from "./NotebookExecutionService";

export class NotebookBridgeService {
  public constructor(
    private readonly registry: NotebookRegistry,
    private readonly readService: NotebookReadService,
    private readonly mutationService: NotebookMutationService,
    private readonly executionService: NotebookExecutionService,
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
    return this.readService.toNotebookSnapshot(document, true);
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
      await this.mutationService.insertCell(document, request);
      return this.readService.toNotebookSnapshot(this.requireDocumentSync(request.notebook_uri), true);
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
      await this.mutationService.replaceCellSource(document, request);
      return this.readService.toNotebookSnapshot(this.requireDocumentSync(request.notebook_uri), true);
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
      await this.mutationService.deleteCell(document, request);
      return this.readService.toNotebookSnapshot(this.requireDocumentSync(request.notebook_uri), true);
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
      await this.mutationService.moveCell(document, request);
      return this.readService.toNotebookSnapshot(this.requireDocumentSync(request.notebook_uri), true);
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
    return this.readService.readCellOutputs(document, cell);
  }

  public async getKernelInfo(notebookUri: string): Promise<GetKernelInfoResult> {
    const document = await this.requireDocument(notebookUri);
    await this.mutationService.ensureStableCellIds(document);
    return this.readService.getKernelInfo(document);
  }

  public async summarizeNotebookState(notebookUri: string): Promise<SummarizeNotebookStateResult> {
    const document = await this.requireDocument(notebookUri);
    await this.mutationService.ensureStableCellIds(document);
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
