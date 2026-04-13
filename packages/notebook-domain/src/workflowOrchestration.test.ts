import assert from "node:assert/strict";
import test from "node:test";
import { orderWorkflowSteps, runWorkflow, type WorkflowStep } from "./workflowOrchestration";
import type { BridgeError } from "../../protocol/src";

const toError = (error: unknown): BridgeError => ({
  code: "BridgeUnavailable",
  message: error instanceof Error ? error.message : String(error),
});

// --- orderWorkflowSteps ---

test("orderWorkflowSteps returns steps in dependency-first order", () => {
  const steps: WorkflowStep[] = [
    { id: "b", tool: "t", with: {}, depends_on: ["a"] },
    { id: "a", tool: "t", with: {}, depends_on: [] },
    { id: "c", tool: "t", with: {}, depends_on: ["b"] },
  ];

  const ids = orderWorkflowSteps(steps).map((s) => s.id);
  assert.deepEqual(ids, ["a", "b", "c"]);
});

test("orderWorkflowSteps preserves original order when there are no dependencies", () => {
  const steps: WorkflowStep[] = [
    { id: "x", tool: "t", with: {}, depends_on: [] },
    { id: "y", tool: "t", with: {}, depends_on: [] },
    { id: "z", tool: "t", with: {}, depends_on: [] },
  ];

  const ids = orderWorkflowSteps(steps).map((s) => s.id);
  assert.deepEqual(ids, ["x", "y", "z"]);
});

test("orderWorkflowSteps silently skips unknown dependency IDs", () => {
  const steps: WorkflowStep[] = [
    { id: "a", tool: "t", with: {}, depends_on: ["nonexistent"] },
    { id: "b", tool: "t", with: {}, depends_on: [] },
  ];

  const ids = orderWorkflowSteps(steps).map((s) => s.id);
  assert.deepEqual(ids, ["a", "b"]);
});

test("orderWorkflowSteps handles diamond dependencies", () => {
  const steps: WorkflowStep[] = [
    { id: "d", tool: "t", with: {}, depends_on: ["b", "c"] },
    { id: "b", tool: "t", with: {}, depends_on: ["a"] },
    { id: "c", tool: "t", with: {}, depends_on: ["a"] },
    { id: "a", tool: "t", with: {}, depends_on: [] },
  ];

  const ids = orderWorkflowSteps(steps).map((s) => s.id);
  assert.ok(ids.indexOf("a") < ids.indexOf("b"));
  assert.ok(ids.indexOf("a") < ids.indexOf("c"));
  assert.ok(ids.indexOf("b") < ids.indexOf("d"));
  assert.ok(ids.indexOf("c") < ids.indexOf("d"));
});

// --- runWorkflow ---

test("runWorkflow executes all steps in order and reports completed", async () => {
  const steps: WorkflowStep[] = [
    { id: "a", tool: "read", with: { x: 1 }, depends_on: [] },
    { id: "b", tool: "write", with: { y: 2 }, depends_on: ["a"] },
  ];

  const calls: string[] = [];
  const execute = async (tool: string, _input: unknown) => {
    calls.push(tool);
    return { ok: true };
  };

  const result = await runWorkflow(steps, "stop", execute, toError);

  assert.deepEqual(calls, ["read", "write"]);
  assert.deepEqual(result.completed_step_ids, ["a", "b"]);
  assert.deepEqual(result.failed_step_ids, []);
  assert.deepEqual(result.skipped_step_ids, []);
  assert.equal(result.steps.length, 2);
  assert.deepEqual(result.steps[0].result, { ok: true });
});

test("runWorkflow with on_error=stop skips remaining steps after failure", async () => {
  const steps: WorkflowStep[] = [
    { id: "a", tool: "t", with: {}, depends_on: [] },
    { id: "b", tool: "t", with: {}, depends_on: [] },
    { id: "c", tool: "t", with: {}, depends_on: [] },
  ];

  const execute = async (_tool: string, _input: unknown) => {
    throw new Error("boom");
  };

  const result = await runWorkflow(steps, "stop", execute, toError);

  assert.deepEqual(result.failed_step_ids, ["a"]);
  assert.deepEqual(result.skipped_step_ids, ["b", "c"]);
  assert.deepEqual(result.completed_step_ids, []);
  assert.equal(result.steps[0].error?.message, "boom");
});

test("runWorkflow with on_error=continue keeps going after failure", async () => {
  const steps: WorkflowStep[] = [
    { id: "a", tool: "t", with: {}, depends_on: [] },
    { id: "b", tool: "t", with: {}, depends_on: [] },
  ];

  let callCount = 0;
  const execute = async (_tool: string, _input: unknown) => {
    callCount++;
    if (callCount === 1) throw new Error("boom");
    return { ok: true };
  };

  const result = await runWorkflow(steps, "continue", execute, toError);

  assert.deepEqual(result.failed_step_ids, ["a"]);
  assert.deepEqual(result.completed_step_ids, ["b"]);
  assert.deepEqual(result.skipped_step_ids, []);
});

test("runWorkflow skips steps whose dependencies were not completed", async () => {
  const steps: WorkflowStep[] = [
    { id: "a", tool: "t", with: {}, depends_on: [] },
    { id: "b", tool: "t", with: {}, depends_on: ["a"] },
  ];

  const execute = async (_tool: string, _input: unknown) => {
    throw new Error("fail");
  };

  const result = await runWorkflow(steps, "continue", execute, toError);

  assert.deepEqual(result.failed_step_ids, ["a"]);
  assert.deepEqual(result.skipped_step_ids, ["b"]);
  assert.deepEqual(result.completed_step_ids, []);
});

test("runWorkflow returns empty results for empty step list", async () => {
  const execute = async () => ({ ok: true });

  const result = await runWorkflow([], "stop", execute, toError);

  assert.deepEqual(result.completed_step_ids, []);
  assert.deepEqual(result.failed_step_ids, []);
  assert.deepEqual(result.skipped_step_ids, []);
  assert.deepEqual(result.steps, []);
});
