import assert from "node:assert/strict";
import test from "node:test";
import { NOTEBOOK_OUTPUT_KINDS } from "@jupyter-agent-bridge/protocol/notebook";

test("notebook-domain consumes notebook-only contracts through the notebook subpath", () => {
  assert.deepEqual(NOTEBOOK_OUTPUT_KINDS, [
    "text",
    "markdown",
    "json",
    "html",
    "image",
    "stdout",
    "stderr",
    "error",
    "unknown",
  ]);
});
