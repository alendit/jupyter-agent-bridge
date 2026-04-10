import { CellExecutionSummary } from "../../../packages/protocol/src";

interface ExecutionSummaryLike {
  executionOrder?: number | null;
}

interface ExecutionSummaryWithStatus extends ExecutionSummaryLike {
  success?: boolean;
  timing?: {
    startTime?: number;
    endTime?: number;
  };
}

export function toCellExecutionSummary(summary: ExecutionSummaryLike | undefined): CellExecutionSummary | null {
  if (!summary) {
    return null;
  }

  const execution = summary as ExecutionSummaryWithStatus;
  const executionOrder = summary.executionOrder ?? null;
  const success = execution.success;
  const timing = execution.timing;
  const startedAt = timing?.startTime ? new Date(timing.startTime).toISOString() : null;
  const endedAt = timing?.endTime ? new Date(timing.endTime).toISOString() : null;

  if (success === false) {
    return {
      status: "failed",
      execution_order: executionOrder,
      started_at: startedAt,
      ended_at: endedAt,
    };
  }

  if (success === true || endedAt !== null || executionOrder !== null) {
    return {
      status: "succeeded",
      execution_order: executionOrder,
      started_at: startedAt,
      ended_at: endedAt,
    };
  }

  if (startedAt !== null) {
    return {
      status: "running",
      execution_order: executionOrder,
      started_at: startedAt,
      ended_at: endedAt,
    };
  }

  return null;
}

export function executionSummarySignature(summary: ExecutionSummaryLike | undefined): string {
  const normalized = toCellExecutionSummary(summary);
  if (!normalized) {
    return "null";
  }

  return JSON.stringify(normalized);
}

export function isExecutionSummaryRunning(summary: ExecutionSummaryLike | undefined): boolean {
  return toCellExecutionSummary(summary)?.status === "running";
}
