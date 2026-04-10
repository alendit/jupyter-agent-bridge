import assert from "node:assert/strict";
import test from "node:test";
import { mapHostKernelStatus } from "./hostKernelState";

test("mapHostKernelStatus normalizes external kernel states", () => {
  assert.equal(mapHostKernelStatus("idle"), "idle");
  assert.equal(mapHostKernelStatus("busy"), "busy");
  assert.equal(mapHostKernelStatus("starting"), "starting");
  assert.equal(mapHostKernelStatus("restarting"), "restarting");
  assert.equal(mapHostKernelStatus("autorestarting"), "restarting");
  assert.equal(mapHostKernelStatus("terminating"), "disconnected");
  assert.equal(mapHostKernelStatus("dead"), "disconnected");
  assert.equal(mapHostKernelStatus("unknown"), "unknown");
  assert.equal(mapHostKernelStatus(null), "unknown");
});
