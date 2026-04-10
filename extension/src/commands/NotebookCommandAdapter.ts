import * as vscode from "vscode";

export class NotebookCommandAdapter {
  public constructor(private readonly log?: (message: string) => void) {}

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
    const executeRanges = editor.selections.map((selection) => ({
      start: selection.start,
      end: selection.end,
    }));
    this.log?.(
      `execute_cells.command notebook_uri=${JSON.stringify(document.uri.toString())} active_editor_uri=${JSON.stringify(vscode.window.activeNotebookEditor?.notebook.uri.toString() ?? null)} target_editor_uri=${JSON.stringify(editor.notebook.uri.toString())} visible_editor_uris=${JSON.stringify(vscode.window.visibleNotebookEditors.map((candidate) => candidate.notebook.uri.toString()))} ranges=${JSON.stringify(executeRanges)}`,
    );

    await vscode.commands.executeCommand("notebook.cell.execute", {
      notebookEditor: editor,
      ranges: executeRanges,
    });
  }
}
