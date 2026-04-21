import assert from "node:assert/strict";
import test from "node:test";
import { ExecutionProgressReporter } from "./ExecutionProgressReporter";

test("ExecutionProgressReporter only sends notifications when the execution status changes", async () => {
  const notifications: Array<{ method: string; params: Record<string, unknown> }> = [];
  const reporter = new ExecutionProgressReporter({
    _meta: { progressToken: "token-1" },
    sendNotification: async (notification: { method: string; params: Record<string, unknown> }) => {
      notifications.push(notification);
    },
  } as never);

  await reporter.report("queued", "Queued");
  await reporter.report("queued", "Still queued");
  await reporter.report("running", "Running");

  assert.equal(notifications.length, 2);
  assert.deepEqual(notifications[0], {
    method: "notifications/progress",
    params: {
      progressToken: "token-1",
      progress: 10,
      total: 100,
      message: "Queued",
    },
  });
  assert.deepEqual(notifications[1], {
    method: "notifications/progress",
    params: {
      progressToken: "token-1",
      progress: 50,
      total: 100,
      message: "Running",
    },
  });
});
