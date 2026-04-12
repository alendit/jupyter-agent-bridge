export const EDITOR_NAVIGATION_EXTENSION_AUTHORITY = "local.jupyter-agent-bridge";

export type CellNavigationKind = "code" | "output";

export function buildCellNavigationUri(
  productUriScheme: string,
  kind: CellNavigationKind,
  notebookUri: string,
  cellId: string,
): string {
  const url = new URL(`${productUriScheme}://${EDITOR_NAVIGATION_EXTENSION_AUTHORITY}/cell/${kind}`);
  url.searchParams.set("notebook_uri", notebookUri);
  url.searchParams.set("cell_id", cellId);
  return url.toString();
}

export function buildEditorNavigationUris(notebookUri: string, cellId: string, kind: CellNavigationKind) {
  return {
    vscode: buildCellNavigationUri("vscode", kind, notebookUri, cellId),
    cursor: buildCellNavigationUri("cursor", kind, notebookUri, cellId),
  };
}
