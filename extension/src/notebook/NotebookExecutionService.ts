import * as vscode from "vscode";
import { ExecuteCellResult, ExecuteCellsRequest, ExecuteCellsResult } from "../../../packages/protocol/src";
import { fail } from "../../../packages/protocol/src";
import { getStoredCellId } from "./cells";
import { deriveExecutionProgressState } from "./executionCompletionPolicy";
import { executionSummarySignature } from "./executionSummary";
import { NotebookRegistry } from "./NotebookRegistry";
import { NotebookReadService } from "./NotebookReadService";
import { NotebookCommandAdapter } from "../commands/NotebookCommandAdapter";

interface ExecutionWaitState {
  completed: boolean;
  pendingCellIds: Set<string>;
  skippedCellIds: Set<string>;
  anyObservedChange: boolean;
}

export class NotebookExecutionService {
  public constructor(
    private readonly registry: NotebookRegistry,
    private readonly readService: NotebookReadService,
    private readonly commandAdapter: NotebookCommandAdapter,
    private readonly log?: (message: string) => void,
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
    const stopOnError = request.stop_on_error ?? true;
    this.log?.(
      `execute_cells.start notebook_uri=${JSON.stringify(notebookUri)} cell_ids=${JSON.stringify(request.cell_ids)} timeout_ms=${timeoutMs} stop_on_error=${stopOnError} kernel=${JSON.stringify(this.readService.getKernelInfoValue(document))}`,
    );
    this.logExecutionBaselines(document, request.cell_ids, baselineSignatures);
    const completion = this.waitForExecutionCompletion(
      notebookUri,
      request.cell_ids,
      baselineSignatures,
      timeoutMs,
      stopOnError,
    );

    this.registry.markKernelExecutionStarted(notebookUri);
    await this.commandAdapter.executeCells(
      document,
      cells.map((cell) => new vscode.NotebookRange(cell.index, cell.index + 1)),
    );

    const completionState = await completion;
    const timedOut = !completionState.completed;
    const refreshedDocument = this.registry.getDocument(notebookUri) ?? document;
    this.log?.(
      `execute_cells.complete notebook_uri=${JSON.stringify(notebookUri)} timed_out=${timedOut} pending_cell_ids=${JSON.stringify([...completionState.pendingCellIds])} skipped_cell_ids=${JSON.stringify([...completionState.skippedCellIds])} any_observed_change=${completionState.anyObservedChange} kernel=${JSON.stringify(this.readService.getKernelInfoValue(refreshedDocument))}`,
    );

    const results: ExecuteCellResult[] = request.cell_ids.map((cellId) => {
      const cell = this.readService.requireCell(refreshedDocument, cellId);
      const execution = this.readService.toExecutionSummary(cell);
      const skipped = completionState.skippedCellIds.has(cellId);
      const pendingWithoutChange = completionState.pendingCellIds.has(cellId);

      return {
        cell_id: cellId,
        execution: skipped
          ? {
              status: "cancelled",
              execution_order: null,
              started_at: null,
              ended_at: null,
            }
          : timedOut && execution === null
            ? {
                status: "timed_out",
                execution_order: null,
                started_at: null,
                ended_at: null,
              }
            : execution,
        outputs: skipped || pendingWithoutChange ? [] : this.readService.normalizeCellOutputs(cell),
      };
    });

    if (timedOut) {
      const allCompleted = results.every((result) => result.execution?.status && result.execution.status !== "timed_out");
      if (!allCompleted) {
        if (!completionState.anyObservedChange) {
          this.registry.markKernelExecutionCompleted(notebookUri);
        }
        fail({
          code: "ExecutionTimedOut",
          message: `Execution did not complete within ${timeoutMs}ms.`,
          detail: results,
          recoverable: true,
        });
      }
    }

    if (completionState.pendingCellIds.size === 0) {
      this.registry.markKernelExecutionCompleted(notebookUri);
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
    stopOnError: boolean,
  ): Promise<ExecutionWaitState> {
    const emptyState = (): ExecutionWaitState => ({
      completed: false,
      pendingCellIds: new Set(cellIds),
      skippedCellIds: new Set<string>(),
      anyObservedChange: false,
    });

    const check = (): ExecutionWaitState => {
      const document = this.registry.getDocument(notebookUri);
      if (!document) {
        return emptyState();
      }

      const observations = cellIds.map((cellId) => {
        const cell = document.getCells().find((candidate) => getStoredCellId(candidate) === cellId);
        if (!cell) {
          return {
            cell_id: cellId,
            changed_from_baseline: false,
            failed: false,
          };
        }

        const baseline = baselineSignatures.get(cellId);
        return {
          cell_id: cellId,
          changed_from_baseline: baseline !== undefined && this.executionSignature(cell) !== baseline,
          failed: this.readService.toExecutionSummary(cell)?.status === "failed",
        };
      });

      const progress = deriveExecutionProgressState(observations, stopOnError);
      return {
        completed: progress.pending_cell_ids.length === 0,
        pendingCellIds: new Set(progress.pending_cell_ids),
        skippedCellIds: new Set(progress.skipped_cell_ids),
        anyObservedChange: observations.some((observation) => observation.changed_from_baseline),
      };
    };

    const initialState = check();
    this.logWaitState("initial", notebookUri, cellIds, baselineSignatures, initialState);
    if (initialState.completed) {
      return initialState;
    }

    return new Promise<ExecutionWaitState>((resolve) => {
      const timeout = setTimeout(() => {
        subscription.dispose();
        const finalState = check();
        this.logWaitState("timeout", notebookUri, cellIds, baselineSignatures, finalState);
        resolve(finalState);
      }, timeoutMs);

      const subscription = this.registry.onDidChangeNotebook((event) => {
        if (event.notebook_uri !== notebookUri) {
          return;
        }

        const currentState = check();
        this.logWaitState("poll", notebookUri, cellIds, baselineSignatures, currentState);
        if (!currentState.completed) {
          return;
        }

        clearTimeout(timeout);
        subscription.dispose();
        resolve(currentState);
      });
    });
  }

  private logExecutionBaselines(
    document: vscode.NotebookDocument,
    cellIds: readonly string[],
    baselineSignatures: Map<string, string>,
  ): void {
    const entries = cellIds.map((cellId) => {
      const cell = document.getCells().find((candidate) => getStoredCellId(candidate) === cellId);
      return {
        cell_id: cellId,
        baseline_signature: baselineSignatures.get(cellId) ?? null,
        execution: cell ? this.readService.toExecutionSummary(cell) : null,
        output_count: cell?.outputs.length ?? 0,
      };
    });
    this.log?.(`execute_cells.baseline notebook_uri=${JSON.stringify(document.uri.toString())} cells=${JSON.stringify(entries)}`);
  }

  private logWaitState(
    phase: "initial" | "poll" | "timeout",
    notebookUri: string,
    cellIds: readonly string[],
    baselineSignatures: Map<string, string>,
    state: ExecutionWaitState,
  ): void {
    const document = this.registry.getDocument(notebookUri);
    const cells = cellIds.map((cellId) => {
      const cell = document?.getCells().find((candidate) => getStoredCellId(candidate) === cellId);
      const signature = cell ? this.executionSignature(cell) : null;
      return {
        cell_id: cellId,
        changed_from_baseline:
          signature !== null && baselineSignatures.get(cellId) !== undefined
            ? signature !== baselineSignatures.get(cellId)
            : false,
        execution: cell ? this.readService.toExecutionSummary(cell) : null,
        output_count: cell?.outputs.length ?? 0,
      };
    });
    this.log?.(
      `execute_cells.${phase} notebook_uri=${JSON.stringify(notebookUri)} completed=${state.completed} pending_cell_ids=${JSON.stringify([...state.pendingCellIds])} skipped_cell_ids=${JSON.stringify([...state.skippedCellIds])} any_observed_change=${state.anyObservedChange} kernel=${JSON.stringify(document ? this.readService.getKernelInfoValue(document) : null)} cells=${JSON.stringify(cells)}`,
    );
  }

  private executionSignature(cell: vscode.NotebookCell): string {
    return JSON.stringify({
      execution: executionSummarySignature(cell.executionSummary),
      outputs: cell.outputs.map((output) => ({
        items: output.items.map((item) => ({
          mime: item.mime,
          size: item.data.byteLength,
        })),
      })),
    });
  }
}
