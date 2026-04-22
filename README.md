# Jupyter Agentic Bridge

Expose the live Jupyter notebook open in your editor as MCP tools, so an agent can read, edit, execute, and inspect the same notebook you see.

## Install

1. Install `Jupyter Agentic Bridge` from Open VSX:

   [open-vsx.org/extension/alendit/jupyter-agent-bridge](https://open-vsx.org/extension/alendit/jupyter-agent-bridge)

   You can also search for `alendit.jupyter-agent-bridge` in an Open VSX-compatible extension gallery.

2. Open a `.ipynb` notebook in your editor.

3. Run `Jupyter Agentic Bridge: Create MCP Config`.

4. Choose the host you want to connect:

   - `Claude Code`
   - `Codex`
   - `Copilot`
   - `Copy to Clipboard`
   - `Cursor`

5. Restart or reload the selected host so it picks up the generated MCP config.

If the bridge is not already running, run `Jupyter Agentic Bridge: Start Bridge`.

## Usage

The normal workflow is incremental. Let the agent discover the notebook, narrow the target area, edit only the cells it needs, execute the right code cells, and then inspect the outputs or kernel state.

A typical flow looks like this:

1. `list_open_notebooks`
2. `get_notebook_outline` or `list_notebook_cells`
3. `search_notebook`, `find_symbols`, or `read_notebook` on a small range
4. `patch_cell_source`, `replace_cell_source`, `insert_cell`, or `move_cell`
5. `execute_cells` for short blocking work, or `execute_cells_async` followed by `get_execution_status` or `wait_for_execution` for long-running work
6. `read_cell_outputs`, `get_diagnostics`, `get_execution_status`, or `summarize_notebook_state`

If your agent uses repository instructions, add a short hint in `AGENTS.md` so it prefers the notebook tools over raw `.ipynb` edits. For example:

```md
For notebook work, prefer the jupyter-agent-bridge MCP tools before reading or editing raw .ipynb files.
```

## Advanced Usage

### Profiles

- `core` is the default profile. It includes the full notebook tool catalog for discovery, editing, execution, navigation, kernel control, and workflows.
- `full` adds MCP-only extras such as read-only resources and MCP Apps companion views. Set `JUPYTER_AGENT_BRIDGE_PROFILE=full` only when you want those extras.

### Discovery And Navigation

Use these tools to orient the agent without pulling the whole notebook into context:

- `list_open_notebooks`
- `open_notebook`
- `get_notebook_outline`
- `list_notebook_cells`
- `search_notebook`
- `find_symbols`
- `go_to_definition`
- `reveal_notebook_cells`
- `set_notebook_cell_input_visibility`

### Editing And Review

Use these tools for live notebook edits:

- `insert_cell`
- `replace_cell_source`
- `patch_cell_source`
- `format_cell`
- `move_cell`
- `delete_cell`

Source inputs follow normal JSON string semantics and are stored verbatim after decoding. That means:

- use actual newline characters for multiline cell content
- use `\\n` only when you want a literal backslash followed by `n`
- `replace_cell_source`, `patch_cell_source`, and `preview_cell_edit` return source fingerprints plus a canonical source preview so callers can verify what the bridge interpreted

For safer edits and human review:

- `preview_cell_edit` returns a non-mutating diff preview
- `open_cell_edit_review` opens an MCP Apps review surface in capable hosts
- `open_cell_code_preview` opens a code-first cell preview with notebook navigation actions

Most edit requests can carry notebook-version and source-fingerprint guards for stale-safe mutation flows.

Edit and execution tools also accept an optional `reveal_cell` boolean. It defaults to `true` and scrolls the affected cell into view so the user can follow along. Pass `false` to suppress that automatic reveal. For explicit viewport positioning or output focus, use `reveal_notebook_cells`.

### Execution, Kernel Control, And Outputs

For execution:

- `execute_cells`
- `execute_cells_async`
- `get_execution_status`
- `wait_for_execution`
- `run_notebook_workflow`

Use `execute_cells` when you want the tool call itself to block until execution finishes or times out. Use `execute_cells_async` when work may take a while or when the agent should keep doing other tasks while the kernel runs.

`wait_for_execution.timeout_ms` only limits how long the MCP call waits for a newer execution snapshot. It does not cancel the kernel execution. Use `interrupt_execution` when you need to stop the underlying run.

For kernel state:

- `get_kernel_info`
- `wait_for_kernel_ready`
- `interrupt_execution`
- `restart_kernel`
- `select_kernel`
- `select_jupyter_interpreter`

For outputs and result inspection:

- `read_cell_outputs`
- `open_cell_output_preview`
- `export_cell_output_snapshot`
- `list_variables`
- `summarize_notebook_state`

When notebook or output payloads are too large for prompt context, use `output_file_path` on `read_notebook` or `read_cell_outputs`.

### Optional MCP Extras

When the host supports them, the MCP frontend also exposes:

- read-only MCP resources for passive notebook discovery
- typed `structuredContent` and `outputSchema`
- reusable prompts such as `triage_notebook`, `safe_edit_cell`, `execute_and_inspect`, and `recover_kernel`
- MCP Apps companion views for session selection, notebook triage, cell review, async execution monitoring, and output preview

These are additive helpers. The MCP tool surface remains the primary interface.

## Notes

`Jupyter Agentic Bridge: Create MCP Config` writes machine-local config files such as:

- `.mcp.json`
- `.codex/config.toml`
- `.vscode/mcp.json`
- `.cursor/mcp.json`

The extension also writes the workspace-local bridge port file at `.jupyter-agent-bridge/bridge/port`.

These files are local operational state. Keep them untracked and regenerate them per machine.

## Architecture

For architecture, runtime topology, and lower-level bridge details, read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
