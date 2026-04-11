import { randomUUID } from "node:crypto";
import * as vscode from "vscode";
import {
  ExecuteCellsAsyncRequest,
  ExecuteCellsAsyncResult,
  ExecuteCellsResult,
  ExecutionStatusResult,
  GetExecutionStatusRequest,
  WaitForExecutionRequest,
  WaitForExecutionResult,
  asBridgeError,
  fail,
} from "../../../packages/protocol/src";
import { NotebookDocumentService } from "./NotebookDocumentService";
import { NotebookExecutionService } from "./NotebookExecutionService";
import { NotebookMutationService } from "./NotebookMutationService";
import { NotebookReadService } from "./NotebookReadService";
import { NotebookRegistry } from "./NotebookRegistry";

const TERMINAL_RETENTION_MS = 15 * 60_000;
const DEFAULT_WAIT_TIMEOUT_MS = 30_000;

interface TrackedExecution {
  snapshot: ExecutionStatusResult;
  waiters: Set<ExecutionWaiter>;
  expires_at_ms?: number;
}

interface ExecutionWaiter {
  resolve: (result: WaitForExecutionResult) => void;
  timeout: NodeJS.Timeout;
}

type RegistryLike = Pick<NotebookRegistry, "enqueueExclusive" | "getDocument" | "getVersion">;
type DocumentServiceLike = Pick<NotebookDocumentService, "requireReadyDocument">;
type MutationServiceLike = Pick<NotebookMutationService, "assertExpectedVersion">;
type ExecutionServiceLike = Pick<NotebookExecutionService, "executeCells">;
type ReadServiceLike = Pick<NotebookReadService, "assertExpectedCellSources" | "getKernelInfoValue">;

export class NotebookAsyncExecutionService {
  private readonly executions = new Map<string, TrackedExecution>();

  public constructor(
    private readonly registry: RegistryLike,
    private readonly documentService: DocumentServiceLike,
    private readonly mutationService: MutationServiceLike,
    private readonly executionService: ExecutionServiceLike,
    private readonly readService: ReadServiceLike,
    private readonly log?: (message: string) => void,
    private readonly now = () => Date.now(),
    private readonly createExecutionId = () => randomUUID(),
  ) {}

  public async executeCellsAsync(request: ExecuteCellsAsyncRequest): Promise<ExecuteCellsAsyncResult> {
    this.evictExpiredExecutions();

    const document = await this.documentService.requireReadyDocument(request.notebook_uri);
    this.mutationService.assertExpectedVersion(
      this.registry.getVersion(request.notebook_uri),
      request.expected_notebook_version,
    );
    this.readService.assertExpectedCellSources(document, request.expected_cell_source_fingerprint_by_id, request.cell_ids);

    const execution_id = this.createExecutionId();
    const snapshot: ExecutionStatusResult = {
      execution_id,
      notebook_uri: request.notebook_uri,
      cell_ids: [...request.cell_ids],
      status: "queued",
      submitted_at: this.timestamp(),
      message: this.describeQueuedMessage(request.cell_ids),
    };
    this.executions.set(execution_id, {
      snapshot,
      waiters: new Set<ExecutionWaiter>(),
    });

    this.log?.(
      `execute_cells_async.accept execution_id=${JSON.stringify(execution_id)} notebook_uri=${JSON.stringify(request.notebook_uri)} cell_ids=${JSON.stringify(request.cell_ids)}`,
    );

    void this.registry
      .enqueueExclusive(request.notebook_uri, async () => {
        this.updateExecution(execution_id, {
          status: "running",
          started_at: this.timestamp(),
          message: this.describeRunningMessage(request.cell_ids),
        });

        const activeDocument = this.registry.getDocument(request.notebook_uri) ?? document;
        try {
          const result = await this.executionService.executeCells(activeDocument, request);
          this.completeExecution(execution_id, {
            status: "completed",
            completed_at: this.timestamp(),
            message: "Execution completed.",
            result,
          });
        } catch (error) {
          const bridgeError = asBridgeError(error);
          const completedAt = this.timestamp();
          this.completeExecution(execution_id, {
            status: bridgeError.code === "ExecutionTimedOut" ? "timed_out" : "failed",
            completed_at: completedAt,
            message: bridgeError.message,
            error: bridgeError,
            result:
              bridgeError.code === "ExecutionTimedOut"
                ? this.buildTimedOutResult(request.notebook_uri, activeDocument, bridgeError.detail)
                : undefined,
          });
        }
      })
      .catch((error) => {
        const bridgeError = asBridgeError(error);
        this.completeExecution(execution_id, {
          status: bridgeError.code === "ExecutionTimedOut" ? "timed_out" : "failed",
          completed_at: this.timestamp(),
          message: bridgeError.message,
          error: bridgeError,
        });
      });

    return this.cloneSnapshot(snapshot);
  }

  public getExecutionStatus(request: GetExecutionStatusRequest): ExecutionStatusResult {
    this.evictExpiredExecutions();
    return this.cloneSnapshot(this.requireExecution(request.execution_id).snapshot);
  }

