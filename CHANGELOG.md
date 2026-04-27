# Changelog

## 0.6.0

- Agents can now understand what the user is actively looking at before acting, including the active cell, selected ranges, visible ranges, focus state, and source selection. (`8ed6253`)
- Notebook images are easier for MCP hosts to consume because image bytes are returned once as native MCP image content instead of being duplicated through text or structured JSON. (`32ddb03`)
- Agents get a clearer read path for large notebooks: use `list_notebook_cells` for previews and `read_notebook` only for targeted full-source reads. (`d78d86b`)
- Tool descriptions now surface the highest-value guidance for guarded patch edits, async execution, waits, and inline rendered images. (`599291b`)
- The bridge status bar now respects the active editor theme, improving contrast in more color schemes. (`4865139`)

## 0.4.0

- Agent actions are less disruptive because the extension now reuses already visible notebook editors before opening another editor view. (`4412546`)

## 0.3.0

- Notebook edits and executions are safer and easier to recover from because tools now validate arguments more clearly and preserve stale-source checks across edit and run flows. (`82cbbfa`)
- Rendered Plotly output is easier for agents to inspect when the notebook already contains static image representations, and the docs now explain the recommended Plotly renderer setup. (`fab8a30`)
- The reveal option is clearer and more explicit as `reveal_cell`, reducing ambiguity in edit and execution calls. (`662848e`)

## 0.2.0

- Agents can complete a full notebook workflow through MCP: discover notebooks, target cells, edit safely, execute code, inspect outputs, manage kernels, and review variables. (`dd512c2`, `0e9310e`, `1fd2245`, `764506d`, `8dcfd46`)
- Large notebooks are cheaper to navigate because agents can use bounded previews, fingerprints, targeted reads, and output-file routing instead of pulling the whole notebook into context. (`dd512c2`, `0e9310e`, `d68571d`)
- Live editing is safer because replacements, patches, moves, deletes, formatting, reveals, and visibility changes can use source fingerprints and notebook targeting. (`1fd2245`, `b6a63cf`, `1fa5a69`, `6caabb5`)
- Long-running notebook work is more usable because agents can choose blocking or async execution, poll status, wait for updates, interrupt runs, restart kernels, and track kernel readiness. (`afa98cb`, `717e39c`, `59969e0`)
- Notebook outputs are more useful to agents because text, errors, static images, Plotly snapshots, and large payloads are normalized into agent-readable results. (`0b3062d`, `1b541d2`, `d68571d`)
- Code-aware navigation is richer through notebook search, diagnostics, symbol search, and go-to-definition. (`1fd2245`, `764506d`)
- Capable MCP hosts get optional extras for passive resources, reusable prompts, review and preview app surfaces, clickable cell links, and configurable tool profiles. (`e27578b`, `5e470d4`, `83d5a59`, `6b6f396`)
- Setup is easier and more reliable through project-local bridge discovery and generated host-specific MCP configuration. (`2365bcd`, `c527a7`)

## 0.1.0

- Initial release goal: expose the live Jupyter notebook in a VS Code-compatible editor as MCP tools so agents can inspect, edit, execute, and review the same notebook the user sees.
