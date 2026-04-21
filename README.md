# Jupyter Agentic Bridge

Jupyter Agentic Bridge exposes the live Jupyter notebook open in your editor as MCP tools, so an agent can read, edit, execute, and inspect the same notebook you see.

The project is split into a VS Code-compatible extension, a localhost JSON-RPC bridge, and a standalone MCP server. If you want the architectural view first, read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Quick Start

1. Install dependencies and build the workspace.

   ```sh
   npm install
   npm run build
   ```

2. Install the extension from the repository root with your editor’s `Install from Location...` command.

   Choose the repository root, not `extension/`. The root `package.json` is the extension manifest and points at the built artifacts under `extension/dist` and `frontend-mcp/dist`.

3. Reload the editor if it does not reload automatically, then open a `.ipynb` notebook.

4. Run `Jupyter Agentic Bridge: Start Bridge` if the bridge is not already running.

5. Run `Jupyter Agentic Bridge: Create MCP Config`.

   Choose one of the supported targets: `Claude Code`, `Codex`, `Copilot`, `Copy to Clipboard`, or `Cursor`. The extension writes the project-local config file directly for the selected host, using the bundled `frontend-mcp` server and the workspace-local port file under `.jupyter-agent-bridge/bridge/port`.

6. Reload or restart the selected host so it picks up the new server. If you chose `Copy to Clipboard`, paste the copied snippet into the host config manually.

### VS Code And Cursor Notes

- The install step is the same: use `Install from Location...` and pick the repo root.
- Cursor can auto-register the bundled MCP server when its MCP extension API is available. In that case, manual MCP config may be unnecessary, but `Create MCP Config` is still useful for explicit or session-pinned setups.
- `Create MCP Config` writes one of these project-local files directly:
  - `.mcp.json` for Claude Code
  - `.codex/config.toml` for Codex
  - `.vscode/mcp.json` for Copilot / VS Code
  - `.cursor/mcp.json` for Cursor
- These generated MCP config files are local artifacts. They include an absolute path to the built `frontend-mcp` entrypoint plus the workspace-local `.jupyter-agent-bridge/bridge/port` path, so they should stay untracked and should not be copied between machines unchanged.

## Local Artifacts

The extension intentionally creates a few local, machine-specific files while it is running:

- `.jupyter-agent-bridge/bridge/port` stores the active localhost bridge port for the current workspace.
- `.mcp.json`, `.codex/config.toml`, `.vscode/mcp.json`, and `.cursor/mcp.json` are optional generated host configs that point at the bundled MCP server in your local checkout.
- `frontend-mcp` writes logs under the system temp directory by default, or under `JUPYTER_AGENT_BRIDGE_LOG_DIR` if you override it.

These files are operational state, not source files. Keep them out of commits and regenerate them on each machine.

## Usage

The intended workflow is incremental. Let the agent discover the notebook, narrow the target area, edit only the cells it needs, execute the right code cells, and then inspect the resulting outputs or kernel state.

A normal agent flow looks like this:

1. `list_open_notebooks`
2. `get_notebook_outline` or `list_notebook_cells`
3. `search_notebook`, `find_symbols`, or `read_notebook` on a small range
4. `patch_cell_source`, `replace_cell_source`, `insert_cell`, or `move_cell`
5. `execute_cells` for blocking execution, or `execute_cells_async` followed by `wait_for_execution`
6. `read_cell_outputs`, `get_diagnostics`, `get_execution_status`, or `summarize_notebook_state`

If your agent uses repository instructions, a short hint in `AGENTS.md` helps it choose the notebook tools first. A good example is:

```md
For notebook work, prefer the jupyter-agent-bridge MCP tools before reading or editing raw .ipynb files.
```

## Advanced Usage

