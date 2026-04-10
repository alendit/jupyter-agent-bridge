import * as vscode from "vscode";

export interface ParsedNotebookKernelMetadata {
  kernel_label: string | null;
  kernel_id: string | null;
  language: string | null;
  execution_supported: boolean;
  has_kernel: boolean;
  signature: string | null;
}

export function parseNotebookKernelMetadata(
  document: Pick<vscode.NotebookDocument, "metadata" | "notebookType" | "getCells">,
): ParsedNotebookKernelMetadata {
  const metadata = document.metadata as Record<string, unknown> | undefined;
  const kernelspecRoot =
    (metadata?.custom as Record<string, unknown> | undefined)?.metadata as
      | Record<string, unknown>
      | undefined;
  const kernelSpecInfo = kernelspecRoot?.kernelspec as Record<string, unknown> | undefined;
  const languageInfo = kernelspecRoot?.language_info as Record<string, unknown> | undefined;
  const kernelLabel =
    typeof kernelSpecInfo?.display_name === "string" ? kernelSpecInfo.display_name : null;
  const kernelId = typeof kernelSpecInfo?.name === "string" ? kernelSpecInfo.name : null;
  const language =
    typeof languageInfo?.name === "string"
      ? languageInfo.name
      : document.getCells().find((cell) => cell.kind === vscode.NotebookCellKind.Code)?.document
            .languageId ?? null;
  const executionSupported = document.notebookType === "jupyter-notebook";
  const hasKernel = kernelLabel !== null || kernelId !== null;

  return {
    kernel_label: kernelLabel,
    kernel_id: kernelId,
    language,
    execution_supported: executionSupported,
    has_kernel: hasKernel,
    signature: hasKernel ? `${kernelId ?? ""}::${kernelLabel ?? ""}` : null,
  };
}
