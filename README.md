# Jupyter Agent Bridge

Jupyter Agent Bridge exposes the live Jupyter notebook open in your editor as MCP tools, so an agent can read, edit, execute, and inspect the same notebook you see.

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

4. Run `Jupyter Agent Bridge: Start Bridge` if the bridge is not already running.

5. Run `Jupyter Agent Bridge: Copy MCP Definition`.

   This copies a ready-to-paste MCP config snippet that points at the bundled `frontend-mcp` server and the workspace-local port file under `.jupyter-agent-bridge/bridge/port`.

6. Paste that snippet into the MCP configuration used by your agent host, then reload or restart the host so it picks up the new server.

### VS Code And Cursor Notes

- The install step is the same: use `Install from Location...` and pick the repo root.
- Cursor can auto-register the bundled MCP server when its MCP extension API is available. In that case, manual MCP config may be unnecessary, but `Copy MCP Definition` is still useful for explicit or session-pinned setups.
- In plain VS Code or other MCP-capable hosts, expect to use the copied MCP definition manually.

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

- **Notebook discovery and navigation**: use `list_open_notebooks`, `open_notebook`, `get_notebook_outline`, `list_notebook_cells`, and `reveal_notebook_cells` to orient the agent without pulling full notebook contents into context.
- **Targeted reading and search**: use `search_notebook`, `find_symbols`, `go_to_definition`, `get_diagnostics`, and targeted `read_notebook` calls to keep context small and stale-safe.
- **Safe live editing**: use `insert_cell`, `replace_cell_source`, `patch_cell_source`, `format_cell`, `move_cell`, and `delete_cell`. Most edit calls accept `expected_notebook_version`, and patch/format flows can also use `expected_cell_source_sha256`.
- **Execution and kernel control**: use `execute_cells` when you want a blocking result, or `execute_cells_async` with `get_execution_status` or `wait_for_execution` when you want a handle-first flow. Use `read_cell_outputs`, `get_kernel_info`, `wait_for_kernel_ready`, `interrupt_execution`, `restart_kernel`, `select_kernel`, and `select_jupyter_interpreter` to keep runtime state explicit.
- **Variable inspection**: use `list_variables` to page through the live kernel variable explorer state instead of reading huge notebook outputs.
- **Compact summaries and large payload handling**: use `summarize_notebook_state` when you want a machine-readable status snapshot, and use `output_file_path` on `read_notebook` or `read_cell_outputs` when the result is too large for prompt context.
- **Tool self-discovery**: use `describe_tool` to ask the MCP server for the exact schema and examples of any tool before invoking it.

## Technical Details

At a high level, the stack works like this:

1. An agent host calls an MCP tool exposed by the bundled `frontend-mcp` server.
2. `frontend-mcp` discovers the active bridge session from the rendezvous directory or the workspace port file. When more than one session is plausible, it can prompt the user through MCP elicitation if the client supports it.
3. The MCP server sends authenticated JSON-RPC requests to `POST /rpc` on `127.0.0.1`.
4. The extension resolves the request against the live notebook and kernel state through VS Code notebook APIs and Jupyter command surfaces.
5. Results are normalized into transport-safe types and returned to the MCP host.

The main packages are:

- `extension/`: editor-hosted adapters, bridge server, VS Code/Jupyter integration, and Cursor integration
- `frontend-mcp/`: standalone MCP server, session discovery, typed bridge client, and MCP tool layer
- `packages/notebook-domain/`: pure notebook policy, kernel-state rules, previews, outline/search logic, and variable normalization
- `packages/protocol/`: shared request/response types, JSON-RPC method names, session record types, and shared errors

The key design rule is that the notebook visible in the editor stays authoritative. The MCP server is an adapter, not a second notebook implementation.

## API