- **Profiles**: `core` is now the default notebook-first surface and includes the full notebook tool catalog, including edit, execution, navigation, kernel, and workflow tools. Set `JUPYTER_AGENT_BRIDGE_PROFILE=full` only when you also want progressive-discovery extras such as read-only MCP resources and MCP Apps companion views.
- **Notebook discovery and navigation**: use `list_open_notebooks`, `open_notebook`, `get_notebook_outline`, `list_notebook_cells`, and `reveal_notebook_cells` to orient the agent without pulling full notebook contents into context. Use `set_notebook_cell_input_visibility` when you want a separate presentation-state change such as collapsing code input before a demo.
- **Progressive discovery**: the MCP frontend now also exposes read-only MCP resources and structured tool output. Treat those as additive conveniences for capable clients. Tools remain the primary universal interface and continue to be the right default in `AGENTS.md`.
- **MCP Apps companion views**: capable hosts can now open app-backed review surfaces for bridge session selection, cell code preview, cell change review, async execution monitoring, notebook triage, and cell output preview. These views are additive helpers on top of the same bridge-backed tools; they do not replace the tool interface.
- **Known multi-step procedures**: use `run_notebook_workflow` when the full notebook plan is already known and does not require LLM inspection between steps. Each workflow step reuses an existing notebook tool name and the same JSON input shape that tool already accepts.
- **Targeted reading and search**: use `search_notebook`, `find_symbols`, `go_to_definition`, `get_diagnostics`, and targeted `read_notebook` calls to keep context small and stale-safe.
- **Safe live editing**: use `insert_cell`, `replace_cell_source`, `patch_cell_source`, `format_cell`, `move_cell`, and `delete_cell`. Most edit calls accept `expected_notebook_version`, and source edits can also carry `expected_cell_source_fingerprint` so agents can reuse cached cell metadata instead of re-listing cells before every change. Prefer `replace_cell_source` for medium or large rewrites; prefer `patch_cell_source` for small, local edits.
- **Change review before mutation**: use `preview_cell_edit` for a non-mutating replace/patch preview, or `open_cell_edit_review` in an MCP Apps host when a human should inspect the diff before applying it.
- **Code-first human review**: use `open_cell_code_preview` when you want a host-rendered code snippet with direct "go to cell" and output reveal actions instead of relying on chat-surface links.
- **Execution and kernel control**: use `execute_cells` when you want a blocking result, or `execute_cells_async` with `get_execution_status` or `wait_for_execution` when you want a handle-first flow. Execution requests can also carry `expected_cell_source_fingerprint_by_id` for stale-safe execution targeting. Use `read_cell_outputs`, `get_kernel_info`, `wait_for_kernel_ready`, `interrupt_execution`, `restart_kernel`, `select_kernel`, and `select_jupyter_interpreter` to keep runtime state explicit.
- **Variable inspection**: use `list_variables` to page through the live kernel variable explorer state instead of reading huge notebook outputs.
- **Compact summaries and large payload handling**: use `summarize_notebook_state` when you want a machine-readable status snapshot, and use `output_file_path` on `read_notebook` or `read_cell_outputs` when the result is too large for prompt context.
- **Live-result explanation**: prefer `open_cell_output_preview` plus `reveal_notebook_cells` for human-facing output explanation. `export_cell_output_snapshot` writes an ephemeral normalized snapshot to a temp file when a durable artifact is more useful than inline chat content.
- **Tool self-discovery**: use `describe_tool` to ask the MCP server for the exact schema and examples of any tool before invoking it.

## Technical Details

At a high level, the stack works like this:

1. An agent host calls an MCP tool or reads an MCP resource exposed by the bundled `frontend-mcp` server.
2. `frontend-mcp` discovers the active bridge session from the rendezvous directory or the workspace port file. When more than one session is plausible, it can prompt the user through MCP elicitation if the client supports it.
3. The MCP server sends authenticated JSON-RPC requests to `POST /rpc` on `127.0.0.1`.
4. The extension resolves the request against the live notebook and kernel state through VS Code notebook APIs and Jupyter command surfaces.
5. Results are normalized into transport-safe types, then rendered by the MCP shell as typed `structuredContent`, read-only resources, compatibility text/image content, or MCP Apps companion views depending on the feature being used.

