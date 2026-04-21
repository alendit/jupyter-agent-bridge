import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import { ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types.js";
import { NotebookBridgeClient } from "../bridge/NotebookBridgeClient";

const EXECUTION_STATUS_PROGRESS: Record<string, number> = {
  queued: 10,
  running: 50,
  completed: 100,
  failed: 100,
  timed_out: 100,
};

const WAIT_FOR_EXECUTION_POLL_INTERVAL_MS = 250;

export class ExecutionProgressReporter {
  private lastStatus: string | null = null;

  public constructor(
    private readonly extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
  ) {}

  public isEnabled(): boolean {
    return this.extra._meta?.progressToken !== undefined;
  }

  public async waitForExecution(
    client: NotebookBridgeClient,
    request: { execution_id: string; timeout_ms?: number },
  ): Promise<unknown> {
    const timeoutMs = request.timeout_ms ?? 30_000;
    const deadline = Date.now() + timeoutMs;

    while (true) {
      const status = await client.getExecutionStatus({
        execution_id: request.execution_id,
      });
      await this.report(status.status, status.message);

      if (this.isTerminalExecutionStatus(status.status)) {
        return {
          ...status,
          wait_timed_out: false,
        };
      }

      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        return {
          ...status,
          wait_timed_out: true,
        };
      }

      await this.sleep(Math.min(WAIT_FOR_EXECUTION_POLL_INTERVAL_MS, remainingMs));
    }
  }

  public async report(status: string, message: string): Promise<void> {
    const progressToken = this.extra._meta?.progressToken;
    if (progressToken === undefined || status === this.lastStatus) {
      return;
    }

    this.lastStatus = status;
    await this.extra.sendNotification({
      method: "notifications/progress",
      params: {
        progressToken,
        progress: EXECUTION_STATUS_PROGRESS[status] ?? 0,
        total: 100,
        message,
      },
    });
  }

  private isTerminalExecutionStatus(status: string): boolean {
    return status === "completed" || status === "failed" || status === "timed_out";
  }

  private async sleep(durationMs: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, durationMs));
  }
}
