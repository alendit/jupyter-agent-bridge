import assert from "node:assert/strict";
import test from "node:test";
import { BridgeErrorException, ExecuteCellsResult } from "../../../packages/protocol/src";
import { NotebookAsyncExecutionService } from "./NotebookAsyncExecutionService";

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return {
    promise,
    resolve,
    reject,
  };
}

function createRegistry(
  document: unknown,
  initialQueue?: Promise<unknown>,
  version = 7,
): {
  enqueueExclusive: (notebookUri: string, operation: () => Promise<unknown>) => Promise<unknown>;
  getDocument: () => unknown;
  getVersion: () => number;
} {
  let queue = initialQueue ?? Promise.resolve();
  return {
    enqueueExclusive: (_notebookUri, operation) => {
      const current = queue.then(operation);
      queue = current.then(
        () => undefined,
        () => undefined,
      );
      return current;
    },
    getDocument: () => document,
    getVersion: () => version,
  };
}

function createResult(notebookUri = "file:///workspace/demo.ipynb"): ExecuteCellsResult {
  return {
    notebook_uri: notebookUri,
    notebook_version: 7,
    kernel: null,
    results: [
      {
        cell_id: "cell-1",
        execution: {
          status: "succeeded",
          execution_order: 1,
          started_at: "2024-03-09T16:00:00.000Z",
          ended_at: "2024-03-09T16:00:01.000Z",
        },
        outputs: [],
      },
    ],
  };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

test("executeCellsAsync tracks queued, running, and completed states", async () => {
  const barrier = createDeferred<void>();
  const execution = createDeferred<ExecuteCellsResult>();
  const document = { uri: { toString: () => "file:///workspace/demo.ipynb" } };
  const registry = createRegistry(document, barrier.promise);
  const service = new NotebookAsyncExecutionService(
    registry as never,
    {
      requireReadyDocument: async () => document as never,
    } as never,
    {
      assertExpectedVersion: () => undefined,
    } as never,
    {
      executeCells: async () => execution.promise,
    } as never,
    {
      getKernelInfoValue: () => null,
    } as never,
    undefined,
    () => Date.parse("2024-03-09T16:00:00.000Z"),
    () => "00000000-0000-0000-0000-000000000001",
  );

  const accepted = await service.executeCellsAsync({
    notebook_uri: "file:///workspace/demo.ipynb",
    cell_ids: ["cell-1"],
  });
  assert.equal(accepted.status, "queued");

  const queued = service.getExecutionStatus({ execution_id: "00000000-0000-0000-0000-000000000001" });
  assert.equal(queued.status, "queued");

  barrier.resolve();
  await flushMicrotasks();
  const running = service.getExecutionStatus({ execution_id: "00000000-0000-0000-0000-000000000001" });
  assert.equal(running.status, "running");

  execution.resolve(createResult());
  await flushMicrotasks();
  const completed = service.getExecutionStatus({ execution_id: "00000000-0000-0000-0000-000000000001" });
  assert.equal(completed.status, "completed");
  assert.ok(completed.result);
});

test("async executions retain notebook serialization with later exclusive work", async () => {
  const execution = createDeferred<ExecuteCellsResult>();
  const order: string[] = [];
  const document = { uri: { toString: () => "file:///workspace/demo.ipynb" } };
  const registry = createRegistry(document);
  const service = new NotebookAsyncExecutionService(
    registry as never,
    {
      requireReadyDocument: async () => document as never,
    } as never,
    {
      assertExpectedVersion: () => undefined,
    } as never,
    {
      executeCells: async () => {
        order.push("async-start");
        const result = await execution.promise;
        order.push("async-end");
        return result;
      },
    } as never,
    {
      getKernelInfoValue: () => null,
    } as never,
    undefined,
    () => Date.parse("2024-03-09T16:00:00.000Z"),
    () => "00000000-0000-0000-0000-000000000002",
  );

  await service.executeCellsAsync({
    notebook_uri: "file:///workspace/demo.ipynb",
    cell_ids: ["cell-1"],
  });

  const secondOperation = registry.enqueueExclusive("file:///workspace/demo.ipynb", async () => {
    order.push("second-op");
    return undefined;
  });

  await flushMicrotasks();
  assert.deepEqual(order, ["async-start"]);

  execution.resolve(createResult());
  await secondOperation;
  assert.deepEqual(order, ["async-start", "async-end", "second-op"]);
});

test("waitForExecution can time out without cancelling the underlying execution", async () => {
  const execution = createDeferred<ExecuteCellsResult>();
  const document = { uri: { toString: () => "file:///workspace/demo.ipynb" } };
  const registry = createRegistry(document);
  const service = new NotebookAsyncExecutionService(
    registry as never,
    {
      requireReadyDocument: async () => document as never,
    } as never,
    {
      assertExpectedVersion: () => undefined,
    } as never,
    {
      executeCells: async () => execution.promise,
    } as never,
    {
      getKernelInfoValue: () => null,
    } as never,
    undefined,
    () => Date.parse("2024-03-09T16:00:00.000Z"),
    () => "00000000-0000-0000-0000-000000000003",
  );

  await service.executeCellsAsync({
    notebook_uri: "file:///workspace/demo.ipynb",
    cell_ids: ["cell-1"],
  });
  await flushMicrotasks();

  const timedOut = await service.waitForExecution({
    execution_id: "00000000-0000-0000-0000-000000000003",
    timeout_ms: 5,
  });
  assert.equal(timedOut.wait_timed_out, true);
  assert.equal(timedOut.status, "running");

  execution.resolve(createResult());
  await flushMicrotasks();
  assert.equal(
    service.getExecutionStatus({ execution_id: "00000000-0000-0000-0000-000000000003" }).status,
    "completed",
  );
});

test("timed out executions are tracked as terminal snapshots with result details", async () => {
  const document = { uri: { toString: () => "file:///workspace/demo.ipynb" } };
  const registry = createRegistry(document);
  const service = new NotebookAsyncExecutionService(
    registry as never,
    {
      requireReadyDocument: async () => document as never,
    } as never,
    {
      assertExpectedVersion: () => undefined,
    } as never,
    {
      executeCells: async () => {
        throw new BridgeErrorException({
          code: "ExecutionTimedOut",
          message: "Execution did not complete within 1000ms.",
          detail: [
            {
              cell_id: "cell-1",
              execution: {
                status: "timed_out",
                execution_order: null,
                started_at: null,
                ended_at: null,
              },
              outputs: [],
            },
          ],
          recoverable: true,
        });
      },
    } as never,
    {
      getKernelInfoValue: () => null,
    } as never,
    undefined,
    () => Date.parse("2024-03-09T16:00:00.000Z"),
    () => "00000000-0000-0000-0000-000000000004",
  );

  await service.executeCellsAsync({
    notebook_uri: "file:///workspace/demo.ipynb",
    cell_ids: ["cell-1"],
  });
  await flushMicrotasks();

  const snapshot = service.getExecutionStatus({ execution_id: "00000000-0000-0000-0000-000000000004" });
  assert.equal(snapshot.status, "timed_out");
  assert.equal(snapshot.error?.code, "ExecutionTimedOut");
  assert.ok(snapshot.result);
  assert.equal(snapshot.result?.results[0]?.cell_id, "cell-1");
});

test("expired execution handles are evicted lazily and unknown handles fail clearly", async () => {
  let now = Date.parse("2024-03-09T16:00:00.000Z");
  const document = { uri: { toString: () => "file:///workspace/demo.ipynb" } };
  const registry = createRegistry(document);
  const service = new NotebookAsyncExecutionService(
    registry as never,
    {
      requireReadyDocument: async () => document as never,
    } as never,
    {
      assertExpectedVersion: () => undefined,
    } as never,
    {
      executeCells: async () => createResult(),
    } as never,
    {
      getKernelInfoValue: () => null,
    } as never,
    undefined,
    () => now,
    () => "00000000-0000-0000-0000-000000000005",
  );

  assert.throws(
    () => service.getExecutionStatus({ execution_id: "missing" }),
    (error) => error instanceof BridgeErrorException && error.code === "ExecutionNotFound",
  );

  await service.executeCellsAsync({
    notebook_uri: "file:///workspace/demo.ipynb",
    cell_ids: ["cell-1"],
  });
  await flushMicrotasks();
  assert.equal(
    service.getExecutionStatus({ execution_id: "00000000-0000-0000-0000-000000000005" }).status,
    "completed",
  );

  now += 16 * 60_000;
  assert.throws(
    () => service.getExecutionStatus({ execution_id: "00000000-0000-0000-0000-000000000005" }),
    (error) => error instanceof BridgeErrorException && error.code === "ExecutionNotFound",
  );
});
