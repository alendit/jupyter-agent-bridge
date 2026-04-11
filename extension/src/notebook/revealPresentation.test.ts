import assert from "node:assert/strict";
import test from "node:test";
import { BridgeErrorException } from "../../../packages/protocol/src";
import { planRevealPresentation } from "./revealPresentation";

test("planRevealPresentation preserves the default cell-focused reveal behavior", () => {
  const plan = planRevealPresentation(
    {
      notebook_uri: "file:///workspace/demo.ipynb",
      cell_ids: ["cell-1"],
    },
    [{ index: 0, outputs: [] }],
  );

  assert.deepEqual(plan, {
    focusTarget: "cell",
    focusCellIndex: null,
  });
});

test("planRevealPresentation chooses the first revealed cell with output when output focus is requested", () => {
  const plan = planRevealPresentation(
    {
      notebook_uri: "file:///workspace/demo.ipynb",
      range: { start: 0, end: 3 },
      focus_target: "output",
    },
    [
      { index: 0, outputs: [] },
      { index: 1, outputs: [{}] },
      { index: 2, outputs: [{}, {}] },
    ],
  );

  assert.deepEqual(plan, {
    focusTarget: "output",
    focusCellIndex: 1,
  });
});

test("planRevealPresentation fails when output focus is requested but no revealed cell has output", () => {
  assert.throws(
    () =>
      planRevealPresentation(
        {
          notebook_uri: "file:///workspace/demo.ipynb",
          cell_ids: ["cell-1"],
          focus_target: "output",
        },
        [{ index: 0, outputs: [] }],
      ),
    (error: unknown) =>
      error instanceof BridgeErrorException &&
      error.code === "CellOutputNotFound" &&
      error.message === "The reveal target did not include a cell with output.",
  );
});
