import * as vscode from "vscode";
import {
  DefinitionTarget,
  FindSymbolsRequest,
  FindSymbolsResult,
  FormatCellRequest,
  FormatCellResult,
  GoToDefinitionRequest,
  GoToDefinitionResult,
  NotebookDiagnostic,
  NotebookDiagnosticsRequest,
  NotebookDiagnosticsResult,
} from "../../../packages/protocol/src";
import { fail } from "../../../packages/protocol/src";
import { NotebookMutationService } from "./NotebookMutationService";
import { NotebookReadService } from "./NotebookReadService";
import { NotebookRegistry } from "./NotebookRegistry";
import { computeSourceSha256, getStoredCellId } from "./cells";
import {
  applyTextEdits,
  diagnosticCodeToString,
  diagnosticSeverityToProtocol,
  flattenProvidedSymbols,
  rangeToOneBased,
} from "./languageFeatures";

const DEFAULT_MAX_RESULTS = 200;

interface CellRef {
  notebook_uri: string;
  cell_id: string;
  cell_index: number;
}

interface LocationLike {
  uri: vscode.Uri;
  range: vscode.Range;
}

interface LocationLinkLike {
  targetUri: vscode.Uri;
  targetRange: vscode.Range;
  targetSelectionRange?: vscode.Range;
}

export class NotebookLanguageService {
  public constructor(
    private readonly registry: NotebookRegistry,
    private readonly readService: NotebookReadService,
    private readonly mutationService: NotebookMutationService,
  ) {}

  public getDiagnostics(
    document: vscode.NotebookDocument,
    request: NotebookDiagnosticsRequest,
  ): NotebookDiagnosticsResult {
    const selectedCells = this.selectCells(document, request.range, request.cell_ids);
    const allowedSeverities = request.severities ? new Set(request.severities) : undefined;
    const maxResults = request.max_results ?? DEFAULT_MAX_RESULTS;
    const diagnostics: NotebookDiagnostic[] = [];
    let truncated = false;

    for (const cell of selectedCells) {
      if (diagnostics.length >= maxResults) {
        truncated = true;
        break;
      }

      const cellId = getStoredCellId(cell);
      if (!cellId) {
        continue;
      }

      const sourceSha256 = computeSourceSha256(cell.document.getText());
      for (const diagnostic of vscode.languages.getDiagnostics(cell.document.uri)) {
        const severity = diagnosticSeverityToProtocol(diagnostic.severity);
        if (allowedSeverities && !allowedSeverities.has(severity)) {
          continue;
        }

        if (diagnostics.length >= maxResults) {
          truncated = true;
          break;
        }

        const range = rangeToOneBased(diagnostic.range);
        diagnostics.push({
          cell_id: cellId,
          cell_index: cell.index,
          severity,
          message: diagnostic.message,
          source: diagnostic.source,
          code: diagnosticCodeToString(diagnostic.code),
          start_line: range.start_line,
          start_column: range.start_column,
          end_line: range.end_line,
          end_column: range.end_column,
          source_sha256: sourceSha256,
        });
      }
    }

    return {
      notebook_uri: document.uri.toString(),
      notebook_version: this.registry.getVersion(document.uri.toString()),
      truncated,
      diagnostics,
    };
  }

  public async findSymbols(
    document: vscode.NotebookDocument,
    request: FindSymbolsRequest,
  ): Promise<FindSymbolsResult> {
    const selectedCells = this.selectCells(document, request.range, request.cell_ids);
    const maxResults = request.max_results ?? DEFAULT_MAX_RESULTS;
    const symbols: FindSymbolsResult["symbols"] = [];
    let truncated = false;

    for (const cell of selectedCells) {
      if (symbols.length >= maxResults) {
        truncated = true;
        break;
      }

      const cellId = getStoredCellId(cell);
      if (!cellId) {
        continue;
      }

      const provided = await vscode.commands.executeCommand<unknown>(
        "vscode.executeDocumentSymbolProvider",
        cell.document.uri,
      );
      if (!Array.isArray(provided) || provided.length === 0) {
        continue;
      }

      const flattened = flattenProvidedSymbols(provided, {
        query: request.query,
        maxResults: maxResults - symbols.length,
      });
      symbols.push(
        ...flattened.symbols.map((symbol) => ({
          cell_id: cellId,
          cell_index: cell.index,
          name: symbol.name,
          detail: symbol.detail,
          kind: symbol.kind,
          container_name: symbol.container_name,
          start_line: symbol.start_line,
          start_column: symbol.start_column,
          end_line: symbol.end_line,
          end_column: symbol.end_column,
          selection_start_line: symbol.selection_start_line,
          selection_start_column: symbol.selection_start_column,
          selection_end_line: symbol.selection_end_line,
          selection_end_column: symbol.selection_end_column,
          source_sha256: computeSourceSha256(cell.document.getText()),
        })),
      );
      if (flattened.truncated) {
        truncated = true;
        break;
      }
    }

    return {
      notebook_uri: document.uri.toString(),
      notebook_version: this.registry.getVersion(document.uri.toString()),
      query: request.query,
      truncated,
      symbols,
    };
  }

