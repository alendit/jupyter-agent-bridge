import * as vscode from "vscode";
import {
  DeleteCellRequest,
  InsertCellRequest,
  MoveCellRequest,
  ReplaceCellSourceRequest,
} from "../../../packages/protocol/src";
import { fail } from "../../../packages/protocol/src";
import {
  createGeneratedCellId,
  getStoredCellId,
  protocolCellKindToNotebook,
  toNotebookCellData,
  withStoredCellId,
} from "./cells";

export interface MutationOutcome {
  operation: "insert_cell" | "replace_cell_source" | "delete_cell" | "move_cell";
  changed_cell_ids: string[];
  deleted_cell_ids: string[];
  outline_maybe_changed: boolean;
}

export class NotebookMutationService {
  public async ensureStableCellIds(document: vscode.NotebookDocument): Promise<vscode.NotebookDocument> {
    const edits: vscode.NotebookEdit[] = [];

    for (const cell of document.getCells()) {
      if (getStoredCellId(cell)) {
        continue;
      }

      edits.push(
        vscode.NotebookEdit.updateCellMetadata(
          cell.index,
          withStoredCellId(cell.metadata as Record<string, unknown> | undefined, createGeneratedCellId()),
        ),
      );
    }

    if (edits.length === 0) {
      return document;
    }

    const workspaceEdit = new vscode.WorkspaceEdit();
    workspaceEdit.set(document.uri, edits);

    const applied = await vscode.workspace.applyEdit(workspaceEdit);
    if (!applied) {
      fail({
        code: "NotebookBusy",
        message: "Failed to persist stable cell ids",
      });
    }

    return document;
  }

  public assertExpectedVersion(currentVersion: number, expectedVersion?: number): void {
    if (expectedVersion !== undefined && currentVersion !== expectedVersion) {
      fail({
        code: "NotebookChanged",
        message: `Notebook version mismatch. Expected ${expectedVersion}, got ${currentVersion}.`,
        recoverable: true,
      });
    }
  }

  public async insertCell(document: vscode.NotebookDocument, request: InsertCellRequest): Promise<MutationOutcome> {
    const index = this.resolveInsertIndex(document, request.position);
    const cellId = createGeneratedCellId();
    const cellData = new vscode.NotebookCellData(
      protocolCellKindToNotebook(request.cell.kind),
      request.cell.source,
      request.cell.language ?? (request.cell.kind === "code" ? "python" : "markdown"),
    );
    cellData.metadata = withStoredCellId(request.cell.metadata, cellId);
    cellData.outputs = [];

    await this.applyNotebookEdits(document, [
      vscode.NotebookEdit.replaceCells(new vscode.NotebookRange(index, index), [cellData]),
    ]);

    return {
      operation: "insert_cell",
      changed_cell_ids: [cellId],
      deleted_cell_ids: [],
      outline_maybe_changed: request.cell.kind === "markdown",
    };
  }

  public async replaceCellSource(
    document: vscode.NotebookDocument,
    request: ReplaceCellSourceRequest,
  ): Promise<MutationOutcome> {
    const cell = this.requireCell(document, request.cell_id);
    const cellData = toNotebookCellData(cell, request.source);
    cellData.outputs = [];
    await this.applyNotebookEdits(document, [
      vscode.NotebookEdit.replaceCells(new vscode.NotebookRange(cell.index, cell.index + 1), [cellData]),
    ]);

    return {
      operation: "replace_cell_source",
      changed_cell_ids: [request.cell_id],
      deleted_cell_ids: [],
      outline_maybe_changed: cell.kind === vscode.NotebookCellKind.Markup,
    };
  }

  public async deleteCell(document: vscode.NotebookDocument, request: DeleteCellRequest): Promise<MutationOutcome> {
    const cell = this.requireCell(document, request.cell_id);
    await this.applyNotebookEdits(document, [
      vscode.NotebookEdit.replaceCells(new vscode.NotebookRange(cell.index, cell.index + 1), []),
    ]);

    return {
      operation: "delete_cell",
      changed_cell_ids: [],
      deleted_cell_ids: [request.cell_id],
      outline_maybe_changed: cell.kind === vscode.NotebookCellKind.Markup,
    };
  }

  public async moveCell(document: vscode.NotebookDocument, request: MoveCellRequest): Promise<MutationOutcome> {
    const cell = this.requireCell(document, request.cell_id);
    const sourceIndex = cell.index;
    const original = toNotebookCellData(cell);
    let targetIndex = request.target_index;

    if (targetIndex < 0 || targetIndex > document.cellCount) {
      fail({
        code: "InvalidRequest",
        message: `Target index out of bounds: ${targetIndex}`,
        recoverable: true,
      });
    }

    const edits: vscode.NotebookEdit[] = [];
    edits.push(vscode.NotebookEdit.replaceCells(new vscode.NotebookRange(sourceIndex, sourceIndex + 1), []));

    if (targetIndex > sourceIndex) {
      targetIndex -= 1;
    }

    edits.push(vscode.NotebookEdit.replaceCells(new vscode.NotebookRange(targetIndex, targetIndex), [original]));

    await this.applyNotebookEdits(document, edits);

    return {
      operation: "move_cell",
      changed_cell_ids: [request.cell_id],
      deleted_cell_ids: [],
      outline_maybe_changed: cell.kind === vscode.NotebookCellKind.Markup,
    };
  }

  private resolveInsertIndex(
    document: vscode.NotebookDocument,
    position: InsertCellRequest["position"],
  ): number {
    if ("before_index" in position) {
      return position.before_index;
    }

    if ("before_cell_id" in position) {
      return this.requireCell(document, position.before_cell_id).index;
    }

    if ("after_cell_id" in position) {
      return this.requireCell(document, position.after_cell_id).index + 1;
    }

    return document.cellCount;
  }

  private requireCell(document: vscode.NotebookDocument, cellId: string): vscode.NotebookCell {
    const cell = document.getCells().find((candidate) => getStoredCellId(candidate) === cellId);
    if (!cell) {
      fail({
        code: "CellNotFound",
        message: `Cell not found: ${cellId}`,
        recoverable: true,
      });
    }

    return cell as vscode.NotebookCell;
  }

  private async applyNotebookEdits(
    document: vscode.NotebookDocument,
    edits: readonly vscode.NotebookEdit[],
  ): Promise<void> {
    const workspaceEdit = new vscode.WorkspaceEdit();
    workspaceEdit.set(document.uri, [...edits]);
    const applied = await vscode.workspace.applyEdit(workspaceEdit);
    if (!applied) {
      fail({
        code: "NotebookBusy",
        message: "Notebook edit was rejected by VS Code.",
      });
    }
  }
}
