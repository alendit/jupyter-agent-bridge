import type { RevealNotebookCellsRequest } from "@jupyter-agent-bridge/protocol";

export const OPEN_CELL_NAVIGATION_COMMAND = "jupyterAgentBridge.openCellNavigation";

export type CellNavigationKind = "code" | "output";

export interface CellNavigationRequest {
  notebook_uri: string;
  cell_id: string;
  kind: CellNavigationKind;
}

export function normalizeCellNavigationRequest(value: unknown): CellNavigationRequest | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const notebookUri = candidate.notebook_uri;
  const cellId = candidate.cell_id;
  const kind = candidate.kind;

  if (typeof notebookUri !== "string" || notebookUri.length === 0) {
    return null;
  }
  if (typeof cellId !== "string" || cellId.length === 0) {
    return null;
  }
  if (kind !== "code" && kind !== "output") {
    return null;
  }

  return {
    notebook_uri: notebookUri,
    cell_id: cellId,
    kind,
  };
}

export function parseCellNavigationPath(path: string): CellNavigationKind | null {
  const normalized = path.startsWith("/") ? path.slice(1) : path;
  if (normalized === "cell/code") {
    return "code";
  }
  if (normalized === "cell/output") {
    return "output";
  }
  return null;
}

export function toRevealCellNavigationRequest(request: CellNavigationRequest): RevealNotebookCellsRequest {
  return {
    notebook_uri: request.notebook_uri,
    cell_ids: [request.cell_id],
    select: true,
    focus_target: request.kind === "output" ? "output" : "cell",
  };
}
