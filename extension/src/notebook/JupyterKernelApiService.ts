import * as vscode from "vscode";

export interface JupyterKernelOutputItem {
  mime: string;
  data: Uint8Array;
}

export interface JupyterKernelOutput {
  items: readonly JupyterKernelOutputItem[];
}

export interface JupyterKernelHandle {
  language: string;
  status?: string | null;
  executeCode(code: string, token: vscode.CancellationToken): AsyncIterable<JupyterKernelOutput>;
}

interface JupyterExtensionApi {
  kernels?: {
    getKernel?(uri: vscode.Uri): Promise<JupyterKernelHandle | undefined>;
  };
}

export class JupyterKernelApiService {
  private apiPromise: Promise<JupyterExtensionApi | null> | undefined;

  public constructor(private readonly log?: (message: string) => void) {}

  public async getKernel(uri: vscode.Uri): Promise<JupyterKernelHandle | undefined> {
    const api = await this.getApi();
    return api?.kernels?.getKernel?.(uri);
  }

  private getApi(): Promise<JupyterExtensionApi | null> {
    if (!this.apiPromise) {
      this.apiPromise = this.loadApi();
    }
    return this.apiPromise;
  }

  private async loadApi(): Promise<JupyterExtensionApi | null> {
    const extension = vscode.extensions.getExtension<JupyterExtensionApi>("ms-toolsai.jupyter");
    if (!extension) {
      this.log?.('jupyter_api.unavailable reason="extension_missing"');
      return null;
    }

    try {
      const api = extension.isActive ? extension.exports : await extension.activate();
      if (!api?.kernels?.getKernel) {
        this.log?.('jupyter_api.unavailable reason="kernels_api_missing"');
        return null;
      }
      return api;
    } catch (error) {
      this.log?.(
        `jupyter_api.activation_error detail=${JSON.stringify(error instanceof Error ? error.message : String(error))}`,
      );
      return null;
    }
  }
}
