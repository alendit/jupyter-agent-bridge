import * as vscode from "vscode";
import { buildNotebookCellPreviews, buildNotebookOutline } from "@jupyter-agent-bridge/notebook-domain";
import {
  CellExecutionSummary,
  CellSnapshot,
  GetKernelInfoResult,
  KernelInfo,
  ListNotebookCellsRequest,
  ListNotebookCellsResult,
  ListOpenNotebooksResult,
  MutationResult,
  NotebookChangedDetail,
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
import { cloneMetadata, computeSourceFingerprint, getStoredCellId, notebookCellKindToProtocol } from "./cells";
import { NotebookRegistry } from "./NotebookRegistry";
import { OutputNormalizationService } from "./OutputNormalizationService";
import { KernelInspectionService } from "./KernelInspectionService";
import { toCellExecutionSummary } from "./executionSummary";
import { selectNotebookCells } from "./cellSelection";

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
    const cells = selectNotebookCells(document, {
      range: request.range,
      cell_ids: request.cell_ids,
    });
    const lineSpans = this.computeNotebookLineSpans(document);

    return {
      notebook: this.toNotebookSummary(document),
      cells: cells.map((cell) =>
        this.toCellSnapshot(
          cell,
          request.include_outputs ?? false,
          request.include_rich_output_text ?? false,
          lineSpans.get(getStoredCellId(cell) ?? ""),
        ),
      ),
    };
  }

  public listNotebookCells(document: vscode.NotebookDocument, request: ListNotebookCellsRequest): ListNotebookCellsResult {
    const selectedCells = selectNotebookCells(document, {
      range: request.range,
      cell_ids: request.cell_ids,
    });
    const outline = this.getNotebookOutline(document).headings;
    const lineSpans = this.computeNotebookLineSpans(document);

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
              notebook_line_start: lineSpans.get(cellId)?.start ?? 1,
              notebook_line_end: lineSpans.get(cellId)?.end ?? 1,
              source: cell.document.getText(),
              source_fingerprint: computeSourceFingerprint(cell.document.getText()),
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

  public assertExpectedCellSources(
    document: vscode.NotebookDocument,
    expectedCellSourceFingerprintById: Record<string, string> | undefined,
    requestedCellIds?: readonly string[],
  ): void {
    if (!expectedCellSourceFingerprintById) {
      return;
    }

    const requestedCellIdSet = requestedCellIds ? new Set(requestedCellIds) : undefined;
    const staleCellIds: string[] = [];
    const mismatchSummaries: string[] = [];

    for (const [cellId, expectedFingerprint] of Object.entries(expectedCellSourceFingerprintById)) {
      if (requestedCellIdSet && !requestedCellIdSet.has(cellId)) {
        fail({
          code: "InvalidRequest",
          message: `Unexpected source guard for non-targeted cell ${cellId}.`,
          recoverable: true,
        });
      }

      const cell = this.requireCell(document, cellId);
      const currentFingerprint = computeSourceFingerprint(cell.document.getText());
      if (currentFingerprint === expectedFingerprint) {
        continue;
      }

      staleCellIds.push(cellId);
      mismatchSummaries.push(`${cellId}: expected ${expectedFingerprint}, got ${currentFingerprint}`);
    }

    if (staleCellIds.length === 0) {
      return;
    }

    fail({
      code: "NotebookChanged",
      message: `Cell source changed since last read. ${mismatchSummaries.join("; ")}.`,
      detail: this.toNotebookChangedDetail(document, staleCellIds),
      recoverable: true,
    });
  }

  public toNotebookChangedDetail(
    document: vscode.NotebookDocument,
    cellIds: readonly string[],
  ): NotebookChangedDetail {
    return {
      notebook_uri: document.uri.toString(),
      notebook_version: this.registry.getVersion(document.uri.toString()),
      cells: cellIds.map((cellId) => this.toCellSnapshot(this.requireCell(document, cellId), false)),
    };
  }

  public toNotebookSnapshot(
    document: vscode.NotebookDocument,
    includeOutputs = true,
    includeRichOutputText = false,
  ): NotebookSnapshot {
    const lineSpans = this.computeNotebookLineSpans(document);
    return {
      notebook: this.toNotebookSummary(document),
      cells: document
        .getCells()
        .map((cell) =>
          this.toCellSnapshot(cell, includeOutputs, includeRichOutputText, lineSpans.get(getStoredCellId(cell) ?? "")),
        ),
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

  public toCellSnapshot(
    cell: vscode.NotebookCell,
    includeOutputs: boolean,
    includeRichOutputText = false,
    lineSpan?: { start: number; end: number },
  ): CellSnapshot {
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
      notebook_line_start: lineSpan?.start ?? 1,
      notebook_line_end: lineSpan?.end ?? Math.max(1, cell.document.lineCount),
      source: cell.document.getText(),
      source_fingerprint: computeSourceFingerprint(cell.document.getText()),
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

  private computeNotebookLineSpans(
    document: vscode.NotebookDocument,
  ): Map<string, { start: number; end: number }> {
    const spans = new Map<string, { start: number; end: number }>();
    let nextLine = 1;

    for (const cell of document.getCells()) {
      const cellId = getStoredCellId(cell);
      if (!cellId) {
        continue;
      }

      const lineCount = Math.max(1, cell.document.lineCount);
      spans.set(cellId, {
        start: nextLine,
        end: nextLine + lineCount - 1,
      });
      nextLine += lineCount + 1;
    }

    return spans;
  }

}
