import {
  App,
  PostMessageTransport,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
} from "@modelcontextprotocol/ext-apps";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type {
  BridgeSessionSummary,
  CellEditReviewViewPayload,
  CellOutputPreviewViewPayload,
  ExecutionMonitorViewPayload,
  NotebookAppViewPayload,
  NotebookTriageViewPayload,
  SessionChooserViewPayload,
} from "../src/apps/AppTypes";
import type { PreviewCellEditRequest } from "../../packages/protocol/src";

const app = new App({ name: "Jupyter Agentic Bridge UI", version: "0.1.0" });
const root = mustGetRoot();
let currentView: NotebookAppViewPayload | null = null;
let pollTimer: number | null = null;
let banner: { kind: "info" | "error"; message: string } | null = null;

app.ontoolresult = (result) => {
  const payload = result.structuredContent as NotebookAppViewPayload | undefined;
  if (payload) {
    currentView = payload;
    banner = null;
    schedulePolling();
    render();
  }
};

app.onhostcontextchanged = (ctx) => {
  if (ctx.theme) {
    applyDocumentTheme(ctx.theme);
  }
  if (ctx.styles?.variables) {
    applyHostStyleVariables(ctx.styles.variables);
  }
  if (ctx.styles?.css?.fonts) {
    applyHostFonts(ctx.styles.css.fonts);
  }
};

void app.connect(new PostMessageTransport()).then(render);

function render(): void {
  if (!currentView) {
    root.innerHTML = `<div class="panel"><h1>Notebook Console</h1><p>Waiting for tool payload.</p></div>`;
    return;
  }

  const bannerHtml = banner
    ? `<div class="banner ${banner.kind}">${escapeHtml(banner.message)}</div>`
    : "";

  switch (currentView.view) {
    case "session_chooser":
      renderSessionChooser(currentView, bannerHtml);
      return;
    case "cell_edit_review":
      renderCellEditReview(currentView, bannerHtml);
      return;
    case "execution_monitor":
      renderExecutionMonitor(currentView, bannerHtml);
      return;
    case "notebook_triage":
      renderNotebookTriage(currentView, bannerHtml);
      return;
    case "cell_output_preview":
      renderCellOutputPreview(currentView, bannerHtml);
      return;
  }
}

function renderSessionChooser(view: SessionChooserViewPayload, bannerHtml: string): void {
  root.innerHTML = `
    <div class="panel">
      <h1>Bridge Sessions</h1>
      ${bannerHtml}
      <p class="muted">Choose which VS Code window this MCP server should talk to.</p>
      <div class="actions">
        <button data-action="refresh-sessions">Refresh</button>
        <button data-action="clear-session">Clear Pin</button>
      </div>
      <div class="list">
        ${view.sessions
          .map(
            (session) => `
              <button class="list-item" data-action="pin-session" data-session-id="${escapeAttribute(session.session_id)}">
                <strong>${escapeHtml(session.window_title)}</strong>
                <span>${escapeHtml(compactWorkspace(session.workspace_folders))}</span>
                <code>${escapeHtml(session.session_id)}</code>
                ${view.pinned_session_id === session.session_id ? '<span class="pill">Pinned</span>' : ""}
              </button>`,
          )
          .join("")}
      </div>
    </div>
  `;

  bindAction("refresh-sessions", async () => {
    const result = await app.callServerTool({ name: "open_bridge_session_chooser", arguments: {} });
    hydrateFromToolResult(result);
  });
  bindAction("clear-session", async () => {
    await app.callServerTool({ name: "select_bridge_session", arguments: { session_id: null } });
    const result = await app.callServerTool({ name: "open_bridge_session_chooser", arguments: {} });
    hydrateFromToolResult(result);
  });
  bindAction("pin-session", async (element) => {
    const sessionId = element.getAttribute("data-session-id");
    if (!sessionId) {
      return;
    }

    await app.callServerTool({ name: "select_bridge_session", arguments: { session_id: sessionId } });
    const result = await app.callServerTool({ name: "open_bridge_session_chooser", arguments: {} });
    hydrateFromToolResult(result);
  });
}

