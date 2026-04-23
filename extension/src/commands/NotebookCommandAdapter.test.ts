import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import type * as vscode from "vscode";

type WindowState = {
  activeNotebookEditor?: vscode.NotebookEditor;
  visibleNotebookEditors: vscode.NotebookEditor[];
  showNotebookDocument: (
    document: vscode.NotebookDocument,
    options: { preserveFocus: boolean; preview: boolean; viewColumn?: vscode.ViewColumn },
  ) => Promise<vscode.NotebookEditor>;
};

function createNotebookDocument(uri: string): vscode.NotebookDocument {
  return {
    uri: {
      toString: () => uri,
    },
  } as vscode.NotebookDocument;
}

function createNotebookEditor(
  document: vscode.NotebookDocument,
  viewColumn: vscode.ViewColumn,
): vscode.NotebookEditor {
  return {
    notebook: document,
    viewColumn,
  } as vscode.NotebookEditor;
}

async function withNotebookCommandAdapterTestHarness(
  windowState: WindowState,
  run: (context: {
    NotebookCommandAdapter: typeof import("./NotebookCommandAdapter").NotebookCommandAdapter;
  }) => Promise<void>,
): Promise<void> {
  const testRequire = require as NodeRequire;
  const moduleCtor = Module as unknown as {
    _load: (
      request: string,
      parent: NodeModule | undefined,
      isMain: boolean,
    ) => unknown;
  };
  const adapterModulePath = testRequire.resolve("./NotebookCommandAdapter");
  const originalLoad = moduleCtor._load;
  const vscodeStub = {
    window: windowState,
    ViewColumn: {
      One: 1,
      Two: 2,
      Three: 3,
    },
  };

  moduleCtor._load = function patchedLoad(request, parent, isMain) {
    if (request === "vscode") {
      return vscodeStub;
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  delete testRequire.cache[adapterModulePath];

  try {
    const { NotebookCommandAdapter } =
      testRequire("./NotebookCommandAdapter") as typeof import("./NotebookCommandAdapter");
    await run({ NotebookCommandAdapter });
  } finally {
    delete testRequire.cache[adapterModulePath];
    moduleCtor._load = originalLoad;
  }
}

test("ensureEditor reuses a visible notebook editor when focus should be preserved", async () => {
  const document = createNotebookDocument("file:///workspace/demo.ipynb");
  const visibleEditor = createNotebookEditor(document, 2 as vscode.ViewColumn);
  let showNotebookDocumentCalled = false;

  await withNotebookCommandAdapterTestHarness(
    {
      activeNotebookEditor: undefined,
      visibleNotebookEditors: [visibleEditor],
      showNotebookDocument: async () => {
        showNotebookDocumentCalled = true;
        return visibleEditor;
      },
    },
    async ({ NotebookCommandAdapter }) => {
      const adapter = new NotebookCommandAdapter();

      const editor = await adapter.ensureEditor(document);

      assert.equal(editor, visibleEditor);
      assert.equal(showNotebookDocumentCalled, false);
    },
  );
});
