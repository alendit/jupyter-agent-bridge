import * as vscode from "vscode";
import { normalizeNotebookVariables, normalizeVariablePageRequest } from "../../../packages/notebook-domain/src";
import { ListNotebookVariablesRequest, ListNotebookVariablesResult } from "../../../packages/protocol/src";
import { fail } from "../../../packages/protocol/src";
import { JupyterKernelApiService } from "./JupyterKernelApiService";
import { NotebookRegistry } from "./NotebookRegistry";
import { KernelVariableOutputDecoder, boundVariableResult, createKernelVariableRequest } from "./kernelVariables";

const VARIABLE_EXECUTION_TIMEOUT_MS = 30_000;
const ERROR_DETAIL_LIMIT = 4096;

export class NotebookVariableService {
  public constructor(
    private readonly registry: NotebookRegistry,
    private readonly kernelApi: JupyterKernelApiService,
  ) {}

  public async listVariables(
    document: vscode.NotebookDocument,
    request: ListNotebookVariablesRequest,
  ): Promise<ListNotebookVariablesResult> {
    const kernel = await this.kernelApi.getKernel(document.uri);
    if (!kernel) {
      fail({
        code: "KernelUnavailable",
        message: "The Jupyter extension did not expose a started kernel for this notebook.",
        recoverable: true,
      });
    }
    if (kernel.language.toLowerCase() !== "python") {
      fail({
        code: "UnsupportedEnvironment",
        message: `Runtime variable inspection currently supports Python kernels, not ${kernel.language}.`,
        recoverable: true,
      });
    }

    const pageRequest = normalizeVariablePageRequest(request);
    const execution = createKernelVariableRequest({
      query: request.query,
      offset: pageRequest.offset,
      maxResults: pageRequest.max_results,
    });
    const decoder = new KernelVariableOutputDecoder(execution.marker);
    const cancellation = new vscode.CancellationTokenSource();
    let timer: NodeJS.Timeout | undefined;
    const consumeOutputs = (async (): Promise<void> => {
      for await (const output of kernel.executeCode(execution.code, cancellation.token)) {
        decoder.accept(output);
      }
    })();
    try {
      await Promise.race([
        consumeOutputs,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            cancellation.cancel();
            reject(new Error(`Kernel variable query timed out after ${VARIABLE_EXECUTION_TIMEOUT_MS} ms.`));
          }, VARIABLE_EXECUTION_TIMEOUT_MS);
        }),
      ]);
    } catch (error) {
      if (error instanceof Error && error.name === "vscode.jupyter.apiAccessRevoked") {
        fail({
          code: "PermissionDenied",
          message: "Jupyter kernel access was denied for Jupyter Agentic Bridge.",
          recoverable: true,
        });
      }
      fail({
        code: "KernelUnavailable",
        message: "The Python kernel could not complete the bounded variable listing.",
        detail: boundedErrorDetail(error),
        recoverable: true,
      });
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
      cancellation.dispose();
      void consumeOutputs.catch(() => undefined);
    }

    let page;
    try {
      page = decoder.finish();
    } catch (error) {
      fail({
        code: "KernelUnavailable",
        message: "The Python kernel did not return a valid bounded variable listing.",
        detail: error instanceof Error ? error.message : error,
        recoverable: true,
      });
    }

    return boundVariableResult({
      notebook_uri: document.uri.toString(),
      notebook_version: this.registry.getVersion(document.uri.toString()),
      query: request.query,
      offset: pageRequest.offset,
      max_results: pageRequest.max_results,
      total_available: page.total_available,
      next_offset: page.next_offset,
      truncated: page.truncated,
      variables: normalizeNotebookVariables(page.variables),
    }, pageRequest.offset);
  }
}

function boundedErrorDetail(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, ERROR_DETAIL_LIMIT);
}
