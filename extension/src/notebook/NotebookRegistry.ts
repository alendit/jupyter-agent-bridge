import * as vscode from "vscode";
import {
  NotebookKernelRuntimeState,
  createInitialKernelRuntimeState,
  markKernelCommandRequested,
  markKernelExecutionCompleted,
  markKernelExecutionStarted,
  reconcileKernelRuntimeState,
} from "@jupyter-agent-bridge/notebook-domain";
import { KernelPendingAction } from "../../../packages/protocol/src";
import { parseNotebookKernelMetadata } from "./kernelMetadata";
import { isExecutionSummaryRunning } from "./executionSummary";

interface NotebookState {
  document: vscode.NotebookDocument;
  version: number;
  queue: Promise<unknown>;
  kernelRuntime: NotebookKernelRuntimeState;
}

interface NotebookChangeEvent {
  notebook_uri: string;
  version: number;
  event: vscode.NotebookDocumentChangeEvent;
}

interface KernelStateChangeEvent {
  notebook_uri: string;
  version: number;
}

export class NotebookRegistry implements vscode.Disposable {
  private readonly states = new Map<string, NotebookState>();
  private readonly disposables: vscode.Disposable[] = [];
  private readonly changeEmitter = new vscode.EventEmitter<NotebookChangeEvent>();
  private readonly kernelStateEmitter = new vscode.EventEmitter<KernelStateChangeEvent>();

  public readonly onDidChangeNotebook = this.changeEmitter.event;
  public readonly onDidChangeKernelState = this.kernelStateEmitter.event;

  public constructor() {
    for (const document of vscode.workspace.notebookDocuments) {
      this.ensureState(document);
    }

    this.disposables.push(
      vscode.workspace.onDidOpenNotebookDocument((document) => {
        this.ensureState(document);
      }),
      vscode.workspace.onDidCloseNotebookDocument((document) => {
        this.states.delete(this.normalizeUri(document.uri));
      }),
      vscode.workspace.onDidChangeNotebookDocument((event) => {
        const state = this.ensureState(event.notebook);
        state.document = event.notebook;
        state.version += 1;
        const nextKernelRuntime = reconcileKernelRuntimeState(
          state.kernelRuntime,
          parseNotebookKernelMetadata(event.notebook),
          {
            observed_execution_state: this.detectObservedExecutionState(event),
          },
        );
        const kernelChanged = !kernelRuntimeEquals(state.kernelRuntime, nextKernelRuntime);
        state.kernelRuntime = nextKernelRuntime;
        this.changeEmitter.fire({
          notebook_uri: this.normalizeUri(event.notebook.uri),
          version: state.version,
          event,
        });
        if (kernelChanged) {
          this.kernelStateEmitter.fire({
            notebook_uri: this.normalizeUri(event.notebook.uri),
            version: state.version,
          });
        }
      }),
    );
  }

  public dispose(): void {
    vscode.Disposable.from(this.changeEmitter, this.kernelStateEmitter, ...this.disposables).dispose();
  }

  public normalizeUri(uri: vscode.Uri | string): string {
    return (typeof uri === "string" ? vscode.Uri.parse(uri) : uri).toString();
  }

  public listDocuments(): vscode.NotebookDocument[] {
    return [...this.states.values()].map((state) => state.document);
  }

  public getDocument(notebookUri: string): vscode.NotebookDocument | undefined {
    return this.states.get(this.normalizeUri(notebookUri))?.document;
  }

  public getVersion(notebookUri: string): number {
    return this.states.get(this.normalizeUri(notebookUri))?.version ?? 0;
  }

  public ensureState(document: vscode.NotebookDocument): NotebookState {
    const notebookUri = this.normalizeUri(document.uri);
    const existing = this.states.get(notebookUri);
    if (existing) {
      existing.document = document;
      existing.kernelRuntime = reconcileKernelRuntimeState(
        existing.kernelRuntime,
        parseNotebookKernelMetadata(document),
      );
      return existing;
    }

    const created: NotebookState = {
      document,
      version: 0,
      queue: Promise.resolve(),
      kernelRuntime: createInitialKernelRuntimeState(parseNotebookKernelMetadata(document)),
    };
    this.states.set(notebookUri, created);
    return created;
  }

