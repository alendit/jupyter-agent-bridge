import { ListNotebookVariablesRequest, NotebookVariableSummary } from "@jupyter-agent-bridge/protocol/notebook";

const DEFAULT_MAX_RESULTS = 200;
const MAX_RESULTS_LIMIT = 1000;
const MAX_PREVIEW_LENGTH = 240;

type RawVariableRecord = Record<string, unknown>;

export interface NormalizedVariableSelection {
  variables: NotebookVariableSummary[];
  offset: number;
  max_results: number;
  total_available: number;
  next_offset: number | null;
  truncated: boolean;
}

export function selectNotebookVariables(
  rawVariables: unknown,
  request: ListNotebookVariablesRequest,
): NormalizedVariableSelection {
  const normalized = normalizeNotebookVariables(rawVariables);
  const filtered =
    request.query && request.query.trim().length > 0
      ? normalized.filter((variable) => matchesVariableQuery(variable, request.query as string))
      : normalized;
  const offset = clampOffset(request.offset);
  const maxResults = clampMaxResults(request.max_results);
  const nextOffset = offset + maxResults < filtered.length ? offset + maxResults : null;

  return {
    variables: filtered.slice(offset, offset + maxResults),
    offset,
    max_results: maxResults,
    total_available: filtered.length,
    next_offset: nextOffset,
    truncated: nextOffset !== null,
  };
}

export function normalizeNotebookVariables(rawVariables: unknown): NotebookVariableSummary[] {
  if (!Array.isArray(rawVariables)) {
    return [];
  }

  return rawVariables
    .map((entry) => normalizeNotebookVariable(entry))
    .filter((entry): entry is NotebookVariableSummary => entry !== null);
}

export function normalizeNotebookVariable(rawVariable: unknown): NotebookVariableSummary | null {
  if (!rawVariable || typeof rawVariable !== "object" || Array.isArray(rawVariable)) {
    return null;
  }

  const record = rawVariable as RawVariableRecord;
  const name = firstString(record.name, record.variableName, record.expression);
  if (!name) {
    return null;
  }

  return {
    name,
    type: truncatePreview(firstString(record.type, record.variableType)),
    value_preview: truncatePreview(firstString(record.value, record.valuePreview, record.preview, record.displayValue)),
    summary: truncatePreview(firstString(record.summary, record.description)),
    size: truncatePreview(firstString(record.size)),
    shape: truncatePreview(firstString(record.shape)),
    supports_data_explorer: firstBoolean(record.supportsDataExplorer, record.supports_data_explorer) ?? false,
  };
}

function matchesVariableQuery(variable: NotebookVariableSummary, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return true;
  }

  return [
    variable.name,
    variable.type,
    variable.value_preview,
    variable.summary,
    variable.size,
    variable.shape,
  ].some((value) => value?.toLowerCase().includes(needle));
}

function clampMaxResults(value: number | undefined): number {
  return Math.min(Math.max(value ?? DEFAULT_MAX_RESULTS, 1), MAX_RESULTS_LIMIT);
}

function clampOffset(value: number | undefined): number {
  return Math.max(value ?? 0, 0);
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return null;
}

function firstBoolean(...values: unknown[]): boolean | null {
  for (const value of values) {
    if (typeof value === "boolean") {
      return value;
    }
  }

  return null;
}

function truncatePreview(value: string | null): string | null {
  if (value === null || value.length <= MAX_PREVIEW_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_PREVIEW_LENGTH - 1)}…`;
}
