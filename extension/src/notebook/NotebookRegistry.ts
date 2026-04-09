import * as vscode from "vscode";

interface NotebookState {
  document: vscode.NotebookDocument;
  version: number;
  queue: Promise<unknown>;
  lastExecutedCellIds: string[];
}

interface NotebookChangeEvent {
  notebook_uri: string;
  version: number;
  event: vscode.NotebookDocumentChangeEvent;
}

export class NotebookRegistry implements vscode.Disposable {
  private readonly states = new Map<string, NotebookState>();
  private readonly disposables: vscode.Disposable[] = [];
  private readonly changeEmitter = new vscode.EventEmitter<NotebookChangeEvent>();

  public readonly onDidChangeNotebook = this.changeEmitter.event;

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
        this.changeEmitter.fire({
          notebook_uri: this.normalizeUri(event.notebook.uri),
          version: state.version,
          event,
        });
      }),
    );
  }

  public dispose(): void {
    vscode.Disposable.from(this.changeEmitter, ...this.disposables).dispose();
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
      return existing;
    }

    const created: NotebookState = {
      document,
      version: 0,
      queue: Promise.resolve(),
      lastExecutedCellIds: [],
    };
    this.states.set(notebookUri, created);
    return created;
  }

  public async runExclusive<T>(notebookUri: string, operation: () => Promise<T>): Promise<T> {
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

  public setLastExecuted(notebookUri: string, cellIds: string[]): void {
    const state = this.states.get(this.normalizeUri(notebookUri));
    if (state) {
      state.lastExecutedCellIds = [...cellIds];
    }
  }

  public getLastExecuted(notebookUri: string): string[] {
    return this.states.get(this.normalizeUri(notebookUri))?.lastExecutedCellIds ?? [];
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
}

