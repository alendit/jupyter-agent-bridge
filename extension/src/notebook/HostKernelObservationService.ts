import * as vscode from "vscode";
import { HostKernelObservation, mapHostKernelStatus } from "./hostKernelState";

interface JupyterKernelHandle {
  status?: string | null;
}

interface JupyterExtensionApi {
  kernels?: {
    getKernel?(uri: vscode.Uri): Promise<JupyterKernelHandle | undefined>;
  };
}

export class HostKernelObservationService {
  private readonly observations = new Map<string, HostKernelObservation>();
  private apiPromise: Promise<JupyterExtensionApi | null> | undefined;

  public constructor(private readonly log?: (message: string) => void) {}

  public peek(notebookUri: string): HostKernelObservation | undefined {
    return this.observations.get(notebookUri);
  }

  public async refresh(document: vscode.NotebookDocument): Promise<HostKernelObservation | null> {
    const notebookUri = document.uri.toString();
    const api = await this.getJupyterApi();
    if (!api?.kernels?.getKernel) {
      this.observations.delete(notebookUri);
      return null;
    }

    try {
      const kernel = await api.kernels.getKernel(document.uri);
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

  private getJupyterApi(): Promise<JupyterExtensionApi | null> {
    if (!this.apiPromise) {
      this.apiPromise = this.loadJupyterApi();
    }
    return this.apiPromise;
  }

  private async loadJupyterApi(): Promise<JupyterExtensionApi | null> {
    const extension = vscode.extensions.getExtension<JupyterExtensionApi>("ms-toolsai.jupyter");
    if (!extension) {
      this.log?.('host_kernel.api_unavailable source="jupyter-api" reason="extension_missing"');
      return null;
    }

    try {
      const api = extension.isActive ? extension.exports : await extension.activate();
      if (!api?.kernels?.getKernel) {
        this.log?.('host_kernel.api_unavailable source="jupyter-api" reason="kernels_api_missing"');
        return null;
      }
      return api;
    } catch (error) {
      this.log?.(
        `host_kernel.api_error source="jupyter-api" detail=${JSON.stringify(error instanceof Error ? error.message : String(error))}`,
      );
      return null;
    }
  }
}
