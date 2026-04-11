import * as vscode from "vscode";
import { createHash } from "node:crypto";

export const METADATA_NAMESPACE = "jupyterAgentBridge";
export const CELL_ID_KEY = "cellId";

export function cloneMetadata(metadata: unknown): Record<string, unknown> {
  if (!metadata || typeof metadata !== "object") {
    return {};
  }

  return JSON.parse(JSON.stringify(metadata)) as Record<string, unknown>;
}

export function getStoredCellId(cell: vscode.NotebookCell): string | null {
  const metadata = cell.metadata as Record<string, unknown> | undefined;
  const namespaced = metadata?.[METADATA_NAMESPACE] as Record<string, unknown> | undefined;
  const namespacedId = namespaced?.[CELL_ID_KEY];
  if (typeof namespacedId === "string" && namespacedId.length > 0) {
    return namespacedId;
  }

  const rootId = metadata?.id;
  return typeof rootId === "string" && rootId.length > 0 ? rootId : null;
}

export function withStoredCellId(
  metadata: Record<string, unknown> | undefined,
  cellId: string,
): Record<string, unknown> {
  const nextMetadata = cloneMetadata(metadata);
  const namespaced = cloneMetadata(nextMetadata[METADATA_NAMESPACE]);
  namespaced[CELL_ID_KEY] = cellId;
  nextMetadata[METADATA_NAMESPACE] = namespaced;
  return nextMetadata;
}

export function createGeneratedCellId(): string {
  return `c_${crypto.randomUUID().replace(/-/g, "")}`;
}

export function computeSourceFingerprint(source: string): string {
  return createHash("sha256").update(source, "utf8").digest("hex").slice(0, 12);
}

export function notebookCellKindToProtocol(kind: vscode.NotebookCellKind): "markdown" | "code" {
  return kind === vscode.NotebookCellKind.Markup ? "markdown" : "code";
}

export function protocolCellKindToNotebook(kind: "markdown" | "code"): vscode.NotebookCellKind {
  return kind === "markdown" ? vscode.NotebookCellKind.Markup : vscode.NotebookCellKind.Code;
}

export function toNotebookCellData(
  cell: vscode.NotebookCell,
  overrideSource?: string,
): vscode.NotebookCellData {
  const data = new vscode.NotebookCellData(
    cell.kind,
    overrideSource ?? cell.document.getText(),
    cell.document.languageId,
  );
  data.metadata = cloneMetadata(cell.metadata);
  data.outputs = [...cell.outputs];
  return data;
}
