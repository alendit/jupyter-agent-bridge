import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCanonicalSourcePreview,
  collectSourceContractWarnings,
  summarizeSourceContract,
} from "./sourceContract";

test("buildCanonicalSourcePreview preserves newlines and truncates long content", () => {
  const preview = buildCanonicalSourcePreview(`line 1
line 2
${"x".repeat(240)}`);

  assert.match(preview, /^line 1\nline 2\n/);
  assert.equal(preview.length, 201);
  assert.ok(preview.endsWith("…"));
});

test("collectSourceContractWarnings flags suspicious literal escape sequences", () => {
  assert.deepEqual(collectSourceContractWarnings(String.raw`print("a\nb")`), [
    "Source contains literal backslash escape sequences such as \\n or \\t. JSON strings are stored verbatim after decoding.",
  ]);
  assert.deepEqual(collectSourceContractWarnings("print('a\\nb')\nprint('ok')"), []);
});

test("summarizeSourceContract reports before and after fingerprints plus no-op patch warnings", () => {
  const summary = summarizeSourceContract({
    beforeSource: "value = 1\n",
    afterSource: "value = 1\n",
    beforeFingerprint: "before123",
    afterFingerprint: "after123",
    operation: "patch_cell_source",
  });

  assert.equal(summary.before_source_fingerprint, "before123");
  assert.equal(summary.after_source_fingerprint, "after123");
  assert.equal(summary.canonical_source_preview, "value = 1\n");
  assert.deepEqual(summary.warnings, ["Patch did not change the cell source."]);
});
