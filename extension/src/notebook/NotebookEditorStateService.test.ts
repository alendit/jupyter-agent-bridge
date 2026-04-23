import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import type * as vscode from "vscode";

type WindowState = {
  activeNotebookEditor?: vscode.NotebookEditor;
  visibleNotebookEditors: vscode.NotebookEditor[];
  activeTextEditor?: vscode.TextEditor;
};

function createUri(uri: string): vscode.Uri {
  return {
    toString: () => uri,
  } as vscode.Uri;
}

function createCell(cellId: string, index: number, source: string): vscode.NotebookCell {
  return {
    index,
    kind: 2,
    metadata: {
      jupyterAgentBridge: {
        cellId,
      },
    },
    document: {
      uri: createUri(`vscode-notebook-cell:/workspace/demo.ipynb#${cellId}`),
      getText: () => source,
    },
  } as unknown as vscode.NotebookCell;
}

function createNotebookDocument(cells: vscode.NotebookCell[]): vscode.NotebookDocument {
  return {
    uri: createUri("file:///workspace/demo.ipynb"),
    cellCount: cells.length,
    getCells: () => cells,
    cellAt: (index: number) => cells[index],
  } as vscode.NotebookDocument;
}

async function withNotebookRegistryTestHarness(
  windowState: WindowState,
  run: (context: {
    NotebookRegistry: typeof import("./NotebookRegistry").NotebookRegistry;
  }) => Promise<void>,
): Promise<void> {
  const testRequire = require as NodeRequire;
  const moduleCtor = Module as unknown as {
    _load: (request: string, parent: NodeModule | undefined, isMain: boolean) => unknown;
  };
  const registryModulePath = testRequire.resolve("./NotebookRegistry");
  const originalLoad = moduleCtor._load;
  const vscodeStub = {
    window: windowState,
    workspace: {
      notebookDocuments: [],
      onDidOpenNotebookDocument: () => ({ dispose: () => undefined }),
      onDidCloseNotebookDocument: () => ({ dispose: () => undefined }),
      onDidChangeNotebookDocument: () => ({ dispose: () => undefined }),
    },
    EventEmitter: class {
      public readonly event = () => ({ dispose: () => undefined });
      public fire(): void {}
      public dispose(): void {}
    },
    Disposable: {
      from: () => ({ dispose: () => undefined }),
    },
    NotebookCellKind: {
      Markup: 1,
      Code: 2,
    },
    Uri: {
      parse: createUri,
    },
  };

  moduleCtor._load = function patchedLoad(request, parent, isMain) {
    if (request === "vscode") {
      return vscodeStub;
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  delete testRequire.cache[registryModulePath];

  try {
    const { NotebookRegistry } = testRequire("./NotebookRegistry") as typeof import("./NotebookRegistry");
    await run({ NotebookRegistry });
  } finally {
    delete testRequire.cache[registryModulePath];
    moduleCtor._load = originalLoad;
  }
}

test("getNotebookEditorState reports active cell, selection, viewport, and source selection", async () => {
  const cells = [
    createCell("cell-1", 0, "print(1)\n"),
    createCell("cell-2", 1, "value = 2\nprint(value)\n"),
    createCell("cell-3", 2, "print(3)\n"),
  ];
  const document = createNotebookDocument(cells);
  const activeEditor = {
    notebook: document,
    selections: [
      { start: 1, end: 2 },
      { start: 2, end: 3 },
    ],
    visibleRanges: [{ start: 1, end: 3 }],
  } as unknown as vscode.NotebookEditor;

  await withNotebookRegistryTestHarness(
    {
      activeNotebookEditor: activeEditor,
      visibleNotebookEditors: [activeEditor],
      activeTextEditor: {
        document: cells[1]!.document,
        selection: {
          start: { line: 1, character: 2 },
          end: { line: 1, character: 7 },
        },
      } as vscode.TextEditor,
    },
    async ({ NotebookRegistry }) => {
      const registry = new NotebookRegistry();
      registry.ensureState(document);

      const state = registry.getNotebookEditorState(document);

      assert.equal(state.notebook_uri, "file:///workspace/demo.ipynb");
      assert.equal(state.active_editor, true);
      assert.equal(state.focus_kind, "source");
      assert.equal(state.active_cell_id, "cell-2");
      assert.equal(state.active_cell_index, 1);
      assert.deepEqual(state.selected_cell_ids, ["cell-2", "cell-3"]);
      assert.deepEqual(state.selected_ranges, [
        { start: 1, end: 2 },
        { start: 2, end: 3 },
      ]);
      assert.deepEqual(state.visible_ranges, [{ start: 1, end: 3 }]);
      assert.deepEqual(state.visible_cell_ids, ["cell-2", "cell-3"]);
      assert.equal(state.top_visible_cell_id, "cell-2");
      assert.deepEqual(state.active_source_selection, {
        cell_id: "cell-2",
        start_line: 2,
        start_column: 3,
        end_line: 2,
        end_column: 8,
      });
      assert.equal(state.source_fingerprint_by_cell_id["cell-2"], "f5980e2a8872");
      assert.equal(state.source_fingerprint_by_cell_id["cell-3"], "a80ac71a28f9");
    },
  );
});
