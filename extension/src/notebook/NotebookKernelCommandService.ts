import * as vscode from "vscode";
import {
  KernelCommandResult,
  SelectKernelRequest,
  WaitForKernelReadyRequest,
  WaitForKernelReadyResult,
  fail,
} from "../../../packages/protocol/src";
import { NotebookCommandAdapter } from "../commands/NotebookCommandAdapter";
import { HostKernelObservationService } from "./HostKernelObservationService";
import { NotebookReadService } from "./NotebookReadService";
import { NotebookRegistry } from "./NotebookRegistry";
import { isKernelReady } from "./kernelRuntime";

export class NotebookKernelCommandService {
  public constructor(
    private readonly registry: NotebookRegistry,
    private readonly readService: NotebookReadService,
    private readonly commandAdapter: NotebookCommandAdapter,
    private readonly hostKernelObservationService: HostKernelObservationService,
    private readonly log?: (message: string) => void,
  ) {}

  public async selectKernel(
    document: vscode.NotebookDocument,
    request: SelectKernelRequest,
  ): Promise<KernelCommandResult> {
    const editor = await this.commandAdapter.ensureEditor(document);
    this.logKernelDebug("select_kernel.before", document);

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
            editor,
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
          notebookUri: document.uri,
          skipIfAlreadySelected: request.skip_if_already_selected ?? true,
        });
        this.registry.markKernelCommandRequested(document.uri.toString(), "select_kernel", {
          requires_user_interaction: true,
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
        this.registry.markKernelCommandRequested(document.uri.toString(), "select_interpreter", {
          requires_user_interaction: true,
        });
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
        this.registry.markKernelCommandRequested(document.uri.toString(), "restart", {
          bump_generation: true,
        });
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
        this.registry.markKernelCommandRequested(document.uri.toString(), "interrupt");
      },
      "requested",
      false,
      "Requested kernel interrupt.",
    );
  }

  public async waitForKernelReady(
    document: vscode.NotebookDocument,
    request: WaitForKernelReadyRequest,
  ): Promise<WaitForKernelReadyResult> {
    const notebookUri = document.uri.toString();
    const timeoutMs = request.timeout_ms ?? 30_000;
    const initialKernel = this.readService.getKernelInfoValue(document);
    const targetGeneration = request.target_generation ?? initialKernel.generation;

    const currentResult = (): WaitForKernelReadyResult => {
      const refreshedDocument = this.registry.getDocument(notebookUri) ?? document;
      const kernel = this.readService.getKernelInfoValue(refreshedDocument);
      const ready = isKernelReady(kernel, targetGeneration);
      return {
        notebook_uri: notebookUri,
        notebook_version: this.registry.getVersion(notebookUri),
        kernel,
        ready,
        timed_out: false,
        target_generation: targetGeneration,
        message: ready
          ? `Kernel is ready for notebook ${notebookUri}.`
          : this.describeKernelWaitState(kernel, targetGeneration),
      };
    };

    await this.hostKernelObservationService.refresh(document);
    const immediate = currentResult();
    this.log?.(
      `wait_for_kernel_ready immediate notebook_uri=${JSON.stringify(notebookUri)} ready=${immediate.ready} state=${immediate.kernel?.state ?? "null"} pending_action=${immediate.kernel?.pending_action ?? "null"} requires_user_interaction=${immediate.kernel?.requires_user_interaction ?? false} kernel_id=${JSON.stringify(immediate.kernel?.kernel_id ?? null)} kernel_label=${JSON.stringify(immediate.kernel?.kernel_label ?? null)}`,
    );
    if (
      immediate.ready ||
      immediate.kernel?.requires_user_interaction ||
      !immediate.kernel?.execution_supported
    ) {
      return immediate;
    }

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const refreshedDocument = this.registry.getDocument(notebookUri) ?? document;
      await this.hostKernelObservationService.refresh(refreshedDocument);
      const result = currentResult();
      if (result.ready || result.kernel?.requires_user_interaction || !result.kernel?.execution_supported) {
        return result;
      }
    }

    const timedOut = currentResult();
    timedOut.timed_out = true;
    if (!timedOut.ready) {
      timedOut.message = `Timed out waiting for kernel readiness. ${timedOut.message}`;
    }
    return timedOut;
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
      await this.hostKernelObservationService.refresh(document);
    } catch (error) {
      fail({
        code: errorCode,
        message: errorMessage,
        detail: error instanceof Error ? error.message : error,
        recoverable: true,
      });
    }

    this.logKernelDebug(`kernel_command.${status}`, document);

    return {
      notebook_uri: document.uri.toString(),
      notebook_version: this.registry.getVersion(document.uri.toString()),
      kernel: this.readService.getKernelInfoValue(document),
      status,
      requires_user_interaction: requiresUserInteraction,
      message,
    };
  }

  private logKernelDebug(prefix: string, document: vscode.NotebookDocument): void {
    const kernel = this.readService.getKernelInfoValue(document);
    const metadata = document.metadata as Record<string, unknown> | undefined;
    const customMetadata = (metadata?.custom as Record<string, unknown> | undefined)?.metadata;
    this.log?.(
      `${prefix} notebook_uri=${JSON.stringify(document.uri.toString())} kernel_id=${JSON.stringify(kernel.kernel_id)} kernel_label=${JSON.stringify(kernel.kernel_label)} state=${kernel.state} pending_action=${kernel.pending_action ?? "null"} requires_user_interaction=${kernel.requires_user_interaction} metadata_keys=${JSON.stringify(Object.keys(metadata ?? {}))} custom_metadata_keys=${JSON.stringify(customMetadata && typeof customMetadata === "object" ? Object.keys(customMetadata as Record<string, unknown>) : [])}`,
    );
  }

  private describeKernelWaitState(
    kernel: ReturnType<NotebookReadService["getKernelInfoValue"]> | null,
    targetGeneration: number,
  ): string {
    if (!kernel) {
      return "Kernel state is unavailable.";
    }

    if (!kernel.execution_supported) {
      return "Notebook execution is not supported for this notebook type.";
    }

    if (kernel.requires_user_interaction) {
      return "Kernel setup requires user interaction in VS Code.";
    }

    if (kernel.generation < targetGeneration) {
      return `Waiting for kernel generation ${targetGeneration}; current generation is ${kernel.generation}.`;
    }

    if (kernel.pending_action) {
      return `Waiting for pending kernel action ${kernel.pending_action} to finish.`;
    }

    if (kernel.state === "busy") {
      return "Kernel is currently busy.";
    }

    if (kernel.kernel_id === null && kernel.kernel_label === null) {
      return "No kernel is selected for this notebook.";
    }

    return `Kernel state is ${kernel.state}.`;
  }
}