  public async waitForExecution(request: WaitForExecutionRequest): Promise<WaitForExecutionResult> {
    this.evictExpiredExecutions();
    const tracked = this.requireExecution(request.execution_id);
    if (this.isTerminal(tracked.snapshot.status)) {
      return this.toWaitResult(tracked.snapshot, false);
    }

    const timeoutMs = request.timeout_ms ?? DEFAULT_WAIT_TIMEOUT_MS;
    return new Promise<WaitForExecutionResult>((resolve) => {
      const waiter: ExecutionWaiter = {
        resolve: (result) => {
          clearTimeout(waiter.timeout);
          resolve(result);
        },
        timeout: setTimeout(() => {
          tracked.waiters.delete(waiter);
          resolve(this.toWaitResult(tracked.snapshot, true));
        }, timeoutMs),
      };
      tracked.waiters.add(waiter);
    });
  }

  private requireExecution(executionId: string): TrackedExecution {
    const execution = this.executions.get(executionId);
    if (!execution) {
      fail({
        code: "ExecutionNotFound",
        message: `Execution not found: ${executionId}`,
        recoverable: true,
      });
    }

    return execution as TrackedExecution;
  }

  private completeExecution(
    executionId: string,
    updates: Partial<ExecutionStatusResult> & Pick<ExecutionStatusResult, "status" | "message">,
  ): void {
    const tracked = this.executions.get(executionId);
    if (!tracked) {
      return;
    }

    tracked.snapshot = {
      ...tracked.snapshot,
      ...updates,
    };
    tracked.expires_at_ms = this.now() + TERMINAL_RETENTION_MS;
    this.log?.(
      `execute_cells_async.complete execution_id=${JSON.stringify(executionId)} status=${tracked.snapshot.status} message=${JSON.stringify(tracked.snapshot.message)}`,
    );
    const waitResult = this.toWaitResult(tracked.snapshot, false);
    for (const waiter of tracked.waiters) {
      waiter.resolve(waitResult);
    }
    tracked.waiters.clear();
  }

  private updateExecution(
    executionId: string,
    updates: Partial<ExecutionStatusResult> & Pick<ExecutionStatusResult, "status" | "message">,
  ): void {
    const tracked = this.executions.get(executionId);
    if (!tracked) {
      return;
    }

    tracked.snapshot = {
      ...tracked.snapshot,
      ...updates,
    };
    this.log?.(
      `execute_cells_async.update execution_id=${JSON.stringify(executionId)} status=${tracked.snapshot.status} message=${JSON.stringify(tracked.snapshot.message)}`,
    );
  }

  private buildTimedOutResult(
    notebookUri: string,
    document: vscode.NotebookDocument,
    detail: unknown,
  ): ExecuteCellsResult | undefined {
    if (this.isExecuteCellsResult(detail)) {
      return detail;
    }

    if (!Array.isArray(detail)) {
      return undefined;
    }

    const activeDocument = this.registry.getDocument(notebookUri) ?? document;
    return {
      notebook_uri: notebookUri,
      notebook_version: this.registry.getVersion(notebookUri),
      kernel: this.readService.getKernelInfoValue(activeDocument),
      results: detail,
    };
  }

  private isExecuteCellsResult(value: unknown): value is ExecuteCellsResult {
    if (!value || typeof value !== "object") {
      return false;
    }

    const candidate = value as Partial<ExecuteCellsResult>;
    return (
      typeof candidate.notebook_uri === "string" &&
      typeof candidate.notebook_version === "number" &&
      Array.isArray(candidate.results)
    );
  }

  private toWaitResult(snapshot: ExecutionStatusResult, waitTimedOut: boolean): WaitForExecutionResult {
    return {
      ...this.cloneSnapshot(snapshot),
      wait_timed_out: waitTimedOut,
    };
  }

  private cloneSnapshot(snapshot: ExecutionStatusResult): ExecutionStatusResult {
    return {
      ...snapshot,
      cell_ids: [...snapshot.cell_ids],
      result: snapshot.result
        ? {
            ...snapshot.result,
            results: snapshot.result.results.map((result) => ({
              ...result,
              execution: result.execution ? { ...result.execution } : null,
              outputs: [...result.outputs],
            })),
          }
        : undefined,
      error: snapshot.error ? { ...snapshot.error } : undefined,
    };
  }

  private evictExpiredExecutions(): void {
    const now = this.now();
    for (const [executionId, tracked] of this.executions.entries()) {
      if (tracked.expires_at_ms !== undefined && tracked.expires_at_ms <= now) {
        this.executions.delete(executionId);
      }
    }
  }

  private timestamp(): string {
    return new Date(this.now()).toISOString();
  }

  private isTerminal(status: ExecutionStatusResult["status"]): boolean {
    return status === "completed" || status === "failed" || status === "timed_out";
  }

  private describeQueuedMessage(cellIds: readonly string[]): string {
    return `Execution queued for ${cellIds.length} ${cellIds.length === 1 ? "cell" : "cells"}.`;
  }

  private describeRunningMessage(cellIds: readonly string[]): string {
    return `Execution running for ${cellIds.length} ${cellIds.length === 1 ? "cell" : "cells"}.`;
  }
}