function renderCellEditReview(view: CellEditReviewViewPayload, bannerHtml: string): void {
  root.innerHTML = `
    <div class="panel">
      <h1>Change Review</h1>
      ${bannerHtml}
      <p class="muted"><code>${escapeHtml(view.preview.cell_id)}</code> in <code>${escapeHtml(view.preview.notebook_uri)}</code></p>
      <div class="actions">
        <button data-action="refresh-preview">Refresh Preview</button>
        <button data-action="reveal-cell">Reveal In Notebook</button>
        <button class="primary" data-action="apply-change">Apply Change</button>
      </div>
      <div class="grid two">
        <section>
          <h2>Current</h2>
          <pre>${escapeHtml(view.preview.current_source)}</pre>
        </section>
        <section>
          <h2>Proposed</h2>
          <pre>${escapeHtml(view.preview.proposed_source)}</pre>
        </section>
      </div>
      <section>
        <h2>Unified Diff</h2>
        <pre>${escapeHtml(view.preview.diff_unified)}</pre>
      </section>
    </div>
  `;

  bindAction("refresh-preview", async () => {
    const result = await app.callServerTool({ name: "preview_cell_edit", arguments: view.request });
    if (result.isError) {
      showErrorFromResult(result);
      return;
    }

    view.preview = result.structuredContent as CellEditReviewViewPayload["preview"];
    banner = { kind: "info", message: "Preview refreshed." };
    render();
  });
  bindAction("reveal-cell", async () => {
    await app.callServerTool({
      name: "reveal_notebook_cells",
      arguments: {
        notebook_uri: view.preview.notebook_uri,
        cell_ids: [view.preview.cell_id],
        select: true,
      },
    });
    banner = { kind: "info", message: "Cell revealed in the notebook." };
    render();
  });
  bindAction("apply-change", async () => {
    const toolName =
      view.request.operation === "replace_cell_source" ? "replace_cell_source" : "patch_cell_source";
    const result = await app.callServerTool({
      name: toolName,
      arguments: view.request,
    });
    if (result.isError) {
      showErrorFromResult(result);
      return;
    }

    const updatedRequest = updateRequestFingerprint(view.request, view.preview.after_source_fingerprint);
    const refreshed = await app.callServerTool({ name: "preview_cell_edit", arguments: updatedRequest });
    if (!refreshed.isError && refreshed.structuredContent) {
      view.request = updatedRequest;
      view.preview = refreshed.structuredContent as CellEditReviewViewPayload["preview"];
    }
    banner = { kind: "info", message: "Change applied." };
    render();
  });
}

