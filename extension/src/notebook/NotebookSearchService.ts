import * as vscode from "vscode";
import { PreparedSearchCell, prepareSearchQuery, searchPreparedCells } from "@jupyter-agent-bridge/notebook-domain";
import { SearchNotebookRequest, SearchNotebookResult } from "../../../packages/protocol/src";
import { computeSourceSha256, getStoredCellId, notebookCellKindToProtocol } from "./cells";
import { NotebookRegistry } from "./NotebookRegistry";
import { NotebookReadService } from "./NotebookReadService";

interface PreparedSearchDocument {
  notebook_uri: string;
  notebook_version: number;
  cells: PreparedSearchCell[];
}

export class NotebookSearchService {
  private readonly cache = new Map<string, PreparedSearchDocument>();

  public constructor(
    private readonly registry: NotebookRegistry,
    private readonly readService: NotebookReadService,
  ) {
    this.registry.onDidChangeNotebook(({ notebook_uri }) => {
      this.cache.delete(notebook_uri);
    });
  }

  public search(document: vscode.NotebookDocument, request: SearchNotebookRequest): SearchNotebookResult {
    const preparedDocument = this.prepareDocument(document);
    const preparedQuery = prepareSearchQuery(request);
    const result = searchPreparedCells(preparedDocument.cells, preparedQuery);

    return {
      notebook_uri: document.uri.toString(),
      notebook_version: this.registry.getVersion(document.uri.toString()),
      query: preparedQuery.raw_query,
      regex: preparedQuery.regex,
      case_sensitive: preparedQuery.case_sensitive,
      whole_word: preparedQuery.whole_word,
      max_results: preparedQuery.max_results,
      truncated: result.truncated,
      matches: result.matches,
    };
  }

  private prepareDocument(document: vscode.NotebookDocument): PreparedSearchDocument {
    const notebookUri = document.uri.toString();
    const notebookVersion = this.registry.getVersion(notebookUri);
    const cached = this.cache.get(notebookUri);
    if (cached && cached.notebook_version === notebookVersion) {
      return cached;
    }

    const previews = this.readService.listNotebookCells(document, { notebook_uri: notebookUri }).cells;
    const sectionPathByCellId = new Map(previews.map((cell) => [cell.cell_id, cell.section_path]));

    const prepared: PreparedSearchDocument = {
      notebook_uri: notebookUri,
      notebook_version: notebookVersion,
      cells: document.getCells().flatMap((cell) => {
        const cellId = getStoredCellId(cell);
        if (!cellId) {
          return [];
        }

        const source = cell.document.getText();
        return [
          {
            cell_id: cellId,
            cell_index: cell.index,
            kind: notebookCellKindToProtocol(cell.kind),
            section_path: sectionPathByCellId.get(cellId) ?? [],
            source_sha256: computeSourceSha256(source),
            lines: source.split(/\r?\n/u),
            lines_lowercase: source.split(/\r?\n/u).map((line) => line.toLowerCase()),
          },
        ];
      }),
    };

    this.cache.set(notebookUri, prepared);
    return prepared;
  }
}
