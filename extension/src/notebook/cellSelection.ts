import * as vscode from "vscode";
import { getStoredCellId } from "./cells";

export interface NotebookCellSelection {
  range?: { start: number; end: number };
  cell_ids?: readonly string[];
}

export function selectNotebookCells(
  document: vscode.NotebookDocument,
  selection?: NotebookCellSelection,
): vscode.NotebookCell[] {
  let cells = document.getCells();

  if (selection?.cell_ids && selection.cell_ids.length > 0) {
    const wanted = new Set(selection.cell_ids);
    cells = cells.filter((cell) => {
      const cellId = getStoredCellId(cell);
      return cellId !== null && wanted.has(cellId);
    });
  } else if (selection?.range) {
    cells = cells.slice(selection.range.start, selection.range.end);
  }

  return cells;
}
