import * as vscode from "vscode";
import { KernelInfo } from "../../../packages/protocol/src";
import { HostKernelObservationService } from "./HostKernelObservationService";
import { parseNotebookKernelMetadata } from "./kernelMetadata";
import { NotebookRegistry } from "./NotebookRegistry";

export class KernelInspectionService {
  public constructor(
    private readonly registry: NotebookRegistry,
    private readonly hostKernelObservationService: HostKernelObservationService,
  ) {}

  public getKernelInfo(document: vscode.NotebookDocument): KernelInfo {
    const metadata = parseNotebookKernelMetadata(document);
    const runtime = this.registry.getKernelRuntimeState(document.uri.toString());
    const hostObservation = this.hostKernelObservationService.peek(document.uri.toString());

    if (hostObservation) {
      return {
        kernel_label: metadata.kernel_label,
        kernel_id: metadata.kernel_id,
        language: metadata.language,
        execution_supported: metadata.execution_supported,
        state: hostObservation.state,
        generation: runtime?.generation ?? 1,
        last_seen_at: new Date(hostObservation.last_seen_at_ms).toISOString(),
        pending_action: null,
        requires_user_interaction: false,
      };
    }

    return {
      kernel_label: metadata.kernel_label,
      kernel_id: metadata.kernel_id,
      language: metadata.language,
      execution_supported: metadata.execution_supported,
      state:
        runtime?.state ??
        (metadata.execution_supported && metadata.has_kernel ? "idle" : "unknown"),
      generation: runtime?.generation ?? 1,
      last_seen_at: runtime?.last_seen_at_ms ? new Date(runtime.last_seen_at_ms).toISOString() : null,
      pending_action: runtime?.pending_action ?? null,
      requires_user_interaction: runtime?.requires_user_interaction ?? false,
    };
  }
}
