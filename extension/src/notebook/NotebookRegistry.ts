import * as vscode from "vscode";
import {
  NotebookKernelRuntimeState,
  createInitialKernelRuntimeState,
  markKernelCommandRequested,
  markKernelExecutionCompleted,
  markKernelExecutionStarted,
  reconcileKernelRuntimeState,
} from "@jupyter-agent-bridge/notebook-domain";
import { KernelPendingAction, NotebookCellRange, NotebookEditorState } from "../../../packages/protocol/src";
import { computeSourceFingerprint, getStoredCellId } from "./cells";
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

  public getActiveNotebookDocument(): vscode.NotebookDocument | undefined {
    return vscode.window.activeNotebookEditor?.notebook;
  }

  public getNotebookEditorState(document: vscode.NotebookDocument): NotebookEditorState {
    const documentUri = this.normalizeUri(document.uri);
    const activeEditor = vscode.window.activeNotebookEditor;
    const activeNotebookUri = activeEditor ? this.normalizeUri(activeEditor.notebook.uri) : undefined;
    const editor =
      activeNotebookUri === documentUri
        ? activeEditor
        : vscode.window.visibleNotebookEditors.find(
            (candidate) => this.normalizeUri(candidate.notebook.uri) === documentUri,
          );
    const activeEditorMatches = activeNotebookUri === documentUri;
    const selectedRanges = editor?.selections.map(toProtocolRange) ?? [];
    const visibleRanges = editor?.visibleRanges.map(toProtocolRange) ?? [];
    const selectedCellIds = collectCellIdsForRanges(document, selectedRanges);
    const visibleCellIds = collectCellIdsForRanges(document, visibleRanges);
    const activeCellIndex = activeEditorMatches ? editor?.selections[0]?.start : undefined;
    const activeCell =
      activeCellIndex === undefined || activeCellIndex < 0 || activeCellIndex >= document.cellCount
        ? undefined
        : document.cellAt(activeCellIndex);
    const activeCellId = activeCell ? getStoredCellId(activeCell) ?? undefined : undefined;
    const activeSourceSelection = activeEditorMatches ? this.getActiveSourceSelection(document) : undefined;
    const fingerprintCellIds = new Set(selectedCellIds);
    if (activeCellId) {
      fingerprintCellIds.add(activeCellId);
    }

    return {
      notebook_uri: documentUri,
      notebook_version: this.getVersion(documentUri),
      active_notebook_uri: activeNotebookUri,
      active_editor: activeEditorMatches,
      visible_editor_count: this.getVisibleEditorCount(document),
      focus_kind: activeEditorMatches ? (activeSourceSelection ? "source" : "cell") : "unknown",
      active_cell_id: activeCellId,
      active_cell_index: activeCellIndex,
      selected_cell_ids: selectedCellIds,
      selected_ranges: selectedRanges,
      visible_cell_ids: visibleCellIds,
      visible_ranges: visibleRanges,
      top_visible_cell_id: visibleCellIds[0],
      active_source_selection: activeSourceSelection,
      source_fingerprint_by_cell_id: this.buildSourceFingerprints(document, fingerprintCellIds),
    };
  }

  private getActiveSourceSelection(document: vscode.NotebookDocument): NotebookEditorState["active_source_selection"] {
    const activeTextEditor = vscode.window.activeTextEditor;
    if (!activeTextEditor) {
      return undefined;
    }

    for (const cell of document.getCells()) {
      if (this.normalizeUri(cell.document.uri) !== this.normalizeUri(activeTextEditor.document.uri)) {
        continue;
      }

      const cellId = getStoredCellId(cell);
      if (!cellId) {
        return undefined;
      }

      return {
        cell_id: cellId,
        start_line: activeTextEditor.selection.start.line + 1,
        start_column: activeTextEditor.selection.start.character + 1,
        end_line: activeTextEditor.selection.end.line + 1,
        end_column: activeTextEditor.selection.end.character + 1,
      };
    }

    return undefined;
  }

  private buildSourceFingerprints(
    document: vscode.NotebookDocument,
    cellIds: ReadonlySet<string>,
  ): Record<string, string> {
    const fingerprints: Record<string, string> = {};
    for (const cell of document.getCells()) {
      const cellId = getStoredCellId(cell);
      if (cellId && cellIds.has(cellId)) {
        fingerprints[cellId] = computeSourceFingerprint(cell.document.getText());
      }
    }
    return fingerprints;
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

function toProtocolRange(range: vscode.NotebookRange): NotebookCellRange {
  return { start: range.start, end: range.end };
}

function collectCellIdsForRanges(
  document: vscode.NotebookDocument,
  ranges: readonly NotebookCellRange[],
): string[] {
  const cellIds: string[] = [];
  const seen = new Set<string>();
  for (const range of ranges) {
    const start = Math.max(0, range.start);
    const end = Math.min(document.cellCount, range.end);
    for (let index = start; index < end; index += 1) {
      const cellId = getStoredCellId(document.cellAt(index));
      if (cellId && !seen.has(cellId)) {
        seen.add(cellId);
        cellIds.push(cellId);
      }
    }
  }
  return cellIds;
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
