import { NotebookCellKind, NotebookOutlineHeading } from "../../../packages/protocol/src";

export interface OutlineSourceCell {
  cell_id: string;
  index: number;
  kind: NotebookCellKind;
  source: string;
}

interface HeadingMatch {
  level: number;
  title: string;
}

export function buildNotebookOutline(cells: readonly OutlineSourceCell[]): NotebookOutlineHeading[] {
  const headings: Array<Omit<NotebookOutlineHeading, "section_end_cell_index_exclusive">> = [];
  const stack: string[] = [];

  for (const cell of cells) {
    if (cell.kind !== "markdown") {
      continue;
    }

    for (const heading of extractMarkdownHeadings(cell.source)) {
      while (stack.length >= heading.level) {
        stack.pop();
      }

      stack.push(heading.title);
      headings.push({
        cell_id: cell.cell_id,
        cell_index: cell.index,
        level: heading.level,
        title: heading.title,
        path: [...stack],
      });
    }
  }

  return headings.map((heading, index) => ({
    ...heading,
    section_end_cell_index_exclusive: findSectionEnd(headings, cells.length, index),
  }));
}

export function extractMarkdownHeadings(source: string): HeadingMatch[] {
  const matches: HeadingMatch[] = [];
  let fencedBlockMarker: string | null = null;

  for (const rawLine of source.split(/\r?\n/u)) {
    const fenceMatch = rawLine.match(/^\s{0,3}(```+|~~~+)/u);
    if (fenceMatch) {
      const marker = fenceMatch[1]?.startsWith("`") ? "`" : "~";
      if (!fencedBlockMarker) {
        fencedBlockMarker = marker ?? null;
      } else if (fencedBlockMarker === marker) {
        fencedBlockMarker = null;
      }
      continue;
    }

    if (fencedBlockMarker) {
      continue;
    }

    const headingMatch = rawLine.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/u);
    if (!headingMatch) {
      continue;
    }

    const marker = headingMatch[1];
    const rawTitle = headingMatch[2]?.trim();
    if (!marker || !rawTitle) {
      continue;
    }

    matches.push({
      level: marker.length,
      title: rawTitle,
    });
  }

  return matches;
}

function findSectionEnd(
  headings: ReadonlyArray<Omit<NotebookOutlineHeading, "section_end_cell_index_exclusive">>,
  cellCount: number,
  startIndex: number,
): number {
  const current = headings[startIndex];
  if (!current) {
    return cellCount;
  }

  for (let index = startIndex + 1; index < headings.length; index += 1) {
    const next = headings[index];
    if (next && next.level <= current.level) {
      return next.cell_index;
    }
  }

  return cellCount;
}