function renderExecutionMonitor(view: ExecutionMonitorViewPayload, bannerHtml: string): void {
  root.innerHTML = `
    <div class="panel">
      <h1>Execution Monitor</h1>
      ${bannerHtml}
      <p class="muted"><code>${escapeHtml(view.execution.execution_id)}</code> • ${escapeHtml(view.execution.status)}</p>
      <div class="actions">
        <button data-action="refresh-execution">Refresh</button>
        <button data-action="interrupt-execution">Interrupt</button>
        <button data-action="retry-execution">Retry</button>
        <button data-action="reveal-output">Reveal Output</button>
        <button data-action="wait-kernel-ready">Wait For Kernel Ready</button>
      </div>
      <section>
        <h2>Status</h2>
        <pre>${escapeHtml(JSON.stringify(view.execution, null, 2))}</pre>
      </section>
    </div>
  `;

  bindAction("refresh-execution", async () => {
    await refreshExecutionMonitor(view);
  });
  bindAction("interrupt-execution", async () => {
    await app.callServerTool({
      name: "interrupt_execution",
      arguments: { notebook_uri: view.execution.notebook_uri },
    });
    banner = { kind: "info", message: "Interrupt requested." };
    await refreshExecutionMonitor(view);
  });
  bindAction("retry-execution", async () => {
    const cellList = await app.callServerTool({
      name: "list_notebook_cells",
      arguments: {
        notebook_uri: view.execution.notebook_uri,
        cell_ids: view.execution.cell_ids,
      },
    });
    if (cellList.isError || !cellList.structuredContent) {
      showErrorFromResult(cellList);
      return;
    }

    const fingerprints = Object.fromEntries(
      ((cellList.structuredContent as { cells: Array<{ cell_id: string; source_fingerprint: string }> }).cells ?? []).map((cell) => [
        cell.cell_id,
        cell.source_fingerprint,
      ]),
    );
    const rerun = await app.callServerTool({
      name: "execute_cells_async",
      arguments: {
        notebook_uri: view.execution.notebook_uri,
        cell_ids: view.execution.cell_ids,
        expected_cell_source_fingerprint_by_id: fingerprints,
      },
    });
    if (rerun.isError || !rerun.structuredContent) {
      showErrorFromResult(rerun);
      return;
    }

    const openResult = await app.callServerTool({
      name: "open_execution_monitor",
      arguments: { execution_id: (rerun.structuredContent as { execution_id: string }).execution_id },
    });
    hydrateFromToolResult(openResult);
  });
  bindAction("reveal-output", async () => {
    await app.callServerTool({
      name: "reveal_notebook_cells",
      arguments: {
        notebook_uri: view.execution.notebook_uri,
        cell_ids: view.execution.cell_ids,
        focus_target: "output",
      },
    });
    banner = { kind: "info", message: "Execution cells revealed in the notebook." };
    render();
  });
  bindAction("wait-kernel-ready", async () => {
    const result = await app.callServerTool({
      name: "wait_for_kernel_ready",
      arguments: { notebook_uri: view.execution.notebook_uri, timeout_ms: 30000 },
    });
    banner = {
      kind: "info",
      message: result.isError
        ? "Kernel readiness check failed."
        : String((result.structuredContent as { message?: string })?.message ?? "Kernel readiness checked."),
    };
    render();
  });
}

