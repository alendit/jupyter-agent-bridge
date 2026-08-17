import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import type * as vscode from "vscode";

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function withNotebookExecutionServiceTestHarness(
  run: (
    NotebookExecutionService: typeof import("./NotebookExecutionService").NotebookExecutionService,
  ) => Promise<void>,
): Promise<void> {
  const testRequire = require as NodeRequire;
  const moduleCtor = Module as unknown as {
    _load: (request: string, parent: NodeModule | undefined, isMain: boolean) => unknown;
  };
  const serviceModulePath = testRequire.resolve("./NotebookExecutionService");
  const originalLoad = moduleCtor._load;
  const vscodeStub = {
    NotebookCellKind: {
      Markup: 1,
      Code: 2,
    },
    NotebookRange: class NotebookRange {
      public constructor(
        public readonly start: number,
        public readonly end: number,
      ) {}
    },
  };

  moduleCtor._load = function patchedLoad(request, parent, isMain) {
    if (request === "vscode") {
      return vscodeStub;
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  delete testRequire.cache[serviceModulePath];

  try {
    const { NotebookExecutionService } =
      testRequire("./NotebookExecutionService") as typeof import("./NotebookExecutionService");
    await run(NotebookExecutionService);
  } finally {
    delete testRequire.cache[serviceModulePath];
    moduleCtor._load = originalLoad;
  }
}

test("executeCells completes from an observed cell failure even while the editor command remains pending", async () => {
  await withNotebookExecutionServiceTestHarness(async (NotebookExecutionService) => {
    const notebookUri = "file:///workspace/demo.ipynb";
    const editorCommand = createDeferred<void>();
    let executionSummary: vscode.NotebookCellExecutionSummary | undefined;
    let notebookChangeListener: ((event: { notebook_uri: string }) => void) | undefined;
    let kernelExecutionCompleted = 0;
    const outputs: vscode.NotebookCellOutput[] = [];
    const cell = {
      index: 0,
      kind: 2,
      metadata: {
        jupyterAgentBridge: {
          cellId: "cell-1",
        },
      },
      outputs,
      get executionSummary() {
        return executionSummary;
      },
    } as unknown as vscode.NotebookCell;
    const document = {
      uri: { toString: () => notebookUri },
      getCells: () => [cell],
    } as vscode.NotebookDocument;
    const registry = {
      getDocument: () => document,
      getVersion: () => 7,
      markKernelExecutionStarted: () => undefined,
      markKernelExecutionCompleted: () => {
        kernelExecutionCompleted += 1;
      },
      onDidChangeNotebook: (listener: (event: { notebook_uri: string }) => void) => {
        notebookChangeListener = listener;
        return {
          dispose: () => {
            notebookChangeListener = undefined;
          },
        };
      },
    };
    const readService = {
      assertExpectedCellSources: () => undefined,
      requireCell: () => cell,
      toExecutionSummary: () =>
        executionSummary?.success === false
          ? {
              status: "failed" as const,
              execution_order: executionSummary.executionOrder ?? null,
              started_at: null,
              ended_at: "2026-08-17T10:00:01.000Z",
            }
          : null,
      normalizeCellOutputs: () => [],
      getKernelInfoValue: () => null,
    };
    const commandAdapter = {
      executeCells: () => editorCommand.promise,
    };
    const service = new NotebookExecutionService(
      registry as never,
      readService as never,
      commandAdapter as never,
    );

    let settled = false;
    const execution = service.executeCells(document, {
      notebook_uri: notebookUri,
      cell_ids: ["cell-1"],
    }).then((result) => {
      settled = true;
      return result;
    });
    await Promise.resolve();
    assert.ok(notebookChangeListener);

    outputs.push({
      items: [
        {
          mime: "text/plain",
          data: new Uint8Array([1]),
        },
      ],
    } as vscode.NotebookCellOutput);
    notebookChangeListener?.({ notebook_uri: notebookUri });
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(settled, false);

    executionSummary = {
      success: false,
      executionOrder: 3,
      timing: {
        startTime: Date.parse("2026-08-17T10:00:00.000Z"),
        endTime: Date.parse("2026-08-17T10:00:01.000Z"),
      },
    };
    notebookChangeListener?.({ notebook_uri: notebookUri });

    const result = await Promise.race([
      execution,
      new Promise<never>((_resolve, reject) => {
        setTimeout(() => reject(new Error("execution stayed blocked on the editor command")), 25);
      }),
    ]);

    assert.equal(result.results[0]?.execution?.status, "failed");
    assert.equal(kernelExecutionCompleted, 1);
  });
});
