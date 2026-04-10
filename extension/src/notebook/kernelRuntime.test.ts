import assert from "node:assert/strict";
import test from "node:test";
import { createInitialKernelRuntimeState, isKernelReady, markKernelCommandRequested, reconcileKernelRuntimeState } from "./kernelRuntime";
import { ParsedNotebookKernelMetadata } from "./kernelMetadata";

const baseMetadata: ParsedNotebookKernelMetadata = {
  kernel_label: "Python 3.13",
  kernel_id: "python3",
  language: "python",
  execution_supported: true,
  has_kernel: true,
  signature: "python3::Python 3.13",
};

test("createInitialKernelRuntimeState starts selected kernels as idle generation 1", () => {
  const state = createInitialKernelRuntimeState(baseMetadata, 1000);

  assert.deepEqual(state, {
    generation: 1,
    state: "idle",
    pending_action: null,
    requires_user_interaction: false,
    last_seen_at_ms: 1000,
    kernel_signature: "python3::Python 3.13",
  });
});

test("reconcileKernelRuntimeState bumps generation when kernel signature changes", () => {
  const initial = createInitialKernelRuntimeState(baseMetadata, 1000);
  const next = reconcileKernelRuntimeState(
    initial,
    {
      ...baseMetadata,
      kernel_label: "Python 3.14",
      signature: "python3.14::Python 3.14",
    },
    { now: 2000 },
  );

  assert.equal(next.generation, 2);
  assert.equal(next.state, "idle");
  assert.equal(next.pending_action, null);
  assert.equal(next.last_seen_at_ms, 2000);
});

test("markKernelCommandRequested tracks pending interactive selection", () => {
  const initial = createInitialKernelRuntimeState(baseMetadata, 1000);
  const next = markKernelCommandRequested(initial, "select_interpreter", {
    now: 2500,
    requires_user_interaction: true,
    bump_generation: true,
  });

  assert.equal(next.generation, 2);
  assert.equal(next.state, "selecting");
  assert.equal(next.pending_action, "select_interpreter");
  assert.equal(next.requires_user_interaction, true);
});

test("isKernelReady requires matching generation and no pending interaction", () => {
  assert.equal(
    isKernelReady(
      {
        ...baseMetadata,
        state: "idle",
        generation: 2,
        pending_action: null,
        requires_user_interaction: false,
      },
      2,
    ),
    true,
  );

  assert.equal(
    isKernelReady(
      {
        ...baseMetadata,
        state: "selecting",
        generation: 2,
        pending_action: "select_kernel",
        requires_user_interaction: false,
      },
      2,
    ),
    false,
  );
});
