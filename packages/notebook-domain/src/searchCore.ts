import {
  NotebookCellKind,
  SearchNotebookMatch,
  SearchNotebookRequest,
} from "@jupyter-agent-bridge/protocol/notebook";

const DEFAULT_MAX_RESULTS = 50;
const MAX_RESULTS_LIMIT = 200;

export interface PreparedSearchCell {
  cell_id: string;
  cell_index: number;
  kind: NotebookCellKind;
  section_path: string[];
  source_fingerprint: string;
  lines: string[];
  lines_lowercase: string[];
}

export interface PreparedSearchQuery {
  raw_query: string;
  case_sensitive: boolean;
  regex: boolean;
  whole_word: boolean;
  max_results: number;
  cell_kind?: NotebookCellKind;
  range?: { start: number; end: number };
  cell_ids?: Set<string>;
  matcher: (line: string, lineLowercase: string) => Array<{ column: number; match_text: string }>;
}

export function prepareSearchQuery(request: SearchNotebookRequest): PreparedSearchQuery {
  const rawQuery = request.query.trim();
  if (!rawQuery) {
    throw new Error("search_notebook.query must be a non-empty string.");
  }

  const caseSensitive = request.case_sensitive ?? false;
  const regex = request.regex ?? false;
  const wholeWord = request.whole_word ?? false;
  const maxResults = Math.min(Math.max(request.max_results ?? DEFAULT_MAX_RESULTS, 1), MAX_RESULTS_LIMIT);
  const flags = caseSensitive ? "g" : "gi";
  const pattern = regex ? rawQuery : escapeRegExp(rawQuery);
  let expression: RegExp;
  try {
    expression = new RegExp(wholeWord ? `\\b(?:${pattern})\\b` : pattern, flags);
  } catch (error) {
    throw new Error(`search_notebook.query is not a valid ${regex ? "regular expression" : "search pattern"}: ${error instanceof Error ? error.message : String(error)}`);
  }

  return {
    raw_query: rawQuery,
    case_sensitive: caseSensitive,
    regex,
    whole_word: wholeWord,
    max_results: maxResults,
    cell_kind: request.cell_kind,
    range: request.range,
    cell_ids: request.cell_ids ? new Set(request.cell_ids) : undefined,
    matcher: (line, lineLowercase) => {
      const haystack = caseSensitive ? line : lineLowercase;
      const localExpression = new RegExp(expression.source, expression.flags);
      const matches: Array<{ column: number; match_text: string }> = [];
      for (const match of haystack.matchAll(localExpression)) {
        const index = match.index ?? 0;
        const matchText = line.slice(index, index + (match[0]?.length ?? 0));
        matches.push({
          column: index + 1,
          match_text: matchText,
        });
      }

      return matches;
    },
  };
}

export function searchPreparedCells(
  cells: readonly PreparedSearchCell[],
  query: PreparedSearchQuery,
): { matches: SearchNotebookMatch[]; truncated: boolean } {
  const matches: SearchNotebookMatch[] = [];

  for (const cell of cells) {
    if (query.cell_kind && cell.kind !== query.cell_kind) {
      continue;
    }

    if (query.range && (cell.cell_index < query.range.start || cell.cell_index >= query.range.end)) {
      continue;
    }

    if (query.cell_ids && !query.cell_ids.has(cell.cell_id)) {
      continue;
    }

    for (let lineIndex = 0; lineIndex < cell.lines.length; lineIndex += 1) {
      const line = cell.lines[lineIndex] ?? "";
      const lineLowercase = cell.lines_lowercase[lineIndex] ?? "";
      const lineMatches = query.matcher(line, lineLowercase);

      for (const lineMatch of lineMatches) {
        matches.push({
          cell_id: cell.cell_id,
          cell_index: cell.cell_index,
          kind: cell.kind,
          line: lineIndex + 1,
          column: lineMatch.column,
          match_text: lineMatch.match_text,
          line_text: line,
          section_path: cell.section_path,
          source_fingerprint: cell.source_fingerprint,
        });

        if (matches.length >= query.max_results) {
          return { matches, truncated: true };
        }
      }
    }
  }

  return { matches, truncated: false };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