The main packages are:

- `extension/`: editor-hosted adapters, bridge server, VS Code/Jupyter integration, and Cursor integration
- `frontend-mcp/`: standalone MCP server, session discovery, typed bridge client, and MCP tool layer
- `packages/notebook-domain/`: pure notebook policy, kernel-state rules, previews, outline/search logic, and variable normalization
- `packages/protocol/`: shared request/response types, JSON-RPC method names, session record types, and shared errors

The key design rule is that the notebook visible in the editor stays authoritative. The MCP server is an adapter, not a second notebook implementation. MCP-specific concerns such as resource URIs, elicitation policy, `outputSchema`, and MCP Apps UI resources live in `frontend-mcp`, not in the protocol, extension, or notebook-domain layers.

## API

The MCP tool surface is the primary interface for agents. The bridge surface is the lower-level JSON-RPC contract used by `frontend-mcp`. MCP resources and structured tool output are additive progressive-discovery features for clients that support them.

### MCP API

| Tool | What it does | Key inputs | Returns |
| --- | --- | --- | --- |
| `list_open_notebooks` | Lists notebooks visible to the live bridge session. | None | Notebook summaries |
| `describe_tool` | Returns tool schemas, examples, and notebook-specific usage rules. | Optional `tool_name` | Tool metadata |
| `open_notebook` | Opens a notebook in the editor session. | `notebook_uri`, optional `view_column` | `NotebookSummary` |
| `get_notebook_outline` | Reads markdown-heading structure without full cell bodies. | `notebook_uri` | `NotebookOutlineResult` |
| `list_notebook_cells` | Returns lightweight per-cell previews for navigation. | `notebook_uri`, optional `range` or `cell_ids` | `ListNotebookCellsResult` |
| `list_variables` | Pages through variables from the live kernel variable explorer state. | `notebook_uri`, optional `query`, `offset`, `max_results` | `ListNotebookVariablesResult` |
| `search_notebook` | Runs fast text search across notebook cells. | `notebook_uri`, `query`, optional search flags | `SearchNotebookResult` |
| `find_symbols` | Finds semantic symbols and their locations in notebook cells. | `notebook_uri`, optional `query`, `range`, `cell_ids` | `FindSymbolsResult` |
| `get_diagnostics` | Reads current editor diagnostics for cells. | `notebook_uri`, optional `severities`, `range`, `cell_ids` | `NotebookDiagnosticsResult` |
| `go_to_definition` | Resolves a symbol reference from an exact cell position. | `notebook_uri`, `cell_id`, `line`, `column` | `GoToDefinitionResult` |
| `read_notebook` | Reads live notebook cells and optionally outputs. | `notebook_uri`, optional `range`, `cell_ids`, `include_outputs`, `output_file_path` | `NotebookSnapshot` |
| `insert_cell` | Inserts a new code or markdown cell. | `notebook_uri`, `position`, `cell`, optional `expected_notebook_version` | `MutationResult` |
| `replace_cell_source` | Replaces one cell’s entire source. | `notebook_uri`, `cell_id`, `source`, optional version and source guards | `MutationResult` |
| `patch_cell_source` | Applies a structured patch to one cell. | `notebook_uri`, `cell_id`, `patch`, optional `format`, version and source guards | `PatchCellSourceResult` |
| `preview_cell_edit` | Dry-runs a replace or patch request and returns before/after source plus a unified diff without mutating the notebook. | `operation`, `notebook_uri`, `cell_id`, replace or patch fields, optional version/source guards | `PreviewCellEditResult` |
| `format_cell` | Runs the editor formatter on one cell when available. | `notebook_uri`, `cell_id`, optional version and source guards | `FormatCellResult` |
| `delete_cell` | Deletes one cell from the notebook. | `notebook_uri`, `cell_id` | `MutationResult` |
| `move_cell` | Moves one cell to a target index. | `notebook_uri`, `cell_id`, `target_index` | `MutationResult` |
| `execute_cells` | Executes code cells and waits for normalized results. | `notebook_uri`, `cell_ids`, optional version, per-cell source guards, `timeout_ms`, `stop_on_error` | `ExecuteCellsResult` |
| `execute_cells_async` | Queues code cell execution and returns an execution handle immediately. | `notebook_uri`, `cell_ids`, optional version, per-cell source guards, `timeout_ms`, `stop_on_error` | `ExecuteCellsAsyncResult` |
| `get_execution_status` | Reads the latest snapshot for an async execution handle. | `execution_id` | `ExecutionStatusResult` |
| `wait_for_execution` | Waits for an async execution handle to reach a terminal state or returns the latest non-terminal snapshot when the wait itself times out. | `execution_id`, optional `timeout_ms` | `WaitForExecutionResult` |
| `interrupt_execution` | Requests a kernel interrupt through the editor/Jupyter stack. | `notebook_uri` | `KernelCommandResult` |
| `restart_kernel` | Requests a kernel restart through the editor/Jupyter stack. | `notebook_uri` | `KernelCommandResult` |
| `wait_for_kernel_ready` | Waits for the current or target kernel generation to become ready. | `notebook_uri`, optional `timeout_ms`, `target_generation` | `WaitForKernelReadyResult` |
| `read_cell_outputs` | Reads normalized outputs for one cell. | `notebook_uri`, `cell_id`, optional `include_rich_output_text`, `output_file_path` | `ReadCellOutputsResult` |
| `reveal_notebook_cells` | Reveals and optionally selects cells in the live editor UI. | `notebook_uri`, optional `range`, `cell_ids`, `select`, `reveal_type`, `focus_target` | `RevealNotebookCellsResult` |
| `set_notebook_cell_input_visibility` | Collapses or expands the input area for selected cells in the live editor UI. | `notebook_uri`, optional `range`, `cell_ids`, `input_visibility` | `SetNotebookCellInputVisibilityResult` |
| `run_notebook_workflow` | Executes a known multi-step notebook DAG in one MCP tool call. | `notebook_uri`, `steps`, optional `on_error` | Workflow step results |
| `get_kernel_info` | Reads best-effort kernel information for the notebook. | `notebook_uri` | `GetKernelInfoResult` |
| `select_kernel` | Selects a kernel directly or opens the kernel picker. | `notebook_uri`, optional `kernel_id`, `extension_id`, `skip_if_already_selected` | `KernelCommandResult` |
| `select_jupyter_interpreter` | Opens the Jupyter interpreter picker for the notebook. | `notebook_uri` | `KernelCommandResult` |
| `summarize_notebook_state` | Returns a compact machine-readable notebook status summary. | `notebook_uri` | `NotebookStateSummary` |
| `list_bridge_sessions` | Lists active bridge sessions plus the currently pinned session id, if any. | None | Session summaries |
| `select_bridge_session` | Pins or clears the bridge session used for later notebook calls in this MCP server process. | Optional `session_id` or `null` | Session selection result |
| `open_bridge_session_chooser` | Opens the MCP Apps bridge-session chooser in capable hosts. | None | Session chooser app payload |
| `open_cell_code_preview` | Opens the MCP Apps code-preview surface for one cell with live notebook navigation actions. | `notebook_uri`, `cell_id` | Code preview app payload |
| `open_cell_edit_review` | Opens the MCP Apps change-review surface for replace or patch edits. | Same shape as `preview_cell_edit` | Change review app payload |
| `open_execution_monitor` | Opens the MCP Apps async execution monitor for an existing `execution_id`. | `execution_id` | Execution monitor app payload |
| `open_notebook_triage` | Opens the MCP Apps triage surface that combines notebook summary, diagnostics, search, and symbols. | `notebook_uri`, optional `query`, `range`, `cell_ids` | Notebook triage app payload |
| `open_cell_output_preview` | Opens the MCP Apps normalized output preview for one cell. | `notebook_uri`, `cell_id`, optional `output_index` | Output preview app payload |
| `export_cell_output_snapshot` | Writes an ephemeral normalized cell-output snapshot to a temp file. | `notebook_uri`, `cell_id`, optional `output_index` | Snapshot file receipt |

