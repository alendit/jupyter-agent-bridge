import assert from "node:assert/strict";
import test from "node:test";
import { NotebookBridgeClient } from "../bridge/NotebookBridgeClient";
import { NotebookWorkflowExecutor } from "./NotebookWorkflowExecutor";

test("NotebookWorkflowExecutor stops later workflow steps after a failure when on_error is stop", async () => {
  const calls: string[] = [];
  const client: Partial<NotebookBridgeClient> = {
    getNotebookOutline: async () => {
      calls.push("get_notebook_outline");
      return {
        notebook_uri: "file:///workspace/demo.ipynb",
        notebook_version: 1,
        headings: [],
      };
    },
    readNotebook: async () => {
      calls.push("read_notebook");
      throw {
        code: "NotebookChanged",
        message: "Cell moved",
        recoverable: true,
      };
    },
    summarizeNotebookState: async () => {
      calls.push("summarize_notebook_state");
      return {
        notebook_uri: "file:///workspace/demo.ipynb",
        notebook_version: 1,
        dirty: false,
        kernel: null,
        cells_with_errors: [],
        cells_with_images: [],
      };
    },
  };

  const executor = new NotebookWorkflowExecutor();
  const result = (await executor.execute(
    client as NotebookBridgeClient,
    {
      notebook_uri: "file:///workspace/demo.ipynb",
      on_error: "stop",
      steps: [
        {
          id: "outline",
          tool: "get_notebook_outline",
          with: {
            notebook_uri: "file:///workspace/demo.ipynb",
          },
          depends_on: [],
        },
        {
          id: "read",
          tool: "read_notebook",
          with: {
            notebook_uri: "file:///workspace/demo.ipynb",
          },
          depends_on: ["outline"],
        },
        {
          id: "summary",
          tool: "summarize_notebook_state",
          with: {
            notebook_uri: "file:///workspace/demo.ipynb",
          },
          depends_on: ["read"],
        },
      ],
    },
    async (_toolName, result) => result,
  )) as {
    completed_step_ids: string[];
    failed_step_ids: string[];
    skipped_step_ids: string[];
  };

  assert.deepEqual(calls, ["get_notebook_outline", "read_notebook"]);
  assert.deepEqual(result.completed_step_ids, ["outline"]);
  assert.deepEqual(result.failed_step_ids, ["read"]);
  assert.deepEqual(result.skipped_step_ids, ["summary"]);
});
