import * as vscode from "vscode";
import { ExecuteCellResult, ExecuteCellsRequest, ExecuteCellsResult } from "../../../packages/protocol/src";
import { fail } from "../../../packages/protocol/src";
import { getStoredCellId } from "./cells";
import { NotebookRegistry } from "./NotebookRegistry";
import { NotebookReadService } from "./NotebookReadService";
import { NotebookCommandAdapter } from "../commands/NotebookCommandAdapter";

export class NotebookExecutionService {
  public constructor(
    private readonly registry: NotebookRegistry,
    private readonly readService: NotebookReadService,
    private readonly commandAdapter: NotebookCommandAdapter,
  ) {}

  public async executeCells(
    document: vscode.NotebookDocument,
    request: ExecuteCellsRequest,
  ): Promise<ExecuteCellsResult> {
    const cells = request.cell_ids.map((cellId) => this.readService.requireCell(document, cellId));

    for (const cell of cells) {
      if (cell.kind !== vscode.NotebookCellKind.Code) {
        fail({
          code: "InvalidRequest",
          message: `Only code cells can be executed. Cell ${getStoredCellId(cell) ?? cell.index} is not code.`,
          recoverable: true,
        });
      }
    }

    const baselineSignatures = new Map<string, string>();
    for (const cell of cells) {
      const cellId = getStoredCellId(cell);
      if (cellId) {
        baselineSignatures.set(cellId, this.executionSignature(cell));
      }
    }

    const notebookUri = document.uri.toString();
    const timeoutMs = request.timeout_ms ?? 60_000;
    const completion = this.waitForExecutionCompletion(notebookUri, request.cell_ids, baselineSignatures, timeoutMs);

    await this.commandAdapter.executeCells(
      document,
      cells.map((cell) => new vscode.NotebookRange(cell.index, cell.index + 1)),
    );

    const timedOut = !(await completion);
    const refreshedDocument = this.registry.getDocument(notebookUri) ?? document;
    this.registry.setLastExecuted(notebookUri, request.cell_ids);

    const results: ExecuteCellResult[] = request.cell_ids.map((cellId) => {
      const cell = this.readService.requireCell(refreshedDocument, cellId);
      const execution = this.readService.toExecutionSummary(cell);
      const outputs = this.readService.normalizeCellOutputs(cell);

      return {
        cell_id: cellId,
        execution:
          timedOut && execution === null
            ? {
                status: "timed_out",
                execution_order: null,
                started_at: null,
                ended_at: null,
              }
            : execution,
        outputs,
      };
    });

    if (timedOut) {
      const allCompleted = results.every((result) => result.execution?.status && result.execution.status !== "timed_out");
      if (!allCompleted) {
        fail({
          code: "ExecutionTimedOut",
          message: `Execution did not complete within ${timeoutMs}ms.`,
          detail: results,
          recoverable: true,
        });
      }
    }

    return {
      notebook_uri: notebookUri,
      notebook_version: this.registry.getVersion(notebookUri),
      kernel: this.readService.getKernelInfoValue(refreshedDocument),
      results,
    };
  }

  private async waitForExecutionCompletion(
    notebookUri: string,
    cellIds: readonly string[],
    baselineSignatures: Map<string, string>,
    timeoutMs: number,
  ): Promise<boolean> {
    const pending = new Set(cellIds);

    const check = (): boolean => {
      const document = this.registry.getDocument(notebookUri);
      if (!document) {
        return false;
      }

      for (const cellId of [...pending]) {
        const cell = document.getCells().find((candidate) => getStoredCellId(candidate) === cellId);
        if (!cell) {
          continue;
        }

        const baseline = baselineSignatures.get(cellId);
        if (baseline !== undefined && this.executionSignature(cell) !== baseline) {
          pending.delete(cellId);
        }
      }

      return pending.size === 0;
    };

    if (check()) {
      return true;
    }

    return new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        subscription.dispose();
        resolve(false);
      }, timeoutMs);

      const subscription = this.registry.onDidChangeNotebook((event) => {
        if (event.notebook_uri !== notebookUri) {
          return;
        }

        if (!check()) {
          return;
        }

        clearTimeout(timeout);
        subscription.dispose();
        resolve(true);
      });
    });
  }

  private executionSignature(cell: vscode.NotebookCell): string {
    const summary = cell.executionSummary;
    return JSON.stringify({
      executionOrder: summary?.executionOrder ?? null,
      success: (summary as { success?: boolean } | undefined)?.success ?? null,
      outputs: cell.outputs.map((output) => ({
        items: output.items.map((item) => ({
          mime: item.mime,
          size: item.data.byteLength,
        })),
      })),
    });
  }
}