All tools now also declare MCP `outputSchema` and return typed `structuredContent` in addition to the existing compatibility text/image content. Clients that ignore structured output can continue using tool text content exactly as before.

### MCP Resources

`frontend-mcp` also exposes read-only MCP resources for passive notebook discovery. These resources are optional conveniences for resource-aware clients; they do not replace tools.

- Fixed resources:
  - `jupyter://session/active`
  - `jupyter://notebooks/open`
- Notebook-scoped templates:
  - `jupyter://notebook/outline{?notebook_uri}`
  - `jupyter://notebook/cells{?notebook_uri}`
  - `jupyter://notebook/read{?notebook_uri}`
  - `jupyter://notebook/state{?notebook_uri}`
  - `jupyter://notebook/kernel{?notebook_uri}`
  - `jupyter://notebook/variables{?notebook_uri}`
  - `jupyter://notebook/diagnostics{?notebook_uri}`
  - `jupyter://notebook/symbols{?notebook_uri}`
  - `jupyter://notebook/search{?notebook_uri,query}`
- Cell-scoped templates:
  - `jupyter://cell/code{?notebook_uri,cell_id}` — cell source snapshot (read); list includes every cell
  - `jupyter://cell/output{?notebook_uri,cell_id}` — normalized outputs; list includes cells that currently have outputs

