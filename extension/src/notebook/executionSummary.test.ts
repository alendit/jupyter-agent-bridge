import assert from "node:assert/strict";
import test from "node:test";
import { toCellExecutionSummary } from "./executionSummary";

test("toCellExecutionSummary ignores empty shell execution summaries", () => {
  assert.equal(
    toCellExecutionSummary({
      executionOrder: null,
    }),
    null,
  );
});

test("toCellExecutionSummary marks failed executions", () => {
  assert.deepEqual(
    toCellExecutionSummary({
      executionOrder: 4,
      success: false,
      timing: {
        startTime: 1_710_000_000_000,
        endTime: 1_710_000_001_000,
      },
    } as never),
    {
      status: "failed",
      execution_order: 4,
      started_at: "2024-03-09T16:00:00.000Z",
      ended_at: "2024-03-09T16:00:01.000Z",
    },
  );
});

test("toCellExecutionSummary marks running executions when only start time is known", () => {
  assert.deepEqual(
    toCellExecutionSummary({
      executionOrder: null,
      timing: {
        startTime: 1_710_000_000_000,
      },
    } as never),
    {
      status: "running",
      execution_order: null,
      started_at: "2024-03-09T16:00:00.000Z",
      ended_at: null,
    },
  );
});

test("toCellExecutionSummary marks succeeded executions when terminal evidence exists", () => {
  assert.deepEqual(
    toCellExecutionSummary({
      executionOrder: 7,
      success: undefined,
      timing: {},
    } as never),
    {
      status: "succeeded",
      execution_order: 7,
      started_at: null,
      ended_at: null,
    },
  );
});
