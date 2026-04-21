import assert from "node:assert/strict";
import test from "node:test";
import { NotebookBridgeClient } from "../bridge/NotebookBridgeClient";
import { AppPayloadBuilder } from "./AppPayloadBuilder";

test("AppPayloadBuilder builds code preview payloads from notebook snapshot and preview data", async () => {
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

  const builder = new AppPayloadBuilder();
  const payload = await builder.buildCellCodePreviewPayload(
    { notebook_uri: "file:///workspace/demo.ipynb", cell_id: "cell-7" },
    client as NotebookBridgeClient,
  );

  assert.equal(payload.view, "cell_code_preview");
  assert.equal(payload.notebook_uri, "file:///workspace/demo.ipynb");
  assert.equal(payload.cell.cell_id, "cell-7");
  assert.match(payload.cell.source, /def migrate/);
  assert.deepEqual(payload.preview.section_path, ["Migration"]);
});
