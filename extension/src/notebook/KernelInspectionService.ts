import * as vscode from "vscode";
import { KernelInfo } from "../../../packages/protocol/src";

export class KernelInspectionService {
  public getKernelInfo(document: vscode.NotebookDocument): KernelInfo {
    const metadata = document.metadata as Record<string, unknown> | undefined;
    const kernelspec =
      (metadata?.custom as Record<string, unknown> | undefined)?.metadata as
        | Record<string, unknown>
        | undefined;
    const kernelSpecInfo = kernelspec?.kernelspec as Record<string, unknown> | undefined;
    const languageInfo = kernelspec?.language_info as Record<string, unknown> | undefined;

    return {
      kernel_label:
        typeof kernelSpecInfo?.display_name === "string" ? kernelSpecInfo.display_name : null,
      kernel_id: typeof kernelSpecInfo?.name === "string" ? kernelSpecInfo.name : null,
      language:
        typeof languageInfo?.name === "string"
          ? languageInfo.name
          : document.getCells().find((cell) => cell.kind === vscode.NotebookCellKind.Code)?.document.languageId ??
            null,
      execution_supported: document.notebookType === "jupyter-notebook",
      state: "unknown",
    };
  }
}