function renderNotebookTriage(view: NotebookTriageViewPayload, bannerHtml: string): void {
  const diagnostics = view.diagnostics.diagnostics;
  const searchMatches = view.search?.matches ?? [];
  const symbols = view.symbols?.symbols ?? [];

  root.innerHTML = `
    <div class="panel">
      <h1>Notebook Triage</h1>
      ${bannerHtml}
      <p class="muted"><code>${escapeHtml(view.notebook_uri)}</code></p>
      <div class="actions">
        <button data-action="refresh-triage">Refresh</button>
      </div>
      <div class="stats">
        <div class="stat"><span>Errors</span><strong>${diagnostics.filter((item) => item.severity === "error").length}</strong></div>
        <div class="stat"><span>Diagnostics</span><strong>${diagnostics.length}</strong></div>
        <div class="stat"><span>Matches</span><strong>${searchMatches.length}</strong></div>
        <div class="stat"><span>Symbols</span><strong>${symbols.length}</strong></div>
      </div>
      <section>
        <h2>Diagnostics</h2>
        ${diagnostics
          .map(
            (item) => `
              <button class="list-item" data-action="triage-reveal" data-cell-id="${escapeAttribute(item.cell_id)}">
                <strong>${escapeHtml(item.severity.toUpperCase())}</strong>
                <span>${escapeHtml(item.message)}</span>
                <code>${escapeHtml(item.cell_id)}</code>
              </button>`,
          )
          .join("") || '<p class="muted">No diagnostics.</p>'}
      </section>
      <section>
        <h2>Search Matches</h2>
        ${searchMatches
          .map(
            (item) => `
              <button class="list-item" data-action="triage-reveal" data-cell-id="${escapeAttribute(item.cell_id)}">
                <strong>${escapeHtml(item.match_text)}</strong>
                <span>${escapeHtml(item.line_text)}</span>
                <code>${escapeHtml(item.cell_id)}</code>
              </button>`,
          )
          .join("") || '<p class="muted">No search matches.</p>'}
      </section>
      <section>
        <h2>Symbols</h2>
        ${symbols
          .map(
            (item) => `
              <button class="list-item" data-action="triage-symbol" data-cell-id="${escapeAttribute(item.cell_id)}" data-line="${item.selection_start_line}" data-column="${item.selection_start_column}">
                <strong>${escapeHtml(item.name)}</strong>
                <span>${escapeHtml(item.kind)}</span>
                <code>${escapeHtml(item.cell_id)}</code>
              </button>`,
          )
          .join("") || '<p class="muted">No symbols.</p>'}
      </section>
    </div>
  `;

  bindAction("refresh-triage", async () => {
    const result = await app.callServerTool({
      name: "open_notebook_triage",
      arguments: {
        notebook_uri: view.notebook_uri,
        query: view.query,
      },
    });
    hydrateFromToolResult(result);
  });
  bindAction("triage-reveal", async (element) => {
    const cellId = element.getAttribute("data-cell-id");
    if (!cellId) {
      return;
    }

    await app.callServerTool({
      name: "reveal_notebook_cells",
      arguments: {
        notebook_uri: view.notebook_uri,
        cell_ids: [cellId],
        select: true,
      },
    });
    banner = { kind: "info", message: `Revealed ${cellId} in the notebook.` };
    render();
  });
  bindAction("triage-symbol", async (element) => {
    const cellId = element.getAttribute("data-cell-id");
    const line = Number(element.getAttribute("data-line") ?? "0");
    const column = Number(element.getAttribute("data-column") ?? "0");
    const symbol = symbols.find((item) => item.cell_id === cellId && item.selection_start_line === line);
    if (!cellId || !symbol) {
      return;
    }

    const result = await app.callServerTool({
      name: "go_to_definition",
      arguments: {
        notebook_uri: view.notebook_uri,
        cell_id: cellId,
        line,
        column,
        expected_cell_source_fingerprint: symbol.source_fingerprint,
      },
    });
    if (result.isError) {
      showErrorFromResult(result);
      return;
    }
    banner = { kind: "info", message: "Definition lookup completed. See tool result in chat if needed." };
    render();
  });
}

function renderCellOutputPreview(view: CellOutputPreviewViewPayload, bannerHtml: string): void {
  const outputs = view.output_index === undefined ? view.result.outputs : [view.result.outputs[view.output_index]].filter(Boolean);
  root.innerHTML = `
    <div class="panel">
      <h1>Cell Output Preview</h1>
      ${bannerHtml}
      <p class="muted"><code>${escapeHtml(view.cell_id)}</code> in <code>${escapeHtml(view.notebook_uri)}</code></p>
      <div class="actions">
        <button data-action="reveal-output">Reveal In Notebook</button>
        <button data-action="export-output">Export Snapshot</button>
      </div>
      ${outputs.map(renderOutputCard).join("") || '<p class="muted">No outputs.</p>'}
    </div>
  `;

  bindAction("reveal-output", async () => {
    await app.callServerTool({
      name: "reveal_notebook_cells",
      arguments: {
        notebook_uri: view.notebook_uri,
        cell_ids: [view.cell_id],
        focus_target: "output",
      },
    });
    banner = { kind: "info", message: "Output revealed in the live notebook." };
    render();
  });
  bindAction("export-output", async () => {
    const result = await app.callServerTool({
      name: "export_cell_output_snapshot",
      arguments: {
        notebook_uri: view.notebook_uri,
        cell_id: view.cell_id,
        output_index: view.output_index,
      },
    });
    if (result.isError) {
      showErrorFromResult(result);
      return;
    }
    const outputFilePath = String((result.structuredContent as { output_file_path: string }).output_file_path);
    banner = { kind: "info", message: `Snapshot exported to ${outputFilePath}.` };
    render();
  });
}

