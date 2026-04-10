import * as vscode from "vscode";
import {
  CellExecutionSummary,
  CellSnapshot,
  GetKernelInfoResult,
  KernelInfo,
  ListNotebookCellsRequest,
  ListNotebookCellsResult,
  ListOpenNotebooksResult,
  MutationResult,
  NotebookOutlineResult,
  NotebookSnapshot,
  NotebookStateSummary,
  NotebookSummary,
  NormalizedOutput,
  ReadCellOutputsResult,
  ReadNotebookRequest,
  ReadNotebookResult,
  SummarizeNotebookStateResult,
} from "../../../packages/protocol/src";
import { fail } from "../../../packages/protocol/src";
import { computeSourceSha256, getStoredCellId, notebookCellKindToProtocol, cloneMetadata } from "./cells";
import { NotebookRegistry } from "./NotebookRegistry";
import { OutputNormalizationService } from "./OutputNormalizationService";
import { KernelInspectionService } from "./KernelInspectionService";
import { buildNotebookOutline } from "./outline";
import { buildNotebookCellPreviews } from "./previews";
import { toCellExecutionSummary } from "./executionSummary";

export class NotebookReadService {
  public constructor(
    private readonly registry: NotebookRegistry,
    private readonly outputNormalizationService: OutputNormalizationService,
    private readonly kernelInspectionService: KernelInspectionService,
  ) {}

  public listOpenNotebooks(documents: readonly vscode.NotebookDocument[]): ListOpenNotebooksResult {
    return documents.map((document) => this.toNotebookSummary(document));
  }

  public readNotebook(document: vscode.NotebookDocument, request: ReadNotebookRequest): ReadNotebookResult {
    const cells = this.selectCells(document, request.range, request.cell_ids);

    return {
      notebook: this.toNotebookSummary(document),
      cells: cells.map((cell) =>
        this.toCellSnapshot(cell, request.include_outputs ?? false, request.include_rich_output_text ?? false),
      ),
    };
  }

  public listNotebookCells(document: vscode.NotebookDocument, request: ListNotebookCellsRequest): ListNotebookCellsResult {
    const selectedCells = this.selectCells(document, request.range, request.cell_ids);
    const outline = this.getNotebookOutline(document).headings;

    return {
      notebook_uri: document.uri.toString(),
      notebook_version: this.registry.getVersion(document.uri.toString()),
      cells: buildNotebookCellPreviews(
        selectedCells.flatMap((cell) => {
          const cellId = getStoredCellId(cell);
          if (!cellId) {
            return [];
          }

          const execution = this.toExecutionSummary(cell);

          return [
            {
              cell_id: cellId,
              index: cell.index,
              kind: notebookCellKindToProtocol(cell.kind),
              language: cell.kind === vscode.NotebookCellKind.Code ? cell.document.languageId : null,
              source: cell.document.getText(),
              source_sha256: computeSourceSha256(cell.document.getText()),
              execution_status: execution?.status ?? null,
              execution_order: execution?.execution_order ?? null,
              started_at: execution?.started_at ?? null,
              ended_at: execution?.ended_at ?? null,
              output_mime_types: cell.outputs.flatMap((output) => output.items.map((item) => item.mime)),
            },
          ];
        }),
        outline,
      ),
    };
  }

  public readCellOutputs(
    document: vscode.NotebookDocument,
    cell: vscode.NotebookCell,
    includeRichOutputText = false,
  ): ReadCellOutputsResult {
    return {
      notebook_uri: document.uri.toString(),
      notebook_version: this.registry.getVersion(document.uri.toString()),
      cell_id: getStoredCellId(cell) ?? "",
      outputs: this.outputNormalizationService.normalizeOutputs(cell.outputs, {
        includeRichOutputText,
      }),
    };
  }

  public getNotebookOutline(document: vscode.NotebookDocument): NotebookOutlineResult {
    return {
      notebook_uri: document.uri.toString(),
      notebook_version: this.registry.getVersion(document.uri.toString()),
      headings: buildNotebookOutline(
        document.getCells().flatMap((cell) => {
          const cellId = getStoredCellId(cell);
          if (!cellId) {
            return [];
          }

          return [
            {
              cell_id: cellId,
              index: cell.index,
              kind: notebookCellKindToProtocol(cell.kind),
              source: cell.document.getText(),
            },
          ];
        }),
      ),
    };
  }

  private selectCells(
    document: vscode.NotebookDocument,
    range?: { start: number; end: number },
    cellIds?: readonly string[],
  ): vscode.NotebookCell[] {
    let cells = document.getCells();

    if (cellIds && cellIds.length > 0) {
      const wanted = new Set(cellIds);
      cells = cells.filter((cell) => {
        const cellId = getStoredCellId(cell);
        return cellId !== null && wanted.has(cellId);
      });
    } else if (range) {
      cells = cells.slice(range.start, range.end);
    }

    return cells;
  }

