import * as vscode from "vscode";
import type { NotebookQueryApplicationService } from "./NotebookQueryApplicationService";
import { parseCellNavigationPath, toRevealCellNavigationRequest } from "./cellNavigation";

/**
 * Handles `vscode://` / `cursor://` URIs that reveal a notebook cell input or focus its output.
 * MCP resource reads still use `jupyter://cell/code` and `jupyter://cell/output`; those URIs
 * are for fetch/read. For clickable editor navigation, the frontend shell emits product-scheme
 * URLs that this handler translates into the editor-native reveal command shape.
 */
export function registerCellNavigationUriHandler(
  context: vscode.ExtensionContext,
  queryService: NotebookQueryApplicationService,
  log: (message: string) => void,
): vscode.Disposable {
  return vscode.window.registerUriHandler({
    handleUri: async (uri: vscode.Uri): Promise<void> => {
      if (uri.authority !== context.extension.id) {
        return;
      }

      const kind = parseCellNavigationPath(uri.path);
      if (!kind) {
        return;
      }

      const params = new URLSearchParams(uri.query);
      const notebookUri = params.get("notebook_uri");
      const cellId = params.get("cell_id");
      if (!notebookUri || !cellId) {
        void vscode.window.showWarningMessage(
          "Cell navigation link is missing notebook_uri or cell_id query parameters.",
        );
        return;
      }

      try {
        await queryService.revealCells(
          toRevealCellNavigationRequest({
            notebook_uri: notebookUri,
            cell_id: cellId,
            kind,
          }),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log(`cell_navigation.failed kind=${kind} notebook_uri=${notebookUri} cell_id=${cellId} ${message}`);
        void vscode.window.showErrorMessage(`Could not open notebook cell: ${message}`);
      }
    },
  });
}
