import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveExecutionProgressState,
  waitForObservedExecutionCompletion,
} from "./executionCompletionPolicy";

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test("deriveExecutionProgressState skips later untouched cells after the first failure", () => {
  const state = deriveExecutionProgressState(
    [
      {
        cell_id: "cell-1",
        changed_from_baseline: true,
        terminal: true,
        failed: true,
      },
      {
        cell_id: "cell-2",
        changed_from_baseline: false,
        terminal: false,
        failed: false,
      },
      {
        cell_id: "cell-3",
        changed_from_baseline: false,
        terminal: false,
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
        terminal: true,
        failed: true,
      },
      {
        cell_id: "cell-2",
        changed_from_baseline: false,
        terminal: false,
        failed: false,
      },
    ],
    false,
  );

  assert.deepEqual(state.pending_cell_ids, ["cell-2"]);
  assert.deepEqual(state.skipped_cell_ids, []);
});

test("deriveExecutionProgressState keeps changed but non-terminal cells pending", () => {
  const state = deriveExecutionProgressState(
    [
      {
        cell_id: "cell-1",
        changed_from_baseline: true,
        terminal: false,
        failed: false,
      },
    ],
    true,
  );

  assert.deepEqual(state.pending_cell_ids, ["cell-1"]);
  assert.deepEqual(state.skipped_cell_ids, []);
});

test("deriveExecutionProgressState ignores output-only changes without a fresh terminal summary", () => {
  const state = deriveExecutionProgressState(
    [
      {
        cell_id: "cell-1",
        changed_from_baseline: false,
        terminal: true,
        failed: false,
      },
    ],
    true,
  );

  assert.deepEqual(state.pending_cell_ids, ["cell-1"]);
  assert.deepEqual(state.skipped_cell_ids, []);
});

test("waitForObservedExecutionCompletion returns terminal cell state while the editor command remains pending", async () => {
  const observedCompletion = createDeferred<string>();
  const editorCommand = createDeferred<void>();
  const completion = waitForObservedExecutionCompletion(observedCompletion.promise, editorCommand.promise);

  observedCompletion.resolve("failed");

  assert.equal(await completion, "failed");
});

test("waitForObservedExecutionCompletion does not treat editor command resolution as cell completion", async () => {
  const observedCompletion = createDeferred<string>();
  const editorCommand = createDeferred<void>();
  let settled = false;
  const completion = waitForObservedExecutionCompletion(observedCompletion.promise, editorCommand.promise).then(
    (value) => {
      settled = true;
      return value;
    },
  );

  editorCommand.resolve();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(settled, false);

  observedCompletion.resolve("succeeded");
  assert.equal(await completion, "succeeded");
});

test("waitForObservedExecutionCompletion surfaces editor command failures", async () => {
  const observedCompletion = createDeferred<string>();
  const editorCommand = createDeferred<void>();
  const completion = waitForObservedExecutionCompletion(observedCompletion.promise, editorCommand.promise);

  editorCommand.reject(new Error("execution command failed"));

  await assert.rejects(completion, /execution command failed/);
});