The MCP surface is the primary interface for agents. The bridge surface is the lower-level JSON-RPC contract used by `frontend-mcp`.

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
| `replace_cell_source` | Replaces one cell’s entire source. | `notebook_uri`, `cell_id`, `source` | `MutationResult` |
| `patch_cell_source` | Applies a structured patch to one cell. | `notebook_uri`, `cell_id`, `patch`, optional `format`, version and source guards | `PatchCellSourceResult` |
| `format_cell` | Runs the editor formatter on one cell when available. | `notebook_uri`, `cell_id`, optional version and source guards | `FormatCellResult` |
| `delete_cell` | Deletes one cell from the notebook. | `notebook_uri`, `cell_id` | `MutationResult` |
| `move_cell` | Moves one cell to a target index. | `notebook_uri`, `cell_id`, `target_index` | `MutationResult` |
| `execute_cells` | Executes code cells and waits for normalized results. | `notebook_uri`, `cell_ids`, optional `timeout_ms`, `stop_on_error` | `ExecuteCellsResult` |
| `execute_cells_async` | Queues code cell execution and returns an execution handle immediately. | `notebook_uri`, `cell_ids`, optional `timeout_ms`, `stop_on_error` | `ExecuteCellsAsyncResult` |
| `get_execution_status` | Reads the latest snapshot for an async execution handle. | `execution_id` | `ExecutionStatusResult` |
| `wait_for_execution` | Waits for an async execution handle to reach a terminal state or returns the latest non-terminal snapshot when the wait itself times out. | `execution_id`, optional `timeout_ms` | `WaitForExecutionResult` |
| `interrupt_execution` | Requests a kernel interrupt through the editor/Jupyter stack. | `notebook_uri` | `KernelCommandResult` |
| `restart_kernel` | Requests a kernel restart through the editor/Jupyter stack. | `notebook_uri` | `KernelCommandResult` |
| `wait_for_kernel_ready` | Waits for the current or target kernel generation to become ready. | `notebook_uri`, optional `timeout_ms`, `target_generation` | `WaitForKernelReadyResult` |
| `read_cell_outputs` | Reads normalized outputs for one cell. | `notebook_uri`, `cell_id`, optional `include_rich_output_text`, `output_file_path` | `ReadCellOutputsResult` |
| `reveal_notebook_cells` | Reveals and optionally selects cells in the live editor UI. | `notebook_uri`, optional `range`, `cell_ids`, `select`, `reveal_type` | `RevealNotebookCellsResult` |
| `get_kernel_info` | Reads best-effort kernel information for the notebook. | `notebook_uri` | `GetKernelInfoResult` |
| `select_kernel` | Selects a kernel directly or opens the kernel picker. | `notebook_uri`, optional `kernel_id`, `extension_id`, `skip_if_already_selected` | `KernelCommandResult` |
| `select_jupyter_interpreter` | Opens the Jupyter interpreter picker for the notebook. | `notebook_uri` | `KernelCommandResult` |
| `summarize_notebook_state` | Returns a compact machine-readable notebook status summary. | `notebook_uri` | `NotebookStateSummary` |

### Bridge API

All bridge calls use JSON-RPC 2.0 over `POST /rpc` on `127.0.0.1` with bearer-token authentication. The request and result types live in [`packages/protocol/src/domain.ts`](packages/protocol/src/domain.ts), and method names are defined in [`packages/protocol/src/rpc.ts`](packages/protocol/src/rpc.ts).

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
| `notebook.reveal_cells` | Reveals cells in the editor UI. | `RevealNotebookCellsRequest` | `RevealNotebookCellsResult` |
| `notebook.get_kernel_info` | Returns best-effort kernel metadata. | `notebook_uri` | `GetKernelInfoResult` |
| `notebook.select_kernel` | Selects a kernel or opens the kernel picker. | `SelectKernelRequest` | `KernelCommandResult` |
| `notebook.select_jupyter_interpreter` | Opens the interpreter picker. | `SelectJupyterInterpreterRequest` | `KernelCommandResult` |
| `notebook.summarize_state` | Returns a compact notebook status summary. | `notebook_uri` | `SummarizeNotebookStateResult` |
