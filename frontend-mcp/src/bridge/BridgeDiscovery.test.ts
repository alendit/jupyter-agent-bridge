import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import { BridgeErrorException, RendezvousRecord } from "../../../packages/protocol/src";
import { BridgeDiscovery } from "./BridgeDiscovery";

function createRecord(
  sessionId: string,
  workspaceFolder: string,
  bridgePort: number,
  windowTitle: string,
): RendezvousRecord {
  return {
    session_id: sessionId,
    workspace_id: workspaceFolder,
    workspace_folders: [workspaceFolder],
    window_title: windowTitle,
    bridge_url: `http://127.0.0.1:${bridgePort}/rpc`,
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
    },
    pid: bridgePort,
    created_at: "2024-03-09T16:00:00.000Z",
    last_seen_at: new Date().toISOString(),
  };
}

async function writeSession(directory: string, record: RendezvousRecord): Promise<void> {
  await fs.writeFile(
    path.join(directory, `${record.session_id}.json`),
    `${JSON.stringify(record, null, 2)}\n`,
    "utf8",
  );
}

test("selectSession uses chooser results and caches the selected session for later ambiguity", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "jupyter-agent-bridge-sessions-"));
  const workspaceFolder = "file:///workspace/demo";
  const first = createRecord("session-1", workspaceFolder, 8123, "Notebook A");
  const second = createRecord("session-2", workspaceFolder, 8124, "Notebook B");
  await writeSession(tempDir, first);
  await writeSession(tempDir, second);

  const discovery = new BridgeDiscovery("/workspace/demo", tempDir, null);
  let chooserCalls = 0;

  const chosen = await discovery.selectSession({
    chooseSession: async (candidates) => {
      chooserCalls += 1;
      assert.equal(candidates.length, 2);
      return second;
    },
  });
  assert.equal(chosen.session_id, "session-2");

  const cached = await discovery.selectSession({
    chooseSession: async () => {
      chooserCalls += 1;
      return first;
    },
  });
  assert.equal(cached.session_id, "session-2");
  assert.equal(chooserCalls, 1);
});

test("selectSession falls back to AmbiguousSession when chooser declines", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "jupyter-agent-bridge-sessions-"));
  const workspaceFolder = "file:///workspace/demo";
  await writeSession(tempDir, createRecord("session-1", workspaceFolder, 8123, "Notebook A"));
  await writeSession(tempDir, createRecord("session-2", workspaceFolder, 8124, "Notebook B"));

  const discovery = new BridgeDiscovery("/workspace/demo", tempDir, null);
  await assert.rejects(
    () =>
      discovery.selectSession({
        chooseSession: async () => undefined,
      }),
    (error) =>
      error instanceof BridgeErrorException &&
      error.code === "AmbiguousSession" &&
      JSON.stringify(error.detail).includes("Notebook A"),
  );
});