function renderOutputCard(output: Record<string, unknown>): string {
  const kind = String(output.kind ?? "unknown");
  if (kind === "image" && typeof output.base64 === "string" && typeof output.mime === "string") {
    return `
      <section>
        <h2>${escapeHtml(kind)}</h2>
        <img alt="Notebook output image" src="data:${escapeAttribute(output.mime)};base64,${escapeAttribute(output.base64)}" />
      </section>
    `;
  }

  if (kind === "html") {
    return `
      <section>
        <h2>${escapeHtml(kind)}</h2>
        <p class="muted">Rich HTML output is available in the live notebook. Preview is text-only here.</p>
        <pre>${escapeHtml(String(output.summary ?? output.mime ?? "HTML output"))}</pre>
      </section>
    `;
  }

  const text =
    typeof output.text === "string"
      ? output.text
      : output.traceback
        ? (output.traceback as string[]).join("\n")
        : typeof output.summary === "string"
          ? output.summary
          : JSON.stringify(output.json ?? output, null, 2);
  return `
    <section>
      <h2>${escapeHtml(kind)}</h2>
      <pre>${escapeHtml(text)}</pre>
    </section>
  `;
}

async function refreshExecutionMonitor(view: ExecutionMonitorViewPayload): Promise<void> {
  const result = await app.callServerTool({
    name: "get_execution_status",
    arguments: { execution_id: view.execution.execution_id },
  });
  if (result.isError) {
    showErrorFromResult(result);
    return;
  }

  view.execution = result.structuredContent as ExecutionMonitorViewPayload["execution"];
  banner = { kind: "info", message: "Execution status refreshed." };
  schedulePolling();
  render();
}

function schedulePolling(): void {
  if (pollTimer !== null) {
    window.clearTimeout(pollTimer);
    pollTimer = null;
  }

  if (!currentView || currentView.view !== "execution_monitor") {
    return;
  }

  if (currentView.execution.status !== "queued" && currentView.execution.status !== "running") {
    return;
  }

  pollTimer = window.setTimeout(() => {
    void refreshExecutionMonitor(currentView as ExecutionMonitorViewPayload);
  }, 1000);
}

function updateRequestFingerprint(request: PreviewCellEditRequest, fingerprint: string): PreviewCellEditRequest {
  return {
    ...request,
    expected_cell_source_fingerprint: fingerprint,
  };
}

function hydrateFromToolResult(result: CallToolResult): void {
  if (result.isError) {
    showErrorFromResult(result);
    return;
  }

  const payload = result.structuredContent as NotebookAppViewPayload | undefined;
  if (payload) {
    currentView = payload;
    banner = null;
    schedulePolling();
    render();
  }
}

function showErrorFromResult(result: CallToolResult): void {
  const message = result.content
    .map((item) => ("text" in item ? String(item.text) : ""))
    .filter((value) => value.length > 0)
    .join("\n");
  banner = { kind: "error", message: message || "Tool call failed." };
  render();
}

function bindAction(action: string, handler: (element: HTMLElement) => void | Promise<void>): void {
  root.querySelectorAll<HTMLElement>(`[data-action="${action}"]`).forEach((element) => {
    element.addEventListener("click", () => {
      void handler(element);
    });
  });
}

function compactWorkspace(workspaceFolders: string[]): string {
  if (workspaceFolders.length === 0) {
    return "no workspace";
  }

  return workspaceFolders
    .map((folder) => {
      try {
        const url = new URL(folder);
        const parts = url.pathname.split("/").filter(Boolean);
        return parts.at(-1) ?? folder;
      } catch {
        return folder;
      }
    })
    .join(", ");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/'/gu, "&#39;");
}

function mustGetRoot(): HTMLElement {
  const element = document.getElementById("app");
  if (!element) {
    throw new Error("Missing #app root");
  }

  return element;
}