  public async goToDefinition(
    document: vscode.NotebookDocument,
    request: GoToDefinitionRequest,
  ): Promise<GoToDefinitionResult> {
    const cell = this.readService.requireCell(document, request.cell_id);
    const currentSourceSha256 = computeSourceSha256(cell.document.getText());
    if (request.expected_cell_source_sha256 && request.expected_cell_source_sha256 !== currentSourceSha256) {
      fail({
        code: "NotebookChanged",
        message: `Cell source changed since last read. Expected sha256 ${request.expected_cell_source_sha256}, got ${currentSourceSha256}.`,
        recoverable: true,
      });
    }

    const position = new vscode.Position(request.line - 1, request.column - 1);
    const rawDefinitions = await vscode.commands.executeCommand<unknown>(
      "vscode.executeDefinitionProvider",
      cell.document.uri,
      position,
    );
    const definitions = Array.isArray(rawDefinitions) ? rawDefinitions : rawDefinitions ? [rawDefinitions] : [];
    const mapped = this.deduplicateDefinitions(
      definitions.flatMap((entry) => this.toDefinitionTargets(entry)),
    );

    return {
      notebook_uri: document.uri.toString(),
      notebook_version: this.registry.getVersion(document.uri.toString()),
      cell_id: request.cell_id,
      line: request.line,
      column: request.column,
      source_sha256: currentSourceSha256,
      definitions: mapped,
    };
  }

