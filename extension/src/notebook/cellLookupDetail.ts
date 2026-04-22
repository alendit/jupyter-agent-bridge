export interface CellLookupDetail {
  notebook_uri: string;
  notebook_version: number;
  requested_cell_id: string;
  cell_count: number;
  known_cell_ids_sample: string[];
  closest_matches?: string[];
}

export function buildCellLookupDetail(
  notebookUri: string,
  notebookVersion: number,
  knownCellIds: readonly string[],
  requestedCellId: string,
): CellLookupDetail {
  const closestMatches = knownCellIds.filter((cellId) => shareToken(cellId, requestedCellId)).slice(0, 3);
  return {
    notebook_uri: notebookUri,
    notebook_version: notebookVersion,
    requested_cell_id: requestedCellId,
    cell_count: knownCellIds.length,
    known_cell_ids_sample: knownCellIds.slice(0, 5),
    ...(closestMatches.length > 0 ? { closest_matches: closestMatches } : {}),
  };
}

function shareToken(left: string, right: string): boolean {
  const leftTokens = tokenize(left);
  const rightTokens = new Set(tokenize(right));
  return leftTokens.some((token) => rightTokens.has(token));
}

function tokenize(value: string): string[] {
  return value
    .split(/[^a-zA-Z0-9]+/u)
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0 && part !== "cell");
}
