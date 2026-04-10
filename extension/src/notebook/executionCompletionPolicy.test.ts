import assert from "node:assert/strict";
import test from "node:test";
import { deriveExecutionProgressState } from "./executionCompletionPolicy";

test("deriveExecutionProgressState skips later untouched cells after the first failure", () => {
  const state = deriveExecutionProgressState(
    [
      {
        cell_id: "cell-1",
        changed_from_baseline: true,
        failed: true,
      },
      {
        cell_id: "cell-2",
        changed_from_baseline: false,
        failed: false,
      },
      {
        cell_id: "cell-3",
        changed_from_baseline: false,
        failed: false,
      },
    ],
    true,
  );

  assert.deepEqual(state.pending_cell_ids, []);
  assert.deepEqual(state.skipped_cell_ids, ["cell-2", "cell-3"]);
});

test("deriveExecutionProgressState leaves later cells pending when stop_on_error is false", () => {
  const state = deriveExecutionProgressState(
    [
      {
        cell_id: "cell-1",
        changed_from_baseline: true,
        failed: true,
      },
      {
        cell_id: "cell-2",
        changed_from_baseline: false,
        failed: false,
      },
    ],
    false,
  );

  assert.deepEqual(state.pending_cell_ids, ["cell-2"]);
  assert.deepEqual(state.skipped_cell_ids, []);
});