  public async formatCell(document: vscode.NotebookDocument, request: FormatCellRequest): Promise<FormatCellResult> {
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

    const formatOptions = this.readFormattingOptions(cell.document.uri);
    const rawEdits = await vscode.commands.executeCommand<unknown>(
      "vscode.executeFormatDocumentProvider",
      cell.document.uri,
      formatOptions,
    );

    if (rawEdits === undefined) {
      return {
        ...this.readService.toMutationResult(document, "format_cell", [], [], false),
        operation: "format_cell",
        formatter_found: false,
        formatted: false,
        applied_edit_count: 0,
        before_source_sha256: currentSourceSha256,
        after_source_sha256: currentSourceSha256,
      };
    }

    const edits = Array.isArray(rawEdits) ? (rawEdits as vscode.TextEdit[]) : [];
    const { updatedSource, appliedEditCount } = applyTextEdits(currentSource, edits);

    if (updatedSource === currentSource) {
      return {
        ...this.readService.toMutationResult(document, "format_cell", [], [], false),
        operation: "format_cell",
        formatter_found: true,
        formatted: false,
        applied_edit_count: appliedEditCount,
        before_source_sha256: currentSourceSha256,
        after_source_sha256: currentSourceSha256,
      };
    }

    const outcome = await this.mutationService.replaceCellSource(document, {
      notebook_uri: request.notebook_uri,
      cell_id: request.cell_id,
      source: updatedSource,
    });
    const mutation = this.readService.toMutationResult(
      document,
      "format_cell",
      outcome.changed_cell_ids,
      outcome.deleted_cell_ids,
      outcome.outline_maybe_changed,
    );

    return {
      ...mutation,
      operation: "format_cell",
      formatter_found: true,
      formatted: true,
      applied_edit_count: appliedEditCount,
      before_source_sha256: currentSourceSha256,
      after_source_sha256: computeSourceSha256(updatedSource),
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

  private readFormattingOptions(documentUri: vscode.Uri): vscode.FormattingOptions {
    const editorConfig = vscode.workspace.getConfiguration("editor", documentUri);
    const tabSize = editorConfig.get<number>("tabSize", 4);
    const insertSpaces = editorConfig.get<boolean>("insertSpaces", true);
    return {
      tabSize: typeof tabSize === "number" && tabSize > 0 ? tabSize : 4,
      insertSpaces,
    };
  }

  private toDefinitionTargets(definition: unknown): DefinitionTarget[] {
    if (this.isLocationLinkLike(definition)) {
      const targetRange = rangeToOneBased(definition.targetRange);
      const targetSelection = definition.targetSelectionRange
        ? rangeToOneBased(definition.targetSelectionRange)
        : undefined;
      return [this.withNotebookCellTarget(definition.targetUri, targetRange, targetSelection)];
    }

    if (this.isLocationLike(definition)) {
      const targetRange = rangeToOneBased(definition.range);
      return [this.withNotebookCellTarget(definition.uri, targetRange)];
    }

    return [];
  }

  private withNotebookCellTarget(
    targetUri: vscode.Uri,
    targetRange: ReturnType<typeof rangeToOneBased>,
    targetSelection?: ReturnType<typeof rangeToOneBased>,
  ): DefinitionTarget {
    const notebookCell = this.findNotebookCellByDocumentUri(targetUri);
    if (notebookCell) {
      return {
        target_uri: notebookCell.notebook_uri,
        target_notebook_uri: notebookCell.notebook_uri,
        target_cell_id: notebookCell.cell_id,
        target_cell_index: notebookCell.cell_index,
        start_line: targetRange.start_line,
        start_column: targetRange.start_column,
        end_line: targetRange.end_line,
        end_column: targetRange.end_column,
        target_selection_start_line: targetSelection?.start_line,
        target_selection_start_column: targetSelection?.start_column,
        target_selection_end_line: targetSelection?.end_line,
        target_selection_end_column: targetSelection?.end_column,
      };
    }

    return {
      target_uri: targetUri.toString(),
      start_line: targetRange.start_line,
      start_column: targetRange.start_column,
      end_line: targetRange.end_line,
      end_column: targetRange.end_column,
      target_selection_start_line: targetSelection?.start_line,
      target_selection_start_column: targetSelection?.start_column,
      target_selection_end_line: targetSelection?.end_line,
      target_selection_end_column: targetSelection?.end_column,
    };
  }

  private findNotebookCellByDocumentUri(targetUri: vscode.Uri): CellRef | undefined {
    const normalizedTarget = targetUri.toString();
    for (const document of this.registry.listDocuments()) {
      for (const cell of document.getCells()) {
        if (cell.document.uri.toString() !== normalizedTarget) {
          continue;
        }

        const cellId = getStoredCellId(cell);
        if (!cellId) {
          return undefined;
        }

        return {
          notebook_uri: document.uri.toString(),
          cell_id: cellId,
          cell_index: cell.index,
        };
      }
    }

    return undefined;
  }

  private deduplicateDefinitions(definitions: readonly DefinitionTarget[]): DefinitionTarget[] {
    const seen = new Set<string>();
    const deduplicated: DefinitionTarget[] = [];

    for (const definition of definitions) {
      const key = [
        definition.target_uri,
        definition.target_cell_id ?? "",
        definition.start_line,
        definition.start_column,
        definition.end_line,
        definition.end_column,
      ].join(":");
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      deduplicated.push(definition);
    }

    return deduplicated;
  }

  private isLocationLike(value: unknown): value is LocationLike {
    return (
      value instanceof vscode.Location ||
      (value !== null &&
        typeof value === "object" &&
        "uri" in value &&
        "range" in value &&
        (value as { uri: unknown }).uri instanceof vscode.Uri &&
        (value as { range: unknown }).range instanceof vscode.Range)
    );
  }

  private isLocationLinkLike(value: unknown): value is LocationLinkLike {
    return (
      value !== null &&
      typeof value === "object" &&
      "targetUri" in value &&
      "targetRange" in value &&
      (value as { targetUri: unknown }).targetUri instanceof vscode.Uri &&
      (value as { targetRange: unknown }).targetRange instanceof vscode.Range
    );
  }
}
