import {
  ExecutionStatus,
  NotebookCellKind,
  NotebookCellPreview,
  NotebookOutlineHeading,
  OutputKind,
} from "../../../packages/protocol/src";

const MAX_PREVIEW_LENGTH = 120;

export interface PreviewSourceCell {
  cell_id: string;
  index: number;
  kind: NotebookCellKind;
  language: string | null;
  source: string;
  source_sha256: string;
  execution_status: ExecutionStatus | null;
  execution_order: number | null;
  started_at: string | null;
  ended_at: string | null;
  output_mime_types: string[];
}

export function buildNotebookCellPreviews(
  cells: readonly PreviewSourceCell[],
  outline: readonly NotebookOutlineHeading[],
): NotebookCellPreview[] {
  return cells.map((cell) => {
    const sectionPath = findSectionPath(cell.index, outline);
    const outputKinds = summarizeOutputKinds(cell.output_mime_types);

    return {
      cell_id: cell.cell_id,
      index: cell.index,
      kind: cell.kind,
      language: cell.language,
      source_preview: buildSourcePreview(cell.kind, cell.source),
      source_line_count: countSourceLines(cell.source),
      source_sha256: cell.source_sha256,
      execution_status: cell.execution_status,
      execution_order: cell.execution_order,
      started_at: cell.started_at,
      ended_at: cell.ended_at,
      has_outputs: cell.output_mime_types.length > 0,
      output_kinds: outputKinds,
      section_path: sectionPath,
    };
  });
}

export function buildSourcePreview(kind: NotebookCellKind, source: string): string {
  const firstNonEmptyLine = source
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!firstNonEmptyLine) {
    return "";
  }

  const normalized =
    kind === "markdown"
      ? firstNonEmptyLine.replace(/^#{1,6}\s+/u, "")
      : firstNonEmptyLine;

  return truncatePreview(normalized.replace(/\s+/gu, " "));
}

export function countSourceLines(source: string): number {
  if (source.length === 0) {
    return 0;
  }

  return source.split(/\r?\n/u).length;
}

export function summarizeOutputKinds(mimeTypes: readonly string[]): OutputKind[] {
  const kinds = new Set<OutputKind>();
  for (const mime of mimeTypes) {
    kinds.add(classifyOutputKind(mime));
  }

  return [...kinds];
}

function findSectionPath(cellIndex: number, outline: readonly NotebookOutlineHeading[]): string[] {
  let bestMatch: NotebookOutlineHeading | undefined;

  for (const heading of outline) {
    if (heading.cell_index <= cellIndex && cellIndex < heading.section_end_cell_index_exclusive) {
      if (!bestMatch || heading.level >= bestMatch.level) {
        bestMatch = heading;
      }
    }
  }

  return bestMatch?.path ?? [];
}

function classifyOutputKind(mime: string): OutputKind {
  if (mime.startsWith("image/")) {
    return "image";
  }

  if (mime === "text/markdown") {
    return "markdown";
  }

  if (mime === "text/html") {
    return "html";
  }

  if (mime.includes("json")) {
    return "json";
  }

  if (mime.includes("error")) {
    return "error";
  }

  if (mime.startsWith("text/")) {
    return "text";
  }

  return "unknown";
}

function truncatePreview(text: string): string {
  if (text.length <= MAX_PREVIEW_LENGTH) {
    return text;
  }

  return `${text.slice(0, MAX_PREVIEW_LENGTH - 1)}…`;
}
