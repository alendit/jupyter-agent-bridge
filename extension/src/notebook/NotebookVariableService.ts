import * as vscode from "vscode";
import { ListNotebookVariablesRequest, ListNotebookVariablesResult } from "../../../packages/protocol/src";
import { fail } from "../../../packages/protocol/src";
import { NotebookRegistry } from "./NotebookRegistry";
import { selectNotebookVariables } from "./variableExplorer";

export class NotebookVariableService {
  public constructor(private readonly registry: NotebookRegistry) {}

  public async listVariables(
    document: vscode.NotebookDocument,
    request: ListNotebookVariablesRequest,
  ): Promise<ListNotebookVariablesResult> {
    let rawVariables: unknown;
    try {
      rawVariables = await vscode.commands.executeCommand("jupyter.listVariables", document.uri);
    } catch (error) {
      fail({
        code: "KernelUnavailable",
        message:
          "Failed to list notebook variables. Ensure the notebook kernel is selected, connected, and the Jupyter variable explorer is available.",
        detail: error instanceof Error ? error.message : error,
        recoverable: true,
      });
    }

    const selected = selectNotebookVariables(rawVariables, request);
    return {
      notebook_uri: document.uri.toString(),
      notebook_version: this.registry.getVersion(document.uri.toString()),
      query: request.query,
      offset: selected.offset,
      max_results: selected.max_results,
      total_available: selected.total_available,
      next_offset: selected.next_offset,
      truncated: selected.truncated,
      variables: selected.variables,
    };
  }
}
