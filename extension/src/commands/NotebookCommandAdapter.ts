import * as vscode from "vscode";

export class NotebookCommandAdapter {
  public async ensureEditor(document: vscode.NotebookDocument): Promise<vscode.NotebookEditor> {
    const active = vscode.window.activeNotebookEditor;
    if (active && active.notebook.uri.toString() === document.uri.toString()) {
      return active;
    }

    return vscode.window.showNotebookDocument(document, {
      preserveFocus: true,
      preview: false,
    });
  }

  public async executeCells(
    document: vscode.NotebookDocument,
    ranges: readonly vscode.NotebookRange[],
  ): Promise<void> {
    const editor = await this.ensureEditor(document);
    editor.selections = [...ranges];

    await vscode.commands.executeCommand("notebook.cell.execute", {
      notebookEditor: editor,
      ranges: editor.selections.map((selection) => ({
        start: selection.start,
        end: selection.end,
      })),
    });
  }
}