  public async runExclusive<T>(notebookUri: string, operation: () => Promise<T>): Promise<T> {
    return this.enqueueExclusive(notebookUri, operation);
  }

  public async enqueueExclusive<T>(notebookUri: string, operation: () => Promise<T>): Promise<T> {
    const state = this.states.get(this.normalizeUri(notebookUri));
    if (!state) {
      throw new Error(`Notebook is not registered: ${notebookUri}`);
    }

    const previous = state.queue.catch(() => undefined);
    const current = previous.then(operation);
    state.queue = current.then(
      () => undefined,
      () => undefined,
    );
    return current;
  }

  public getKernelRuntimeState(notebookUri: string): NotebookKernelRuntimeState | undefined {
    return this.states.get(this.normalizeUri(notebookUri))?.kernelRuntime;
  }

  public markKernelExecutionStarted(notebookUri: string): void {
    const state = this.states.get(this.normalizeUri(notebookUri));
    if (state) {
      state.kernelRuntime = markKernelExecutionStarted(state.kernelRuntime);
      this.kernelStateEmitter.fire({
        notebook_uri: this.normalizeUri(notebookUri),
        version: state.version,
      });
    }
  }

  public markKernelExecutionCompleted(notebookUri: string): void {
    const state = this.states.get(this.normalizeUri(notebookUri));
    if (state) {
      state.kernelRuntime = markKernelExecutionCompleted(state.kernelRuntime);
      this.kernelStateEmitter.fire({
        notebook_uri: this.normalizeUri(notebookUri),
        version: state.version,
      });
    }
  }

  public markKernelCommandRequested(
    notebookUri: string,
    action: Exclude<KernelPendingAction, null>,
    options?: {
      requires_user_interaction?: boolean;
      bump_generation?: boolean;
    },
  ): void {
    const state = this.states.get(this.normalizeUri(notebookUri));
    if (state) {
      state.kernelRuntime = markKernelCommandRequested(state.kernelRuntime, action, {
        requires_user_interaction: options?.requires_user_interaction,
        bump_generation: options?.bump_generation,
      });
      this.kernelStateEmitter.fire({
        notebook_uri: this.normalizeUri(notebookUri),
        version: state.version,
      });
    }
  }

  public getVisibleEditorCount(document: vscode.NotebookDocument): number {
    const notebookUri = this.normalizeUri(document.uri);
    return vscode.window.visibleNotebookEditors.filter(
      (editor) => this.normalizeUri(editor.notebook.uri) === notebookUri,
    ).length;
  }

  public isActiveEditor(document: vscode.NotebookDocument): boolean {
    const active = vscode.window.activeNotebookEditor;
    return active !== undefined && this.normalizeUri(active.notebook.uri) === this.normalizeUri(document.uri);
  }

  public getActiveCellIndex(document: vscode.NotebookDocument): number | undefined {
    const active = vscode.window.activeNotebookEditor;
    if (!active) {
      return undefined;
    }

    if (this.normalizeUri(active.notebook.uri) !== this.normalizeUri(document.uri)) {
      return undefined;
    }

    return active.selections[0]?.start;
  }

  private detectObservedExecutionState(
    event: vscode.NotebookDocumentChangeEvent,
  ): "busy" | "idle" | null {
    if (!event.cellChanges.some((change) => change.executionSummary !== undefined)) {
      return null;
    }

    const hasRunningCell = event.notebook.getCells().some((cell) => executionSummaryIsRunning(cell.executionSummary));
    return hasRunningCell ? "busy" : "idle";
  }
}

function executionSummaryIsRunning(
  summary: vscode.NotebookCellExecutionSummary | undefined,
): boolean {
  return isExecutionSummaryRunning(summary);
}

function kernelRuntimeEquals(
  left: NotebookKernelRuntimeState,
  right: NotebookKernelRuntimeState,
): boolean {
  return (
    left.generation === right.generation &&
    left.state === right.state &&
    left.pending_action === right.pending_action &&
    left.requires_user_interaction === right.requires_user_interaction &&
    left.last_seen_at_ms === right.last_seen_at_ms &&
    left.kernel_signature === right.kernel_signature
  );
}
