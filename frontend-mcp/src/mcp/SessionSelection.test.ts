import assert from "node:assert/strict";
import test from "node:test";
import { RendezvousRecord } from "../../../packages/protocol/src";
import { chooseSessionViaElicitation, formatSessionChoiceLabel } from "./SessionSelection";

function createRecord(sessionId: string, windowTitle: string, workspaceFolder: string): RendezvousRecord {
  return {
    session_id: sessionId,
    workspace_id: workspaceFolder,
    workspace_folders: [workspaceFolder],
    window_title: windowTitle,
    bridge_url: "http://127.0.0.1:8123/rpc",
    auth_token: `${sessionId}-token`,
    capabilities: {
      execute_cells: true,
      execute_cells_async: true,
      get_execution_status: true,
      wait_for_execution: true,
      interrupt_execution: true,
      restart_kernel: true,
      list_variables: true,
      wait_for_kernel_ready: true,
      select_kernel: true,
      select_jupyter_interpreter: true,
      reveal_cells: true,
      set_cell_input_visibility: true,
    },
    pid: 8123,
    created_at: "2024-03-09T16:00:00.000Z",
    last_seen_at: "2024-03-09T16:00:00.000Z",
  };
}

test("chooseSessionViaElicitation returns the accepted session candidate", async () => {
  const first = createRecord("session-1", "Notebook A", "file:///workspace/demo");
  const second = createRecord("session-2", "Notebook B", "file:///workspace/demo");

  const selected = await chooseSessionViaElicitation(
    [first, second],
    {
      sendRequest: async () => ({
        action: "accept",
        content: {
          session_id: "session-2",
        },
      }),
    } as never,
  );

  assert.equal(selected?.session_id, "session-2");
});

test("formatSessionChoiceLabel includes the window title, workspace label, and session id", () => {
  const label = formatSessionChoiceLabel(
    createRecord("session-9", "Notebook Window", "file:///workspace/demo-notebook"),
  );

  assert.match(label, /Notebook Window/);
  assert.match(label, /demo-notebook/);
  assert.match(label, /session-9/);
});
