# Repository Guidelines

## Documentation Source Of Truth
- [`README.md`](README.md) is the human entry point for installation, usage, and API discovery.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) captures the long-term architecture, invariants, runtime topology, discovery model, and compatibility-sensitive details.
- Keep `README.md` and the relevant files under `docs/` up to date in the same change whenever behavior, workflows, public APIs, or project structure change.
- Write docs with progressive disclosure: start with an overview of the whole system, then deepen section-by-section, then land on low-level details. Each pass should still help a reader understand the full system shape.

## Project Structure & Module Organization
The live packages are:

- `extension/src/` for the VS Code-compatible extension, bridge transport, editor integration, and VS Code/Jupyter adapters
- `frontend-mcp/src/` for the standalone MCP server and bridge discovery/client logic
- `packages/notebook-domain/src/` for pure notebook policy and reusable immutable-core logic
- `packages/protocol/src/` for shared bridge contracts, transport DTOs, session discovery records, and error types
- `docs/` for architecture and other durable project documentation

Keep VS Code API usage isolated to `extension/`. Keep transport code in `bridge/` modules, notebook policy in `packages/notebook-domain`, transport contracts in `packages/protocol`, and MCP-specific adapters out of notebook logic.

## Build, Test, and Development Commands
- `npm run build` for compiling all packages
- `npm run typecheck` for workspace TypeScript verification
- `npm test` for unit and integration tests
- `npm run dev:host` for the repo’s VS Code Extension Development Host smoke flow

Prefer focused package tests first, for example `npm --workspace extension test` or `npm --workspace frontend-mcp test`, then `npm run typecheck`, then `npm test`.

## Public Surface Checklist
When you change any of the following, update docs and focused tests in the same change:

- MCP tool names, schemas, behavior, or result shaping
- bridge method names, request/response contracts, auth, or session discovery rules
- extension commands, status text, install/setup workflow, or bundled MCP registration behavior
- compatibility-sensitive runtime identifiers such as the `jupyterAgentBridge` notebook metadata namespace, the `.jupyter-agent-bridge/bridge/port` layout, session directory paths, or `JUPYTER_AGENT_BRIDGE_*` environment variables

If you change the bridge or MCP tool surface, update `README.md`, [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), the focused tests for the touched package, and this file if the workspace command surface or package layout changed.

## Coding Style & Naming Conventions
Use TypeScript for implementation. Follow the established naming patterns: service classes such as `NotebookBridgeService`, transport clients such as `HttpJsonRpcBridgeClient`, and PascalCase filenames for class-oriented modules. Use clear separation between domain, bridge, MCP, and CLI concerns. Prefer short, explicit functions over shared stateful helpers.

## Testing Guidelines
Maintain unit coverage for output normalization, cell ID persistence, JSON-RPC routing, auth validation, rendezvous parsing, and bridge error mapping. Integration tests should exercise the full editor-to-bridge flow, and MCP tests should cover session discovery and ambiguity handling.

When notebook execution completion rules change, keep the decision logic in a pure helper with a direct unit test so it can be validated without a live editor host.

When changing install/setup or editor integration behavior, verify at least the following manually when feasible:

- the extension starts the bridge and shows a valid localhost URL
- `Jupyter Agent Bridge: Copy MCP Definition` produces a working config snippet
- session discovery still works through both rendezvous records and the project-local port file
- Cursor auto-registration still works when the Cursor MCP API is available

## Commit & Pull Request Guidelines
This repository has no established history yet, so default to short, imperative commit subjects such as `Add bridge client interface`. Keep PRs focused, reference the relevant section of [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), and include manual verification notes for notebook, bridge, or MCP behavior when applicable.

## Security & Configuration Tips
Preserve the core security constraints: bind bridge services to `127.0.0.1`, require bearer-token auth, and avoid exposing notebook state outside the active editor session. Treat changes to discovery, auth, or notebook visibility scope as architectural changes and review them accordingly.