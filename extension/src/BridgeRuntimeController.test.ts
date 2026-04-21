import assert from "node:assert/strict";
import test from "node:test";
import { BridgeRuntimeController } from "./BridgeRuntimeController";

test("BridgeRuntimeController memoizes start and clears the current runtime on stop", async () => {
  let starts = 0;
  const stopped: Array<{ sessionId: string }> = [];
  const controller = new BridgeRuntimeController({
    start: async (): Promise<{ sessionId: string }> => {
      starts += 1;
      return {
        sessionId: `session-${starts}`,
      };
    },
    stop: async (state: { sessionId: string }): Promise<void> => {
      stopped.push(state);
    },
    formatRunningSummary: (state: { sessionId: string }): string => `Running ${state.sessionId}`,
    stoppedSummary: "Stopped.",
  });

  const first = await controller.ensureStarted();
  const second = await controller.ensureStarted();

  assert.equal(starts, 1);
  assert.deepEqual(first, second);
  assert.equal(controller.getStatusSummary(), "Running session-1");

  const wasRunning = await controller.stop();
  assert.equal(wasRunning, true);
  assert.deepEqual(stopped, [{ sessionId: "session-1" }]);
  assert.equal(controller.getStatusSummary(), "Stopped.");
});
