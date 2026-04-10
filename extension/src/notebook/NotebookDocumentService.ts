import * as vscode from "vscode";
import { OpenNotebookRequest, fail } from "../../../packages/protocol/src";
import { NotebookRegistry } from "./NotebookRegistry";
import { NotebookMutationService } from "./NotebookMutationService";

export class NotebookDocumentService {
  public constructor(
    private readonly registry: NotebookRegistry,
    private readonly mutationService: NotebookMutationService,
  ) {}

  public async openNotebook(request: OpenNotebookRequest): Promise<vscode.NotebookDocument> {
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
    return document;
  }

  public async requireReadyDocument(notebookUri: string): Promise<vscode.NotebookDocument> {
    const document = await this.requireDocument(notebookUri);
    await this.mutationService.ensureStableCellIds(document);
    return document;
  }

  public requireDocumentSync(notebookUri: string): vscode.NotebookDocument {
    const document = this.registry.getDocument(notebookUri);
    if (!document) {
      fail({
        code: "NotebookNotOpen",
        message: `Notebook is not open: ${notebookUri}`,
      });
    }

    return document as vscode.NotebookDocument;
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
