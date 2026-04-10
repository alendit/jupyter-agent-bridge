import assert from "node:assert/strict";
import test from "node:test";
import { CellPatchService } from "./CellPatchService";

test("CellPatchService applies unified diff hunks", () => {
  const service = new CellPatchService();
  const result = service.applyPatch(
    "x = 1\nprint(x)\n",
    ["@@", " x = 1", "-print(x)", "+print(x + 1)"].join("\n"),
    "unified_diff",
  );

  assert.equal(result.format, "unified_diff");
  assert.equal(result.updatedSource, "x = 1\nprint(x + 1)\n");
});

test("CellPatchService applies codex apply_patch wrapper format", () => {
  const service = new CellPatchService();
  const result = service.applyPatch(
    "x = 1\nprint(x)\n",
    [
      "*** Begin Patch",
      "*** Update File: cell.py",
      "@@",
      " x = 1",
      "-print(x)",
      "+print(x * 2)",
      "*** End Patch",
    ].join("\n"),
    "codex_apply_patch",
  );

  assert.equal(result.format, "codex_apply_patch");
  assert.equal(result.updatedSource, "x = 1\nprint(x * 2)\n");
});

test("CellPatchService applies search_replace_json edits", () => {
  const service = new CellPatchService();
  const result = service.applyPatch(
    "x = 1\ny = x + 1\n",
    JSON.stringify([{ old: "x + 1", new: "x + 2" }]),
    "search_replace_json",
  );

  assert.equal(result.format, "search_replace_json");
  assert.equal(result.updatedSource, "x = 1\ny = x + 2\n");
});

test("CellPatchService auto-detects codex format", () => {
  const service = new CellPatchService();
  const result = service.applyPatch(
    "value = 1\n",
    [
      "*** Begin Patch",
      "*** Update File: cell.py",
      "@@",
      "-value = 1",
      "+value = 2",
      "*** End Patch",
    ].join("\n"),
  );

  assert.equal(result.format, "codex_apply_patch");
  assert.equal(result.updatedSource, "value = 2\n");
});

test("CellPatchService rejects ambiguous single-location patches", () => {
  const service = new CellPatchService();

  assert.throws(
    () =>
      service.applyPatch(
        "x = 1\nx = 1\n",
        ["@@", "-x = 1", "+x = 2"].join("\n"),
        "unified_diff",
      ),
    /matched multiple locations/,
  );
});
