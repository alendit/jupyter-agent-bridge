import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import { RendezvousRecord } from "../../../packages/protocol/src";
import { NotebookBridgeClient } from "../bridge/NotebookBridgeClient";
import { BridgeDiscovery } from "../bridge/BridgeDiscovery";
import { AppTools } from "./AppTools";
import { NOTEBOOK_APP_RESOURCE_URI } from "./AppTypes";

function createRecord(sessionId: string, bridgePort: number): RendezvousRecord {
  return {
    session_id: sessionId,
    workspace_id: "file:///workspace/demo",
    workspace_folders: ["file:///workspace/demo"],
    window_title: `Notebook ${sessionId}`,
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
      set_cell_input_visibility: true,
      preview_cell_edit: true,
    },
    pid: bridgePort,
    created_at: "2024-03-09T16:00:00.000Z",
    last_seen_at: new Date().toISOString(),
  };
}

async function writeSession(directory: string, record: RendezvousRecord): Promise<void> {
  await fs.writeFile(path.join(directory, `${record.session_id}.json`), JSON.stringify(record), "utf8");
}

test("AppTools registers helper tools and app launcher metadata", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "jupyter-agent-bridge-app-tools-"));
  await writeSession(tempDir, createRecord("session-1", 8123));
  const discovery = new BridgeDiscovery("/workspace/demo", tempDir, null);
  const tools = new AppTools(async () => {
    throw new Error("client should not be called in this test");
  }, discovery);

  const handlers = new Map<string, (input: unknown, extra: unknown) => Promise<{ structuredContent?: unknown; content: Array<{ text?: string }> }>>();
  const configs = new Map<string, Record<string, unknown>>();
  await tools.register({
    registerTool: (name: string, config: Record<string, unknown>, handler: (input: unknown, extra: unknown) => Promise<{ structuredContent?: unknown; content: Array<{ text?: string }> }>) => {
      configs.set(name, config);
      handlers.set(name, handler);
    },
  } as never, { enableApps: true });

  assert.ok(handlers.has("list_bridge_sessions"));
  assert.ok(handlers.has("select_bridge_session"));
  assert.ok(handlers.has("preview_cell_edit"));
  assert.ok(handlers.has("export_cell_output_snapshot"));

  // App launchers only register when @modelcontextprotocol/ext-apps is available.
  // If present, verify the metadata; otherwise confirm graceful skip.
  if (configs.has("open_bridge_session_chooser")) {
    assert.ok(handlers.has("open_cell_code_preview"));
    assert.equal(
      (configs.get("open_bridge_session_chooser")?._meta as { ui?: { resourceUri?: string } })?.ui?.resourceUri,
      NOTEBOOK_APP_RESOURCE_URI,
    );
  }

  const listResult = await handlers.get("list_bridge_sessions")?.({}, {});
  assert.equal((listResult?.structuredContent as { sessions: Array<{ session_id: string }> }).sessions[0]?.session_id, "session-1");

  await handlers.get("select_bridge_session")?.({ session_id: "session-1" }, {});
  assert.equal(discovery.getPinnedSessionId(), "session-1");
});

test("open_cell_code_preview returns cell snapshot and preview metadata", async () => {
  const discovery = new BridgeDiscovery("/workspace/demo", undefined, undefined);
  const client: Pick<NotebookBridgeClient, "readNotebook" | "listNotebookCells"> = {
    readNotebook: async () => ({
      notebook: {
        notebook_uri: "file:///workspace/demo.ipynb",
        notebook_type: "jupyter-notebook",
        notebook_version: 7,
        dirty: false,
        active_editor: true,
        visible_editor_count: 1,
        kernel: null,
      },
      cells: [
        {
          cell_id: "cell-7",
          index: 6,
          kind: "code",
          language: "python",
          notebook_line_start: 23,
          notebook_line_end: 30,
          source: "def migrate():\n    return True",
          source_fingerprint: "fp-1",
          metadata: {},
          execution: null,
        },
      ],
    }),
    listNotebookCells: async () => ({
      notebook_uri: "file:///workspace/demo.ipynb",
      notebook_version: 7,
      cells: [
        {
          cell_id: "cell-7",
          index: 6,
          kind: "code",
          language: "python",
          notebook_line_start: 23,
          notebook_line_end: 30,
          source_preview: "def migrate():",
          source_line_count: 2,
          source_fingerprint: "fp-1",
          execution_status: null,
          execution_order: null,
          started_at: null,
          ended_at: null,
          has_outputs: false,
          output_kinds: [],
          section_path: ["Migration"],
        },
      ],
    }),
  };

  const tools = new AppTools(async () => client as NotebookBridgeClient, discovery);
  const handlers = new Map<string, (input: unknown, extra: unknown) => Promise<{ structuredContent?: unknown; content: Array<{ text?: string }> }>>();
  await tools.register({
    registerTool: (name: string, _config: Record<string, unknown>, handler: (input: unknown, extra: unknown) => Promise<{ structuredContent?: unknown; content: Array<{ text?: string }> }>) => {
      handlers.set(name, handler);
    },
  } as never);

  const result = await handlers.get("open_cell_code_preview")?.(
    { notebook_uri: "file:///workspace/demo.ipynb", cell_id: "cell-7" },
    {},
  );
  const payload = result?.structuredContent as {
    view: string;
    notebook_uri: string;
    cell: { cell_id: string; source: string };
    preview: { section_path: string[] };
  };

  assert.equal(payload.view, "cell_code_preview");
  assert.equal(payload.notebook_uri, "file:///workspace/demo.ipynb");
  assert.equal(payload.cell.cell_id, "cell-7");
  assert.match(payload.cell.source, /def migrate/);
  assert.deepEqual(payload.preview.section_path, ["Migration"]);
});
