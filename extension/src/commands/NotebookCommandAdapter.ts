import * as vscode from "vscode";

const COLLAPSE_CELL_INPUT_COMMAND_ID = "notebook.cell.collapseCellInput";
const EXPAND_CELL_INPUT_COMMAND_ID = "notebook.cell.expandCellInput";
const FOCUS_IN_OUTPUT_COMMAND_ID = "notebook.cell.focusInOutput";

export class NotebookCommandAdapter {
  public constructor(private readonly log?: (message: string) => void) {}

  public async ensureEditor(
    document: vscode.NotebookDocument,
    options?: { preserveFocus?: boolean },
  ): Promise<vscode.NotebookEditor> {
    const active = vscode.window.activeNotebookEditor;
    if (active && active.notebook.uri.toString() === document.uri.toString()) {
      return active;
    }

    return vscode.window.showNotebookDocument(document, {
      preserveFocus: options?.preserveFocus ?? true,
      preview: false,
    });
  }

  public async executeCells(
    document: vscode.NotebookDocument,
    ranges: readonly vscode.NotebookRange[],
  ): Promise<void> {
    const editor = await this.ensureEditor(document, { preserveFocus: false });
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

  public async revealCells(
    document: vscode.NotebookDocument,
    ranges: readonly vscode.NotebookRange[],
    options?: {
      select?: boolean;
      revealType?: vscode.NotebookEditorRevealType;
    },
  ): Promise<vscode.NotebookEditor> {
    const editor = await this.ensureEditor(document, { preserveFocus: false });
    if (options?.select ?? true) {
      this.setSelections(editor, ranges);
    }

    const revealRange =
      ranges.length === 0
        ? new vscode.NotebookRange(0, 0)
        : new vscode.NotebookRange(ranges[0].start, ranges[ranges.length - 1].end);
    editor.revealRange(revealRange, options?.revealType ?? vscode.NotebookEditorRevealType.InCenterIfOutsideViewport);
    this.log?.(
      `reveal_cells.command notebook_uri=${JSON.stringify(document.uri.toString())} active_editor_uri=${JSON.stringify(vscode.window.activeNotebookEditor?.notebook.uri.toString() ?? null)} target_editor_uri=${JSON.stringify(editor.notebook.uri.toString())} visible_editor_uris=${JSON.stringify(vscode.window.visibleNotebookEditors.map((candidate) => candidate.notebook.uri.toString()))} ranges=${JSON.stringify(ranges.map((range) => ({ start: range.start, end: range.end })))} select=${options?.select ?? true}`,
    );
    return editor;
  }

  public async setCellInputVisibility(
    document: vscode.NotebookDocument,
    ranges: readonly vscode.NotebookRange[],
    visibility: "collapse" | "expand",
  ): Promise<void> {
    await this.ensureEditor(document, { preserveFocus: false });
    await vscode.commands.executeCommand(
      visibility === "collapse" ? COLLAPSE_CELL_INPUT_COMMAND_ID : EXPAND_CELL_INPUT_COMMAND_ID,
      this.toMultiCellCommandArgs(document, ranges),
    );
    this.log?.(
      `set_cell_input_visibility.command notebook_uri=${JSON.stringify(document.uri.toString())} visibility=${JSON.stringify(visibility)} ranges=${JSON.stringify(ranges.map((range) => ({ start: range.start, end: range.end })))}`,
    );
  }

  public async focusCellOutput(
    document: vscode.NotebookDocument,
    targetRange: vscode.NotebookRange,
    selectedRanges: readonly vscode.NotebookRange[] = [targetRange],
  ): Promise<vscode.NotebookEditor> {
    const editor = await this.ensureEditor(document, { preserveFocus: false });
    this.setSelections(editor, selectedRanges, targetRange);
    await vscode.commands.executeCommand(FOCUS_IN_OUTPUT_COMMAND_ID);
    this.log?.(
      `focus_cell_output.command notebook_uri=${JSON.stringify(document.uri.toString())} target_range=${JSON.stringify({ start: targetRange.start, end: targetRange.end })} ranges=${JSON.stringify(selectedRanges.map((range) => ({ start: range.start, end: range.end })))}`,
    );
    return editor;
  }

  private setSelections(
    editor: vscode.NotebookEditor,
    ranges: readonly vscode.NotebookRange[],
    primaryRange: vscode.NotebookRange | undefined = ranges[0],
  ): void {
    if (!primaryRange) {
      return;
    }

    const secondaryRanges = ranges.filter(
      (range) => range.start !== primaryRange.start || range.end !== primaryRange.end,
    );
    editor.selection = primaryRange;
    editor.selections = [primaryRange, ...secondaryRanges];
  }

  private toMultiCellCommandArgs(document: vscode.NotebookDocument, ranges: readonly vscode.NotebookRange[]) {
    return {
      document: document.uri,
      ranges: ranges.map((range) => ({ start: range.start, end: range.end })),
    };
  }
}
