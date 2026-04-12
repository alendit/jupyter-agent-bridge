import assert from "node:assert/strict";
import test from "node:test";
import { buildUnifiedSourceDiff } from "./cellDiff";

test("buildUnifiedSourceDiff renders a compact single-hunk replacement", () => {
  const diff = buildUnifiedSourceDiff("print(1)\nprint(2)\n", "print(1)\nprint(3)\n");
  assert.equal(diff, "@@ -2,1 +2,1 @@\n-print(2)\n+print(3)");
});

test("buildUnifiedSourceDiff renders an empty hunk when sources match", () => {
  const diff = buildUnifiedSourceDiff("print(1)\n", "print(1)\n");
  assert.equal(diff, "@@ -3,0 +3,0 @@");
});
