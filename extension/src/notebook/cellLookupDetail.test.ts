import test from "node:test";
import assert from "node:assert/strict";
import { buildCellLookupDetail } from "./cellLookupDetail";

test("buildCellLookupDetail returns notebook context and a bounded id sample", () => {
  const detail = buildCellLookupDetail(
    "file:///workspace/demo.ipynb",
    7,
    ["cell-1", "cell-2", "cell-3", "cell-4", "cell-5", "cell-6"],
    "cell-99",
  );

  assert.equal(detail.notebook_uri, "file:///workspace/demo.ipynb");
  assert.equal(detail.notebook_version, 7);
  assert.equal(detail.requested_cell_id, "cell-99");
  assert.equal(detail.cell_count, 6);
  assert.deepEqual(detail.known_cell_ids_sample, ["cell-1", "cell-2", "cell-3", "cell-4", "cell-5"]);
});

test("buildCellLookupDetail offers cheap closest matches when obvious candidates exist", () => {
  const detail = buildCellLookupDetail(
    "file:///workspace/demo.ipynb",
    7,
    ["intro-cell", "train-cell", "train-cell-2", "summary-cell"],
    "train-cell-99",
  );

  assert.deepEqual(detail.closest_matches, ["train-cell", "train-cell-2"]);
});
