import assert from "node:assert/strict";
import test from "node:test";
import { waitForHostCommandDispatch } from "./hostCommandPolicy";

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test("waitForHostCommandDispatch detaches from a command that remains pending", async () => {
  const command = createDeferred<void>();

  assert.equal(await waitForHostCommandDispatch(command.promise), "pending");
});

test("waitForHostCommandDispatch reports commands that settle during dispatch", async () => {
  assert.equal(await waitForHostCommandDispatch(Promise.resolve()), "settled");
});

test("waitForHostCommandDispatch surfaces immediate command rejection", async () => {
  await assert.rejects(
    waitForHostCommandDispatch(Promise.reject(new Error("command unavailable"))),
    /command unavailable/,
  );
});
