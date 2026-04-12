import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeCellNavigationRequest,
  parseCellNavigationPath,
  toRevealCellNavigationRequest,
} from "./cellNavigation";

test("normalizeCellNavigationRequest accepts structured editor-native navigation input", () => {
  assert.deepEqual(
    normalizeCellNavigationRequest({
      notebook_uri: "file:///workspace/demo.ipynb",
      cell_id: "cell-1",
      kind: "output",
    }),
    {
      notebook_uri: "file:///workspace/demo.ipynb",
      cell_id: "cell-1",
      kind: "output",
    },
  );
});

test("normalizeCellNavigationRequest rejects MCP resource URIs and malformed payloads", () => {
  assert.equal(
    normalizeCellNavigationRequest("jupyter://cell/output?notebook_uri=file:///workspace/demo.ipynb&cell_id=cell-1"),
    null,
  );
  assert.equal(
    normalizeCellNavigationRequest({
      notebook_uri: "file:///workspace/demo.ipynb",
      cell_id: "cell-1",
      kind: "cell",
    }),
    null,
  );
});

test("parseCellNavigationPath recognizes supported URI handler paths", () => {
  assert.equal(parseCellNavigationPath("/cell/code"), "code");
  assert.equal(parseCellNavigationPath("cell/output"), "output");
  assert.equal(parseCellNavigationPath("/cell/unknown"), null);
});

test("toRevealCellNavigationRequest maps output navigation to revealCells focus output", () => {
  assert.deepEqual(
    toRevealCellNavigationRequest({
      notebook_uri: "file:///workspace/demo.ipynb",
      cell_id: "cell-7",
      kind: "output",
    }),
    {
      notebook_uri: "file:///workspace/demo.ipynb",
      cell_ids: ["cell-7"],
      select: true,
      focus_target: "output",
    },
  );
});
