import type { BridgeError } from "../../protocol/src";

/**
 * A single step in a notebook workflow DAG.
 */
export interface WorkflowStep {
  id: string;
  tool: string;
  with: unknown;
  depends_on: string[];
}

/**
 * Resolved result of one workflow step after orchestration.
 */
export interface WorkflowStepResult {
  id: string;
  tool: string;
  status: "completed" | "failed" | "skipped";
  depends_on: string[];
  result?: unknown;
  error?: BridgeError;
}

/**
 * Final output of a workflow run.
 */
export interface WorkflowResult {
  completed_step_ids: string[];
  failed_step_ids: string[];
  skipped_step_ids: string[];
  steps: WorkflowStepResult[];
}

export type OnError = "stop" | "continue";

/**
 * Callback that executes a single workflow step.
 * The orchestrator is transport-agnostic — it delegates actual execution
 * to the caller via this callback.
 */
export type StepExecutor = (tool: string, input: unknown) => Promise<unknown>;

/**
 * Topologically order workflow steps so that dependencies are visited first.
 * Uses iterative DFS. Unknown dependency IDs are silently skipped.
 */
export function orderWorkflowSteps<T extends WorkflowStep>(steps: readonly T[]): T[] {
  const byId = new Map(steps.map((step) => [step.id, step]));
  const visited = new Set<string>();
  const ordered: T[] = [];

  const visit = (stepId: string): void => {
    if (visited.has(stepId)) {
      return;
    }

    const step = byId.get(stepId);
    if (!step) {
      return;
    }

    for (const dependency of step.depends_on) {
      visit(dependency);
    }
    visited.add(stepId);
    ordered.push(step);
  };

  for (const step of steps) {
    visit(step.id);
  }

  return ordered;
}

/**
 * Run an ordered sequence of workflow steps, tracking dependencies and
 * applying the error policy.
 *
 * @param steps      Steps in dependency-safe order (use {@link orderWorkflowSteps}).
 * @param onError    `"stop"` skips remaining steps after the first failure;
 *                   `"continue"` keeps going.
 * @param execute    Callback that performs the actual tool invocation.
 * @param toError    Converts a caught exception to a `BridgeError`.
 */
export async function runWorkflow(
  steps: readonly WorkflowStep[],
  onError: OnError,
  execute: StepExecutor,
  toError: (error: unknown) => BridgeError,
): Promise<WorkflowResult> {
  const results: WorkflowStepResult[] = [];
  const completedSteps = new Set<string>();
  let stopRequested = false;

  for (const step of steps) {
    if (stopRequested) {
      results.push({ id: step.id, tool: step.tool, status: "skipped", depends_on: step.depends_on });
      continue;
    }

    if (step.depends_on.some((dep) => !completedSteps.has(dep))) {
      results.push({ id: step.id, tool: step.tool, status: "skipped", depends_on: step.depends_on });
      continue;
    }

    try {
      const result = await execute(step.tool, step.with);
      results.push({ id: step.id, tool: step.tool, status: "completed", depends_on: step.depends_on, result });
      completedSteps.add(step.id);
    } catch (error) {
      results.push({ id: step.id, tool: step.tool, status: "failed", depends_on: step.depends_on, error: toError(error) });
      if (onError === "stop") {
        stopRequested = true;
      }
    }
  }

  return {
    completed_step_ids: results.filter((s) => s.status === "completed").map((s) => s.id),
    failed_step_ids: results.filter((s) => s.status === "failed").map((s) => s.id),
    skipped_step_ids: results.filter((s) => s.status === "skipped").map((s) => s.id),
    steps: results,
  };
}
