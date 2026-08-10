import * as vscode from "vscode";
import { HostKernelObservation, mapHostKernelStatus } from "./hostKernelState";
import { JupyterKernelApiService } from "./JupyterKernelApiService";

export class HostKernelObservationService {
  private readonly observations = new Map<string, HostKernelObservation>();

  public constructor(
    private readonly kernelApi: JupyterKernelApiService,
    private readonly log?: (message: string) => void,
  ) {}

  public peek(notebookUri: string): HostKernelObservation | undefined {
    return this.observations.get(notebookUri);
  }

  public async refresh(document: vscode.NotebookDocument): Promise<HostKernelObservation | null> {
    const notebookUri = document.uri.toString();
    try {
      const kernel = await this.kernelApi.getKernel(document.uri);
      if (!kernel) {
        this.observations.delete(notebookUri);
        this.log?.(
          `host_kernel.refresh notebook_uri=${JSON.stringify(notebookUri)} source="jupyter-api" kernel="null"`,
        );
        return null;
      }

      const observation: HostKernelObservation = {
        state: mapHostKernelStatus(kernel.status),
        last_seen_at_ms: Date.now(),
        source: "jupyter-api",
      };
      this.observations.set(notebookUri, observation);
      this.log?.(
        `host_kernel.refresh notebook_uri=${JSON.stringify(notebookUri)} source="jupyter-api" state=${observation.state} raw_status=${JSON.stringify(kernel.status ?? null)}`,
      );
      return observation;
    } catch (error) {
      this.log?.(
        `host_kernel.refresh_error notebook_uri=${JSON.stringify(notebookUri)} detail=${JSON.stringify(error instanceof Error ? error.message : String(error))}`,
      );
      return this.observations.get(notebookUri) ?? null;
    }
  }
}