  public getKernelInfo(document: vscode.NotebookDocument): GetKernelInfoResult {
    return {
      notebook_uri: document.uri.toString(),
      notebook_version: this.registry.getVersion(document.uri.toString()),
      kernel: this.kernelInspectionService.getKernelInfo(document),
    };
  }

  public summarizeNotebookState(document: vscode.NotebookDocument): SummarizeNotebookStateResult {
    const errorCells: string[] = [];
    const imageCells: string[] = [];

    for (const cell of document.getCells()) {
      const cellId = getStoredCellId(cell);
      if (!cellId) {
        continue;
      }

      const outputs = this.outputNormalizationService.normalizeOutputs(cell.outputs);
      if (outputs.some((output) => output.kind === "error")) {
        errorCells.push(cellId);
      }
      if (outputs.some((output) => output.kind === "image")) {
        imageCells.push(cellId);
      }
    }

    const activeIndex = this.registry.getActiveCellIndex(document);
    const activeCellId =
      activeIndex === undefined ? undefined : getStoredCellId(document.cellAt(activeIndex)) ?? undefined;

    return {
      notebook_uri: document.uri.toString(),
      notebook_version: this.registry.getVersion(document.uri.toString()),
      dirty: document.isDirty,
      kernel: this.kernelInspectionService.getKernelInfo(document),
      cells_with_errors: errorCells.slice(0, 20),
      cells_with_images: imageCells.slice(0, 20),
      active_cell_id: activeCellId,
    };
  }

  public requireCell(document: vscode.NotebookDocument, cellId: string): vscode.NotebookCell {
    const cell = document.getCells().find((candidate) => getStoredCellId(candidate) === cellId);
    if (!cell) {
      fail({
        code: "CellNotFound",
        message: `Cell not found: ${cellId}`,
        recoverable: false,
      });
    }

    return cell as vscode.NotebookCell;
  }

  public toNotebookSnapshot(
    document: vscode.NotebookDocument,
    includeOutputs = true,
    includeRichOutputText = false,
  ): NotebookSnapshot {
    return {
      notebook: this.toNotebookSummary(document),
      cells: document.getCells().map((cell) => this.toCellSnapshot(cell, includeOutputs, includeRichOutputText)),
    };
  }

  public toMutationResult(
    document: vscode.NotebookDocument,
    operation: MutationResult["operation"],
    changedCellIds: readonly string[],
    deletedCellIds: readonly string[],
    outlineMaybeChanged: boolean,
  ): MutationResult {
    const remainingChangedCells = changedCellIds
      .map((cellId) => document.getCells().find((candidate) => getStoredCellId(candidate) === cellId))
      .filter((cell): cell is vscode.NotebookCell => Boolean(cell))
      .map((cell) => this.toCellSnapshot(cell, false));

    return {
      notebook: this.toNotebookSummary(document),
      operation,
      changed_cell_ids: [...changedCellIds],
      deleted_cell_ids: [...deletedCellIds],
      cells: remainingChangedCells,
      outline_maybe_changed: outlineMaybeChanged,
    };
  }

  public toNotebookSummary(document: vscode.NotebookDocument): NotebookSummary {
    return {
      notebook_uri: document.uri.toString(),
      notebook_type: document.notebookType,
      notebook_version: this.registry.getVersion(document.uri.toString()),
      dirty: document.isDirty,
      active_editor: this.registry.isActiveEditor(document),
      visible_editor_count: this.registry.getVisibleEditorCount(document),
      kernel: this.kernelInspectionService.getKernelInfo(document),
    };
  }

  public toCellSnapshot(cell: vscode.NotebookCell, includeOutputs: boolean, includeRichOutputText = false): CellSnapshot {
    const cellId = getStoredCellId(cell);
    if (!cellId) {
      fail({
        code: "CellNotFound",
        message: `Cell is missing a stable id at index ${cell.index}`,
      });
    }

    const snapshot: CellSnapshot = {
      cell_id: cellId,
      index: cell.index,
      kind: notebookCellKindToProtocol(cell.kind),
      language: cell.kind === vscode.NotebookCellKind.Code ? cell.document.languageId : null,
      source: cell.document.getText(),
      source_sha256: computeSourceSha256(cell.document.getText()),
      metadata: cloneMetadata(cell.metadata),
      execution: this.toExecutionSummary(cell),
    };

    if (includeOutputs) {
      snapshot.outputs = this.outputNormalizationService.normalizeOutputs(cell.outputs, {
        includeRichOutputText,
      });
    }

    return snapshot;
  }

  public toExecutionSummary(cell: vscode.NotebookCell): CellExecutionSummary | null {
    return toCellExecutionSummary(cell.executionSummary);
  }

  public normalizeCellOutputs(cell: vscode.NotebookCell): NormalizedOutput[] {
    return this.outputNormalizationService.normalizeOutputs(cell.outputs);
  }

  public getKernelInfoValue(document: vscode.NotebookDocument): KernelInfo {
    return this.kernelInspectionService.getKernelInfo(document);
  }
}
