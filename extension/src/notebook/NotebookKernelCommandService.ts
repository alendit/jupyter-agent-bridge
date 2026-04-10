import * as vscode from "vscode";
import {
  KernelCommandResult,
  SelectKernelRequest,
  fail,
} from "../../../packages/protocol/src";
import { NotebookCommandAdapter } from "../commands/NotebookCommandAdapter";
import { NotebookReadService } from "./NotebookReadService";
import { NotebookRegistry } from "./NotebookRegistry";

export class NotebookKernelCommandService {
  public constructor(
    private readonly registry: NotebookRegistry,
    private readonly readService: NotebookReadService,
    private readonly commandAdapter: NotebookCommandAdapter,
  ) {}

  public async selectKernel(
    document: vscode.NotebookDocument,
    request: SelectKernelRequest,
  ): Promise<KernelCommandResult> {
    const editor = await this.commandAdapter.ensureEditor(document);

    if ((request.kernel_id && !request.extension_id) || (!request.kernel_id && request.extension_id)) {
      fail({
        code: "InvalidRequest",
        message: "select_kernel requires both kernel_id and extension_id for direct selection.",
        recoverable: true,
      });
    }

    if (request.kernel_id && request.extension_id) {
      return this.runKernelCommand(
        document,
        "KernelSelectionFailed",
        `Failed to select kernel ${request.kernel_id}.`,
        async () => {
          await vscode.commands.executeCommand("notebook.selectKernel", {
            notebookEditor: editor,
            id: request.kernel_id,
            extension: request.extension_id,
            skipIfAlreadySelected: request.skip_if_already_selected ?? true,
          });
        },
        "selected",
        false,
        `Requested kernel selection for ${request.kernel_id}.`,
      );
    }

    return this.runKernelCommand(
      document,
      "KernelSelectionFailed",
      "Failed to open the notebook kernel picker.",
      async () => {
        await vscode.commands.executeCommand("notebook.selectKernel", {
          notebookEditor: editor,
          skipIfAlreadySelected: request.skip_if_already_selected ?? false,
        });
      },
      "prompted",
      true,
      "Opened the VS Code kernel picker for this notebook.",
    );
  }

  public async selectJupyterInterpreter(document: vscode.NotebookDocument): Promise<KernelCommandResult> {
    await this.commandAdapter.ensureEditor(document);
    return this.runKernelCommand(
      document,
      "KernelSelectionFailed",
      "Failed to open the Jupyter interpreter picker.",
      async () => {
        await vscode.commands.executeCommand("jupyter.selectJupyterInterpreter");
      },
      "prompted",
      true,
      "Opened the Jupyter interpreter picker. VS Code may prompt to install ipykernel for the selected environment.",
    );
  }

  public async restartKernel(document: vscode.NotebookDocument): Promise<KernelCommandResult> {
    await this.commandAdapter.ensureEditor(document);
    return this.runKernelCommand(
      document,
      "KernelUnavailable",
      "Failed to restart the active kernel.",
      async () => {
        await vscode.commands.executeCommand("jupyter.restartkernel");
      },
      "requested",
      false,
      "Requested kernel restart.",
    );
  }

  public async interruptExecution(document: vscode.NotebookDocument): Promise<KernelCommandResult> {
    await this.commandAdapter.ensureEditor(document);
    return this.runKernelCommand(
      document,
      "KernelUnavailable",
      "Failed to interrupt the active kernel.",
      async () => {
        await vscode.commands.executeCommand("jupyter.interruptkernel");
      },
      "requested",
      false,
      "Requested kernel interrupt.",
    );
  }

  private async runKernelCommand(
    document: vscode.NotebookDocument,
    errorCode: "KernelSelectionFailed" | "KernelUnavailable",
    errorMessage: string,
    command: () => Promise<void>,
    status: KernelCommandResult["status"],
    requiresUserInteraction: boolean,
    message: string,
  ): Promise<KernelCommandResult> {
    try {
      await command();
    } catch (error) {
      fail({
        code: errorCode,
        message: errorMessage,
        detail: error instanceof Error ? error.message : error,
        recoverable: true,
      });
    }

    return {
      notebook_uri: document.uri.toString(),
      notebook_version: this.registry.getVersion(document.uri.toString()),
      kernel: this.readService.getKernelInfoValue(document),
      status,
      requires_user_interaction: requiresUserInteraction,
      message,
    };
  }
}
