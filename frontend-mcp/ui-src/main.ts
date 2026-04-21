import {
  App,
  PostMessageTransport,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
} from "@modelcontextprotocol/ext-apps";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type {
  CellCodePreviewViewPayload,
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
  if (!payload) {
    return;
  }

  currentView = payload;
  banner = null;
  schedulePolling();
  render();
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
    root.innerHTML = renderShell({
      title: "Notebook Console",
      subtitle: "Waiting for an MCP App payload.",
      body: `<section class="surface surface--empty"><p class="muted">Run an app-backed tool such as <code>open_notebook_triage</code> or <code>open_cell_code_preview</code>.</p></section>`,
    });
    return;
  }

  switch (currentView.view) {
    case "session_chooser":
      renderSessionChooser(currentView);
      return;
    case "cell_edit_review":
      renderCellEditReview(currentView);
      return;
    case "execution_monitor":
      renderExecutionMonitor(currentView);
      return;
    case "notebook_triage":
      renderNotebookTriage(currentView);
      return;
    case "cell_output_preview":
      renderCellOutputPreview(currentView);
      return;
    case "cell_code_preview":
      renderCellCodePreview(currentView);
      return;
  }
}

function renderSessionChooser(view: SessionChooserViewPayload): void {
  root.innerHTML = renderShell({
    eyebrow: "Workspace Binding",
    title: "Bridge Sessions",
    subtitle: "Choose which editor window this MCP server should control.",
    actions: `
      <button class="button" data-action="refresh-sessions">Refresh</button>
      <button class="button button--ghost" data-action="clear-session">Clear Pin</button>
    `,
    body: `
      <section class="surface">
        <div class="surface-header">
          <h2>Live Sessions</h2>
          <p class="muted">Pins are local to this MCP process and help when several notebook windows are open.</p>
        </div>
        <div class="card-grid">
          ${view.sessions
            .map(
              (session) => `
                <button class="card card--interactive" data-action="pin-session" data-session-id="${escapeAttribute(session.session_id)}">
                  <div class="card-topline">
                    <span class="card-title">${escapeHtml(session.window_title)}</span>
                    ${view.pinned_session_id === session.session_id ? '<span class="chip chip--accent">Pinned</span>' : ""}
                  </div>
                  <div class="card-meta">
                    <span>${escapeHtml(compactWorkspace(session.workspace_folders))}</span>
                    <code>${escapeHtml(session.session_id)}</code>
                  </div>
                </button>`,
            )
            .join("")}
        </div>
      </section>
    `,
  });

  bindAction("refresh-sessions", async () => {
    hydrateFromToolResult(await app.callServerTool({ name: "open_bridge_session_chooser", arguments: {} }));
  });
  bindAction("clear-session", async () => {
    await app.callServerTool({ name: "select_bridge_session", arguments: { session_id: null } });
    hydrateFromToolResult(await app.callServerTool({ name: "open_bridge_session_chooser", arguments: {} }));
  });
  bindAction("pin-session", async (element) => {
    const sessionId = element.getAttribute("data-session-id");
    if (!sessionId) {
      return;
    }

    await app.callServerTool({ name: "select_bridge_session", arguments: { session_id: sessionId } });
    hydrateFromToolResult(await app.callServerTool({ name: "open_bridge_session_chooser", arguments: {} }));
  });
}

