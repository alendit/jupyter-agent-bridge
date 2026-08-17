import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import type * as vscode from "vscode";

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), 25);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function withNotebookKernelCommandServiceTestHarness(
  run: (
    NotebookKernelCommandService: typeof import("./NotebookKernelCommandService").NotebookKernelCommandService,
    commandCalls: Array<{ command: string; args: unknown[] }>,
    editorCommand: ReturnType<typeof createDeferred<void>>,
  ) => Promise<void>,
): Promise<void> {
  const testRequire = require as NodeRequire;
  const moduleCtor = Module as unknown as {
    _load: (request: string, parent: NodeModule | undefined, isMain: boolean) => unknown;
  };
  const serviceModulePath = testRequire.resolve("./NotebookKernelCommandService");
  const originalLoad = moduleCtor._load;
  const commandCalls: Array<{ command: string; args: unknown[] }> = [];
  const editorCommand = createDeferred<void>();
  const vscodeStub = {
    commands: {
      executeCommand: (command: string, ...args: unknown[]) => {
        commandCalls.push({ command, args });
        return editorCommand.promise;
      },
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
    const { NotebookKernelCommandService } =
      testRequire("./NotebookKernelCommandService") as typeof import("./NotebookKernelCommandService");
    await run(NotebookKernelCommandService, commandCalls, editorCommand);
  } finally {
    delete testRequire.cache[serviceModulePath];
    moduleCtor._load = originalLoad;
  }
}

function createService(
  NotebookKernelCommandService: typeof import("./NotebookKernelCommandService").NotebookKernelCommandService,
  options?: {
    refresh?: () => Promise<unknown>;
    kernelState?: "idle" | "busy";
  },
) {
  const notebookUri = "file:///workspace/demo.ipynb";
  const document = {
    uri: { toString: () => notebookUri },
    metadata: {},
  } as vscode.NotebookDocument;
  const requestedActions: Array<{
    action: string;
    options?: { requires_user_interaction?: boolean; bump_generation?: boolean };
  }> = [];
  let refreshCount = 0;
  const kernel = {
    kernel_label: "Python 3",
    kernel_id: "python3",
    language: "python",
    execution_supported: true,
    state: options?.kernelState ?? "idle",
    generation: 1,
    last_seen_at: "2026-08-17T10:00:00.000Z",
    pending_action: null,
    requires_user_interaction: false,
  } as const;
  const service = new NotebookKernelCommandService(
    {
      getDocument: () => document,
      getVersion: () => 7,
      markKernelCommandRequested: (
        _notebookUri: string,
        action: string,
        options?: { requires_user_interaction?: boolean; bump_generation?: boolean },
      ) => {
        requestedActions.push({ action, options });
      },
    } as never,
    {
      getKernelInfoValue: () => kernel,
    } as never,
    {
      ensureEditor: async () => ({ notebook: document }) as vscode.NotebookEditor,
    } as never,
    {
      refresh: () => {
        refreshCount += 1;
        return options?.refresh?.() ?? Promise.resolve(null);
      },
    } as never,
  );

  return {
    service,
    document,
    requestedActions,
    getRefreshCount: () => refreshCount,
  };
}

test("selectKernel returns a prompted result while the VS Code picker command remains pending", async () => {
  await withNotebookKernelCommandServiceTestHarness(
    async (NotebookKernelCommandService, commandCalls) => {
      const context = createService(NotebookKernelCommandService);
      const selection = context.service.selectKernel(context.document, {
        notebook_uri: "file:///workspace/demo.ipynb",
      });

      const result = await withTimeout(
        selection,
        "kernel picker API stayed blocked on the editor command",
      );

      assert.equal(result.status, "prompted");
      assert.equal(result.requires_user_interaction, true);
      assert.equal(commandCalls[0]?.command, "notebook.selectKernel");
      assert.deepEqual(context.requestedActions, [
        {
          action: "select_kernel",
          options: { requires_user_interaction: true },
        },
      ]);
      assert.equal(context.getRefreshCount(), 1);
    },
  );
});

test("selectJupyterInterpreter returns a prompted result while its picker command remains pending", async () => {
  await withNotebookKernelCommandServiceTestHarness(
    async (NotebookKernelCommandService, commandCalls) => {
      const context = createService(NotebookKernelCommandService);

      const result = await withTimeout(
        context.service.selectJupyterInterpreter(context.document),
        "interpreter picker API stayed blocked on the editor command",
      );

      assert.equal(result.status, "prompted");
      assert.equal(result.requires_user_interaction, true);
      assert.equal(commandCalls[0]?.command, "jupyter.selectJupyterInterpreter");
      assert.deepEqual(context.requestedActions, [
        {
          action: "select_interpreter",
          options: { requires_user_interaction: true },
        },
      ]);
      assert.equal(context.getRefreshCount(), 1);
    },
  );
});

test("restartKernel returns requested while the host restart command remains pending", async () => {
  await withNotebookKernelCommandServiceTestHarness(
    async (NotebookKernelCommandService, commandCalls) => {
      const context = createService(NotebookKernelCommandService);

      const result = await withTimeout(
        context.service.restartKernel(context.document),
        "restart API stayed blocked on the editor command",
      );

      assert.equal(result.status, "requested");
      assert.equal(result.requires_user_interaction, false);
      assert.equal(commandCalls[0]?.command, "jupyter.restartkernel");
      assert.deepEqual(context.requestedActions, [
        {
          action: "restart",
          options: { bump_generation: true },
        },
      ]);
      assert.equal(context.getRefreshCount(), 1);
    },
  );
});

test("interruptExecution returns requested while the host interrupt command remains pending", async () => {
  await withNotebookKernelCommandServiceTestHarness(
    async (NotebookKernelCommandService, commandCalls) => {
      const context = createService(NotebookKernelCommandService);

      const result = await withTimeout(
        context.service.interruptExecution(context.document),
        "interrupt API stayed blocked on the editor command",
      );

      assert.equal(result.status, "requested");
      assert.equal(result.requires_user_interaction, false);
      assert.equal(commandCalls[0]?.command, "jupyter.interruptkernel");
      assert.deepEqual(context.requestedActions, [
        {
          action: "interrupt",
          options: undefined,
        },
      ]);
      assert.equal(context.getRefreshCount(), 1);
    },
  );
});

test("direct selectKernel returns requested while direct host selection remains pending", async () => {
  await withNotebookKernelCommandServiceTestHarness(
    async (NotebookKernelCommandService, commandCalls) => {
      const context = createService(NotebookKernelCommandService);

      const result = await withTimeout(
        context.service.selectKernel(context.document, {
          notebook_uri: "file:///workspace/demo.ipynb",
          kernel_id: "python-env",
          extension_id: "ms-toolsai.jupyter",
        }),
        "direct kernel selection stayed blocked on the editor command",
      );

      assert.equal(result.status, "requested");
      assert.equal(result.requires_user_interaction, false);
      assert.equal(commandCalls[0]?.command, "notebook.selectKernel");
      assert.deepEqual(commandCalls[0]?.args[0], {
        editor: { notebook: context.document },
        id: "python-env",
        extension: "ms-toolsai.jupyter",
        skipIfAlreadySelected: true,
      });
      assert.deepEqual(context.requestedActions, [
        {
          action: "select_kernel",
          options: undefined,
        },
      ]);
      assert.equal(context.getRefreshCount(), 1);
    },
  );
});

test("direct selectKernel reports selected when the host command settles during dispatch", async () => {
  await withNotebookKernelCommandServiceTestHarness(
    async (NotebookKernelCommandService, _commandCalls, editorCommand) => {
      const context = createService(NotebookKernelCommandService);
      editorCommand.resolve();

      const result = await context.service.selectKernel(context.document, {
        notebook_uri: "file:///workspace/demo.ipynb",
        kernel_id: "python-env",
        extension_id: "ms-toolsai.jupyter",
      });

      assert.equal(result.status, "selected");
      assert.deepEqual(context.requestedActions, []);
      assert.equal(context.getRefreshCount(), 1);
    },
  );
});

test("kernel commands still surface immediate host command rejection", async () => {
  await withNotebookKernelCommandServiceTestHarness(
    async (NotebookKernelCommandService, _commandCalls, editorCommand) => {
      const context = createService(NotebookKernelCommandService);
      editorCommand.reject(new Error("restart command unavailable"));

      await assert.rejects(
        () => context.service.restartKernel(context.document),
        (error) =>
          error instanceof Error &&
          "code" in error &&
          error.code === "KernelUnavailable" &&
          error.message === "Failed to restart the active kernel.",
      );
      assert.deepEqual(context.requestedActions, []);
      assert.equal(context.getRefreshCount(), 0);
    },
  );
});

test("kernel request commands do not wait for a pending best-effort host refresh", async () => {
  await withNotebookKernelCommandServiceTestHarness(
    async (NotebookKernelCommandService) => {
      const refresh = createDeferred<unknown>();
      const context = createService(NotebookKernelCommandService, {
        refresh: () => refresh.promise,
      });

      const result = await withTimeout(
        context.service.restartKernel(context.document),
        "restart API stayed blocked on host observation refresh",
      );

      assert.equal(result.status, "requested");
      assert.equal(context.getRefreshCount(), 1);
    },
  );
});

test("waitForKernelReady bounds a pending host refresh by timeout_ms", async () => {
  await withNotebookKernelCommandServiceTestHarness(
    async (NotebookKernelCommandService) => {
      const refresh = createDeferred<unknown>();
      const context = createService(NotebookKernelCommandService, {
        refresh: () => refresh.promise,
      });

      const result = await withTimeout(
        context.service.waitForKernelReady(context.document, {
          notebook_uri: "file:///workspace/demo.ipynb",
          timeout_ms: 5,
        }),
        "waitForKernelReady exceeded its timeout while refreshing host state",
      );

      assert.equal(result.ready, false);
      assert.equal(result.timed_out, true);
      assert.match(result.message, /current kernel observation/i);
      assert.equal(context.getRefreshCount(), 1);
    },
  );
});

test("waitForKernelReady bounds its polling sleep by timeout_ms", async () => {
  await withNotebookKernelCommandServiceTestHarness(
    async (NotebookKernelCommandService) => {
      const context = createService(NotebookKernelCommandService, {
        kernelState: "busy",
      });

      const result = await withTimeout(
        context.service.waitForKernelReady(context.document, {
          notebook_uri: "file:///workspace/demo.ipynb",
          timeout_ms: 5,
        }),
        "waitForKernelReady exceeded its timeout during polling sleep",
      );

      assert.equal(result.ready, false);
      assert.equal(result.timed_out, true);
      assert.ok(context.getRefreshCount() >= 1);
    },
  );
});