These resources mirror the corresponding read-oriented tool results and delegate through the same frontend shell read paths. Mutations, execution, UI presentation, and workflow orchestration remain tools only.

### MCP Prompts

`frontend-mcp` also registers reusable prompts for common notebook procedures:

- `triage_notebook`
- `safe_edit_cell`
- `execute_and_inspect`
- `recover_kernel`

These prompts stay tool-first. They guide the host toward the existing notebook tools rather than introducing a second workflow surface.

### MCP Apps

`frontend-mcp` also exposes one shared MCP Apps HTML resource, `ui://jupyter-agent-bridge/notebook-console.html`, which backs several additive companion tools:

- `open_bridge_session_chooser`
- `open_cell_code_preview`
- `open_cell_edit_review`
- `open_execution_monitor`
- `open_notebook_triage`
- `open_cell_output_preview`

These views are orchestration shells for the same bridge-backed tools documented above. The live notebook remains the source of truth, and editor navigation now belongs in the app surfaces rather than in read-only resource payloads.

### Bridge API

All bridge calls use JSON-RPC 2.0 over `POST /rpc` on `127.0.0.1` with bearer-token authentication. The request and result types live in [`packages/protocol/src/domain.ts`](packages/protocol/src/domain.ts), and method names are defined in [`packages/protocol/src/rpc.ts`](packages/protocol/src/rpc.ts).

For stale-safe agent flows, treat `cell_id` as stable identity and `source_fingerprint` as mutable cell state. When a guarded request fails with `NotebookChanged`, the error `detail` includes fresh cell snapshots for the mismatched target cells so the agent can retry without an extra `list_notebook_cells` round trip.