function renderCellEditReview(view: CellEditReviewViewPayload): void {
  root.innerHTML = renderShell({
    eyebrow: "Review Change",
    title: "Cell Edit Review",
    subtitle: renderNotebookLocation(view.preview.notebook_uri, view.preview.cell_id),
    actions: `
      <button class="button" data-action="refresh-preview">Refresh</button>
      <button class="button button--ghost" data-action="reveal-cell">Go To Cell</button>
      <button class="button button--ghost" data-action="open-snippet">Open Snippet</button>
      <button class="button button--primary" data-action="apply-change">Apply Change</button>
    `,
    body: `
      <section class="surface">
        <div class="metric-grid">
          ${renderMetric("Operation", escapeHtml(view.preview.operation))}
          ${renderMetric("Language", escapeHtml(view.request.operation === "patch_cell_source" ? "code" : "source"))}
          ${renderMetric("Notebook Version", escapeHtml(String(view.preview.notebook_version)))}
        </div>
      </section>
      <section class="surface">
        <div class="surface-header">
          <h2>Source</h2>
          <p class="muted">Compare the current source with the proposed edit before applying it to the live notebook.</p>
        </div>
        <div class="split-layout">
          ${renderCodeFrame(view.preview.current_source, "current", 1, "Current")}
          ${renderCodeFrame(view.preview.proposed_source, "proposed", 1, "Proposed")}
        </div>
      </section>
      <section class="surface">
        <div class="surface-header">
          <h2>Unified Diff</h2>
          <p class="muted">Patch preview rendered in the app, separate from the live editor.</p>
        </div>
        ${renderDiffFrame(view.preview.diff_unified, view.request.operation)}
      </section>
    `,
  });

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
    await revealCell(view.preview.notebook_uri, view.preview.cell_id, "code");
    banner = { kind: "info", message: "Cell revealed in the live notebook." };
    render();
  });
  bindAction("open-snippet", async () => {
    await openCellCodePreview(view.preview.notebook_uri, view.preview.cell_id);
  });
  bindAction("apply-change", async () => {
    const toolName =
      view.request.operation === "replace_cell_source" ? "replace_cell_source" : "patch_cell_source";
    const result = await app.callServerTool({ name: toolName, arguments: view.request });
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

function renderExecutionMonitor(view: ExecutionMonitorViewPayload): void {
  root.innerHTML = renderShell({
    eyebrow: "Execution",
    title: "Execution Monitor",
    subtitle: `${escapeHtml(view.execution.status)} • ${escapeHtml(view.execution.execution_id)}`,
    actions: `
      <button class="button" data-action="refresh-execution">Refresh</button>
      <button class="button button--ghost" data-action="interrupt-execution">Interrupt</button>
      <button class="button button--ghost" data-action="retry-execution">Retry</button>
      <button class="button button--ghost" data-action="reveal-output">Reveal Output</button>
      <button class="button button--ghost" data-action="wait-kernel-ready">Wait For Kernel Ready</button>
    `,
    body: `
      <section class="surface">
        <div class="metric-grid">
          ${renderMetric("Notebook", escapeHtml(fileNameFromUri(view.execution.notebook_uri)))}
          ${renderMetric("Cells", escapeHtml(String(view.execution.cell_ids.length)))}
          ${renderMetric("Status", escapeHtml(view.execution.status))}
          ${renderMetric("Started", escapeHtml(view.execution.started_at ?? "pending"))}
        </div>
      </section>
      <section class="surface">
        <div class="surface-header">
          <h2>Status Payload</h2>
          <p class="muted">Structured execution details as returned by the bridge.</p>
        </div>
        ${renderJsonFrame(view.execution, "Execution status")}
      </section>
    `,
  });

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

    hydrateFromToolResult(
      await app.callServerTool({
        name: "open_execution_monitor",
        arguments: { execution_id: (rerun.structuredContent as { execution_id: string }).execution_id },
      }),
    );
  });
  bindAction("reveal-output", async () => {
    if (view.execution.cell_ids.length === 0) {
      banner = { kind: "error", message: "No execution cells were recorded for this run." };
      render();
      return;
    }

    await revealCell(view.execution.notebook_uri, view.execution.cell_ids[0], "output");
    banner = { kind: "info", message: "Execution output revealed in the notebook." };
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

function renderNotebookTriage(view: NotebookTriageViewPayload): void {
  const diagnostics = view.diagnostics.diagnostics;
  const searchMatches = view.search?.matches ?? [];
  const symbols = view.symbols?.symbols ?? [];
  const previewById = new Map(view.cells.cells.map((cell) => [cell.cell_id, cell]));

  root.innerHTML = renderShell({
    eyebrow: "Notebook Review",
    title: "Notebook Triage",
    subtitle: escapeHtml(view.notebook_uri),
    actions: `
      <button class="button" data-action="refresh-triage">Refresh</button>
    `,
    body: `
      <section class="surface">
        <div class="metric-grid">
          ${renderMetric("Errors", escapeHtml(String(diagnostics.filter((item) => item.severity === "error").length)))}
          ${renderMetric("Diagnostics", escapeHtml(String(diagnostics.length)))}
          ${renderMetric("Matches", escapeHtml(String(searchMatches.length)))}
          ${renderMetric("Symbols", escapeHtml(String(symbols.length)))}
        </div>
      </section>
      <section class="surface">
        <div class="surface-header">
          <h2>Diagnostics</h2>
          <p class="muted">Error and warning hotspots with direct notebook navigation.</p>
        </div>
        <div class="stack">
          ${diagnostics
            .map((item) => renderInsightCard({
              title: item.message,
              badge: item.severity.toUpperCase(),
              badgeClass: item.severity === "error" ? "chip--danger" : "chip--warning",
              cellId: item.cell_id,
              snippet: previewById.get(item.cell_id)?.source_preview ?? "",
            }))
            .join("") || '<p class="muted">No diagnostics.</p>'}
        </div>
      </section>
      <section class="surface">
        <div class="surface-header">
          <h2>Search Matches</h2>
          <p class="muted">Query hits with snippet context from the notebook preview index.</p>
        </div>
        <div class="stack">
          ${searchMatches
            .map((item) => renderInsightCard({
              title: item.match_text,
              badge: "Match",
              badgeClass: "chip--accent",
              cellId: item.cell_id,
              detail: item.line_text,
              snippet: previewById.get(item.cell_id)?.source_preview ?? "",
            }))
            .join("") || '<p class="muted">No search matches.</p>'}
        </div>
      </section>
      <section class="surface">
        <div class="surface-header">
          <h2>Symbols</h2>
          <p class="muted">Symbol definitions with quick snippet previews and notebook jumps.</p>
        </div>
        <div class="stack">
          ${symbols
            .map(
              (item) => `
                <article class="insight-card">
                  <div class="insight-card__header">
                    <div>
                      <h3>${escapeHtml(item.name)}</h3>
                      <p class="muted">${escapeHtml(item.kind)} • <code>${escapeHtml(item.cell_id)}</code></p>
                    </div>
                    <span class="chip chip--accent">Symbol</span>
                  </div>
                  ${previewById.get(item.cell_id)?.source_preview ? renderMiniSnippet(previewById.get(item.cell_id)?.source_preview ?? "", previewById.get(item.cell_id)?.language ?? null) : ""}
                  <div class="button-row">
                    <button class="button button--ghost" data-action="triage-reveal" data-cell-id="${escapeAttribute(item.cell_id)}">Go To Cell</button>
                    <button class="button button--ghost" data-action="triage-open-snippet" data-cell-id="${escapeAttribute(item.cell_id)}">Open Snippet</button>
                    <button class="button" data-action="triage-symbol" data-cell-id="${escapeAttribute(item.cell_id)}" data-line="${item.selection_start_line}" data-column="${item.selection_start_column}">Find Definition</button>
                  </div>
                </article>`,
            )
            .join("") || '<p class="muted">No symbols.</p>'}
        </div>
      </section>
    `,
  });

  bindAction("refresh-triage", async () => {
    hydrateFromToolResult(
      await app.callServerTool({
        name: "open_notebook_triage",
        arguments: {
          notebook_uri: view.notebook_uri,
          query: view.query,
        },
      }),
    );
  });
  bindAction("triage-reveal", async (element) => {
    const cellId = element.getAttribute("data-cell-id");
    if (!cellId) {
      return;
    }

    await revealCell(view.notebook_uri, cellId, "code");
    banner = { kind: "info", message: `Revealed ${cellId} in the notebook.` };
    render();
  });
  bindAction("triage-open-snippet", async (element) => {
    const cellId = element.getAttribute("data-cell-id");
    if (!cellId) {
      return;
    }

    await openCellCodePreview(view.notebook_uri, cellId);
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

    banner = { kind: "info", message: "Definition lookup completed. Inspect the tool result in chat if needed." };
    render();
  });
}

function renderCellOutputPreview(view: CellOutputPreviewViewPayload): void {
  const outputs = view.output_index === undefined ? view.result.outputs : [view.result.outputs[view.output_index]].filter(Boolean);

  root.innerHTML = renderShell({
    eyebrow: "Output",
    title: "Cell Output Preview",
    subtitle: renderNotebookLocation(view.notebook_uri, view.cell_id),
    actions: `
      <button class="button button--ghost" data-action="open-code">Open Snippet</button>
      <button class="button button--ghost" data-action="reveal-output">Reveal Output</button>
      <button class="button" data-action="export-output">Export Snapshot</button>
    `,
    body: `
      <section class="surface">
        <div class="metric-grid">
          ${renderMetric("Outputs", escapeHtml(String(outputs.length)))}
          ${renderMetric("Cell", escapeHtml(view.cell_id))}
          ${renderMetric("Notebook", escapeHtml(fileNameFromUri(view.notebook_uri)))}
        </div>
      </section>
      <section class="stack">
        ${outputs.map(renderOutputCard).join("") || '<section class="surface"><p class="muted">No outputs.</p></section>'}
      </section>
    `,
  });

  bindAction("open-code", async () => {
    await openCellCodePreview(view.notebook_uri, view.cell_id);
  });
  bindAction("reveal-output", async () => {
    await revealCell(view.notebook_uri, view.cell_id, "output");
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

    banner = {
      kind: "info",
      message: `Snapshot exported to ${String((result.structuredContent as { output_file_path: string }).output_file_path)}.`,
    };
    render();
  });
}

function renderCellCodePreview(view: CellCodePreviewViewPayload): void {
  const metadataEntries = Object.entries(view.cell.metadata ?? {});

  root.innerHTML = renderShell({
    eyebrow: "Code Navigation",
    title: `Cell ${escapeHtml(String(view.preview.index + 1))}`,
    subtitle: renderNotebookLocation(view.notebook_uri, view.cell.cell_id),
    actions: `
      <button class="button button--ghost" data-action="reveal-cell">Go To Cell</button>
      ${view.preview.has_outputs ? '<button class="button button--ghost" data-action="open-output">Open Output</button>' : ""}
      ${view.preview.has_outputs ? '<button class="button" data-action="reveal-output">Reveal Output</button>' : ""}
    `,
    body: `
      <section class="surface">
        <div class="metric-grid">
          ${renderMetric("Kind", escapeHtml(view.cell.kind))}
          ${renderMetric("Language", escapeHtml(view.cell.language ?? "plain text"))}
          ${renderMetric("Lines", escapeHtml(String(view.preview.source_line_count)))}
          ${renderMetric("Outputs", escapeHtml(view.preview.has_outputs ? view.preview.output_kinds.join(", ") || "yes" : "none"))}
        </div>
        ${view.preview.section_path.length > 0 ? `<div class="chip-row">${view.preview.section_path.map((segment) => `<span class="chip">${escapeHtml(segment)}</span>`).join("")}</div>` : ""}
      </section>
      <section class="surface">
        <div class="surface-header">
          <h2>Source</h2>
          <p class="muted">Live cell source resolved through the bridge, rendered as an app-side snippet.</p>
        </div>
        ${renderCodeFrame(view.cell.source, view.cell.language, view.cell.notebook_line_start, "Cell source")}
      </section>
      ${
        metadataEntries.length > 0
          ? `
            <section class="surface">
              <div class="surface-header">
                <h2>Metadata</h2>
                <p class="muted">Notebook cell metadata is shown separately from the source.</p>
              </div>
              ${renderJsonFrame(view.cell.metadata, "Metadata")}
            </section>
          `
          : ""
      }
    `,
  });

  bindAction("reveal-cell", async () => {
    await revealCell(view.notebook_uri, view.cell.cell_id, "code");
    banner = { kind: "info", message: "Cell revealed in the live notebook." };
    render();
  });
  bindAction("open-output", async () => {
    hydrateFromToolResult(
      await app.callServerTool({
        name: "open_cell_output_preview",
        arguments: {
          notebook_uri: view.notebook_uri,
          cell_id: view.cell.cell_id,
        },
      }),
    );
  });
  bindAction("reveal-output", async () => {
    await revealCell(view.notebook_uri, view.cell.cell_id, "output");
    banner = { kind: "info", message: "Cell output revealed in the live notebook." };
    render();
  });
}

function renderOutputCard(output: Record<string, unknown>): string {
  const kind = String(output.kind ?? "unknown");

  if (kind === "image" && typeof output.base64 === "string" && typeof output.mime === "string") {
    return `
      <section class="surface">
        <div class="surface-header">
          <h2>${escapeHtml(kind)}</h2>
          <p class="muted">${escapeHtml(String(output.mime))}</p>
        </div>
        <div class="image-frame">
          <img alt="Notebook output image" src="data:${escapeAttribute(output.mime)};base64,${escapeAttribute(output.base64)}" />
        </div>
      </section>
    `;
  }

  if (kind === "html") {
    return `
      <section class="surface">
        <div class="surface-header">
          <h2>${escapeHtml(kind)}</h2>
          <p class="muted">Rich HTML stays best in the live notebook. This app shows a text summary instead.</p>
        </div>
        ${renderCodeFrame(String(output.summary ?? output.mime ?? "HTML output"), null, 1, "Output summary")}
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
    <section class="surface">
      <div class="surface-header">
        <h2>${escapeHtml(kind)}</h2>
        <p class="muted">${escapeHtml(typeof output.mime === "string" ? output.mime : "normalized output")}</p>
      </div>
      ${renderCodeFrame(text, kind === "error" ? "traceback" : null, 1, "Output")}
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

async function revealCell(notebookUri: string, cellId: string, kind: "code" | "output"): Promise<void> {
  await app.callServerTool({
    name: "reveal_notebook_cells",
    arguments: {
      notebook_uri: notebookUri,
      cell_ids: [cellId],
      select: true,
      focus_target: kind === "output" ? "output" : "cell",
    },
  });
}

async function openCellCodePreview(notebookUri: string, cellId: string): Promise<void> {
  hydrateFromToolResult(
    await app.callServerTool({
      name: "open_cell_code_preview",
      arguments: {
        notebook_uri: notebookUri,
        cell_id: cellId,
      },
    }),
  );
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
  if (!payload) {
    return;
  }

  currentView = payload;
  banner = null;
  schedulePolling();
  render();
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

function renderShell(config: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  actions?: string;
  body: string;
}): string {
  const bannerHtml = banner ? `<div class="banner banner--${banner.kind}">${escapeHtml(banner.message)}</div>` : "";
  return `
    <div class="shell">
      <header class="hero">
        <div class="hero-copy">
          ${config.eyebrow ? `<span class="eyebrow">${escapeHtml(config.eyebrow)}</span>` : ""}
          <h1>${config.title}</h1>
          ${config.subtitle ? `<p class="hero-subtitle">${config.subtitle}</p>` : ""}
        </div>
        ${config.actions ? `<div class="button-row">${config.actions}</div>` : ""}
      </header>
      ${bannerHtml}
      <main class="stack stack--lg">
        ${config.body}
      </main>
    </div>
  `;
}

function renderMetric(label: string, value: string): string {
  return `
    <div class="metric">
      <span class="metric-label">${label}</span>
      <strong class="metric-value">${value}</strong>
    </div>
  `;
}

function renderNotebookLocation(notebookUri: string, cellId: string): string {
  return `<code>${escapeHtml(fileNameFromUri(notebookUri))}</code> • <code>${escapeHtml(cellId)}</code>`;
}

function renderInsightCard(config: {
  title: string;
  badge: string;
  badgeClass: string;
  cellId: string;
  detail?: string;
  snippet?: string;
}): string {
  return `
    <article class="insight-card">
      <div class="insight-card__header">
        <div>
          <h3>${escapeHtml(config.title)}</h3>
          <p class="muted">${config.detail ? escapeHtml(config.detail) + " • " : ""}<code>${escapeHtml(config.cellId)}</code></p>
        </div>
        <span class="chip ${config.badgeClass}">${escapeHtml(config.badge)}</span>
      </div>
      ${config.snippet ? renderMiniSnippet(config.snippet, null) : ""}
      <div class="button-row">
        <button class="button button--ghost" data-action="triage-reveal" data-cell-id="${escapeAttribute(config.cellId)}">Go To Cell</button>
        <button class="button" data-action="triage-open-snippet" data-cell-id="${escapeAttribute(config.cellId)}">Open Snippet</button>
      </div>
    </article>
  `;
}

function renderMiniSnippet(source: string, language: string | null): string {
  return `
    <div class="mini-snippet">
      <div class="mini-snippet__label">${escapeHtml(language ?? "cell")}</div>
      <pre>${escapeHtml(source)}</pre>
    </div>
  `;
}

function renderCodeFrame(source: string, language: string | null, startLine: number, label: string): string {
  const lines = source.replace(/\n$/u, "").split("\n");
  return `
    <div class="code-frame">
      <div class="code-frame__header">
        <span>${escapeHtml(label)}</span>
        <div class="code-frame__meta">
          ${language ? `<span class="chip">${escapeHtml(language)}</span>` : ""}
          <span>${escapeHtml(String(lines.length))} lines</span>
        </div>
      </div>
      <table class="code-table" role="presentation">
        <tbody>
          ${lines
            .map(
              (line, index) => `
                <tr>
                  <td class="code-table__line">${startLine + index}</td>
                  <td class="code-table__code"><pre>${escapeHtml(line || " ")}</pre></td>
                </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderDiffFrame(diff: string, label: string): string {
  const lines = diff.replace(/\n$/u, "").split("\n");
  return `
    <div class="code-frame">
      <div class="code-frame__header">
        <span>${escapeHtml(label)}</span>
        <div class="code-frame__meta"><span>${escapeHtml(String(lines.length))} lines</span></div>
      </div>
      <table class="code-table code-table--diff" role="presentation">
        <tbody>
          ${lines
            .map((line, index) => {
              const className =
                line.startsWith("+") && !line.startsWith("+++") ? "is-add" : line.startsWith("-") && !line.startsWith("---") ? "is-remove" : line.startsWith("@@") ? "is-hunk" : "";
              return `
                <tr class="${className}">
                  <td class="code-table__line">${index + 1}</td>
                  <td class="code-table__code"><pre>${escapeHtml(line || " ")}</pre></td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderJsonFrame(value: unknown, label: string): string {
  return renderCodeFrame(JSON.stringify(value, null, 2), "json", 1, label);
}

function fileNameFromUri(uri: string): string {
  try {
    const parsed = new URL(uri);
    const parts = parsed.pathname.split("/").filter(Boolean);
    return parts.at(-1) ?? uri;
  } catch {
    return uri;
  }
}

function compactWorkspace(workspaceFolders: string[]): string {
  if (workspaceFolders.length === 0) {
    return "no workspace";
  }

  return workspaceFolders.map(fileNameFromUri).join(", ");
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
