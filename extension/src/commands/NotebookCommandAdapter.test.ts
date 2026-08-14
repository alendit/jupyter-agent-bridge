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

type CommandCall = {
  command: string;
  args: unknown[];
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
    commandCalls: CommandCall[];
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
  const commandCalls: CommandCall[] = [];
  const vscodeStub = {
    window: windowState,
    commands: {
      executeCommand: async (command: string, ...args: unknown[]) => {
        commandCalls.push({ command, args });
      },
    },
    NotebookRange: class NotebookRange {
      public constructor(
        public readonly start: number,
        public readonly end: number,
      ) {}
    },
    NotebookEditorRevealType: {
      InCenterIfOutsideViewport: 2,
    },
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
    await run({ NotebookCommandAdapter, commandCalls });
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

test("executeCells targets the notebook document without focusing, selecting, or auto-revealing cells", async () => {
  const activeDocument = createNotebookDocument("file:///workspace/active.ipynb");
  const targetDocument = createNotebookDocument("file:///workspace/target.ipynb");
  const activeEditor = createNotebookEditor(activeDocument, 1 as vscode.ViewColumn);
  const targetEditor = createNotebookEditor(targetDocument, 2 as vscode.ViewColumn) as vscode.NotebookEditor & {
    selections: vscode.NotebookRange[];
  };
  const originalSelections = [{ start: 7, end: 8 }] as vscode.NotebookRange[];
  targetEditor.selections = originalSelections;

  await withNotebookCommandAdapterTestHarness(
    {
      activeNotebookEditor: activeEditor,
      visibleNotebookEditors: [activeEditor, targetEditor],
      showNotebookDocument: async () => {
        throw new Error("visible target editor should be reused");
      },
    },
    async ({ NotebookCommandAdapter, commandCalls }) => {
      const adapter = new NotebookCommandAdapter();

      await adapter.executeCells(targetDocument, [{ start: 2, end: 4 }] as vscode.NotebookRange[]);

      assert.equal(targetEditor.selections, originalSelections);
      assert.deepEqual(commandCalls, [
        {
          command: "notebook.cell.execute",
          args: [
            {
              document: targetDocument.uri,
              ranges: [{ start: 2, end: 4 }],
              autoReveal: false,
            },
          ],
        },
      ]);
    },
  );
});

test("revealCells preserves focus and selection when selection is disabled", async () => {
  const activeDocument = createNotebookDocument("file:///workspace/active.ipynb");
  const targetDocument = createNotebookDocument("file:///workspace/target.ipynb");
  const activeEditor = createNotebookEditor(activeDocument, 1 as vscode.ViewColumn);
  const revealedRanges: Array<{ start: number; end: number }> = [];
  const targetEditor = createNotebookEditor(targetDocument, 2 as vscode.ViewColumn) as vscode.NotebookEditor & {
    selections: vscode.NotebookRange[];
  };
  const originalSelections = [{ start: 7, end: 8 }] as vscode.NotebookRange[];
  targetEditor.selections = originalSelections;
  targetEditor.revealRange = (range: vscode.NotebookRange) => {
    revealedRanges.push({ start: range.start, end: range.end });
  };

  await withNotebookCommandAdapterTestHarness(
    {
      activeNotebookEditor: activeEditor,
      visibleNotebookEditors: [activeEditor, targetEditor],
      showNotebookDocument: async () => {
        throw new Error("visible target editor should be reused");
      },
    },
    async ({ NotebookCommandAdapter }) => {
      const adapter = new NotebookCommandAdapter();

      await adapter.revealCells(targetDocument, [{ start: 2, end: 4 }] as vscode.NotebookRange[], {
        select: false,
      });

      assert.equal(targetEditor.selections, originalSelections);
      assert.deepEqual(revealedRanges, [{ start: 2, end: 4 }]);
    },
  );
});

test("setCellInputVisibility opens a hidden target without taking focus", async () => {
  const activeDocument = createNotebookDocument("file:///workspace/active.ipynb");
  const targetDocument = createNotebookDocument("file:///workspace/target.ipynb");
  const activeEditor = createNotebookEditor(activeDocument, 1 as vscode.ViewColumn);
  const targetEditor = createNotebookEditor(targetDocument, 2 as vscode.ViewColumn);
  const showOptions: Array<{ preserveFocus: boolean }> = [];

  await withNotebookCommandAdapterTestHarness(
    {
      activeNotebookEditor: activeEditor,
      visibleNotebookEditors: [activeEditor],
      showNotebookDocument: async (_document, options) => {
        showOptions.push(options);
        return targetEditor;
      },
    },
    async ({ NotebookCommandAdapter, commandCalls }) => {
      const adapter = new NotebookCommandAdapter();

      await adapter.setCellInputVisibility(
        targetDocument,
        [{ start: 2, end: 4 }] as vscode.NotebookRange[],
        "collapse",
      );

      assert.equal(showOptions[0]?.preserveFocus, true);
      assert.equal(commandCalls[0]?.command, "notebook.cell.collapseCellInput");
    },
  );
});