| Method | What it does | Key params | Returns |
| --- | --- | --- | --- |
| `bridge.get_session_info` | Returns bridge/session metadata and capabilities for the active editor window. | None | `BridgeSessionInfo` |
| `notebook.list_open` | Lists notebooks visible to the bridge session. | None | `ListOpenNotebooksResult` |
| `notebook.open` | Opens a notebook in the editor session. | `OpenNotebookRequest` | `OpenNotebookResult` |
| `notebook.get_outline` | Reads the notebook heading outline. | `notebook_uri` | `NotebookOutlineResult` |
| `notebook.list_cells` | Returns notebook cell previews. | `ListNotebookCellsRequest` | `ListNotebookCellsResult` |
| `notebook.list_variables` | Returns paged variable summaries for the live kernel. | `ListNotebookVariablesRequest` | `ListNotebookVariablesResult` |
| `notebook.search` | Runs notebook text search. | `SearchNotebookRequest` | `SearchNotebookResult` |
| `notebook.get_diagnostics` | Returns current diagnostics for notebook cells. | `NotebookDiagnosticsRequest` | `NotebookDiagnosticsResult` |
| `notebook.find_symbols` | Returns symbols found in notebook cells. | `FindSymbolsRequest` | `FindSymbolsResult` |
| `notebook.go_to_definition` | Resolves a symbol definition from a cell position. | `GoToDefinitionRequest` | `GoToDefinitionResult` |
| `notebook.read` | Returns notebook snapshots and optional outputs. | `ReadNotebookRequest` | `ReadNotebookResult` |
| `notebook.insert_cell` | Inserts a cell into the live notebook. | `InsertCellRequest` | `MutationResult` |
| `notebook.replace_cell_source` | Replaces one cell’s source. | `ReplaceCellSourceRequest` | `MutationResult` |
| `notebook.patch_cell_source` | Applies a structured patch to one cell. | `PatchCellSourceRequest` | `PatchCellSourceResult` |
| `notebook.preview_cell_edit` | Dry-runs a replace or patch request and returns before/after source plus a unified diff. | `PreviewCellEditRequest` | `PreviewCellEditResult` |
| `notebook.format_cell` | Formats one cell through the editor formatter. | `FormatCellRequest` | `FormatCellResult` |
| `notebook.delete_cell` | Deletes one cell. | `DeleteCellRequest` | `MutationResult` |
| `notebook.move_cell` | Moves one cell to a target index. | `MoveCellRequest` | `MutationResult` |
| `notebook.execute_cells` | Executes code cells and collects normalized outputs. | `ExecuteCellsRequest` | `ExecuteCellsResult` |
| `notebook.execute_cells_async` | Queues code cells and returns an async execution handle. | `ExecuteCellsAsyncRequest` | `ExecuteCellsAsyncResult` |
| `notebook.get_execution_status` | Reads the latest async execution snapshot. | `GetExecutionStatusRequest` | `ExecutionStatusResult` |
| `notebook.wait_for_execution` | Waits for an async execution handle to finish or for the wait itself to time out. | `WaitForExecutionRequest` | `WaitForExecutionResult` |
| `notebook.interrupt_execution` | Requests a kernel interrupt. | `InterruptExecutionRequest` | `KernelCommandResult` |
| `notebook.restart_kernel` | Requests a kernel restart. | `RestartKernelRequest` | `KernelCommandResult` |
| `notebook.wait_for_kernel_ready` | Waits for kernel readiness. | `WaitForKernelReadyRequest` | `WaitForKernelReadyResult` |
| `notebook.read_cell_outputs` | Returns outputs for one cell. | `ReadCellOutputsRequest` | `ReadCellOutputsResult` |
| `notebook.reveal_cells` | Reveals cells in the editor UI and can optionally focus output. | `RevealNotebookCellsRequest` | `RevealNotebookCellsResult` |
| `notebook.set_cell_input_visibility` | Collapses or expands the input area for selected cells in the editor UI. | `SetNotebookCellInputVisibilityRequest` | `SetNotebookCellInputVisibilityResult` |
| `notebook.get_kernel_info` | Returns best-effort kernel metadata. | `notebook_uri` | `GetKernelInfoResult` |
| `notebook.select_kernel` | Selects a kernel or opens the kernel picker. | `SelectKernelRequest` | `KernelCommandResult` |
| `notebook.select_jupyter_interpreter` | Opens the interpreter picker. | `SelectJupyterInterpreterRequest` | `KernelCommandResult` |
| `notebook.summarize_state` | Returns a compact notebook status summary. | `notebook_uri` | `SummarizeNotebookStateResult` |
