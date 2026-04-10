# Repository Guidelines

## Project Structure & Module Organization
[`SPEC.md`](SPEC.md) remains the source of truth, but the workspace is now scaffolded. The live packages are:

- `extension/src/` for the VS Code extension and notebook-domain services
- `frontend-mcp/src/` for the standalone MCP server
- `packages/protocol/src/` for shared bridge and domain types

Keep VS Code API usage isolated to `extension/`. Keep transport code in `bridge/` modules, domain types in `types/`, and protocol adapters out of notebook logic.

## Build, Test, and Development Commands
- `npm run build` for compiling all packages
- `npm run typecheck` for workspace TypeScript verification
- `npm test` for unit and integration tests

When you change the bridge or MCP tool surface, update `SPEC.md`, the focused tests for the touched package, and this file if the workspace command surface or package layout changes.

## Coding Style & Naming Conventions
Use TypeScript for implementation. Follow the spec’s naming patterns: service classes such as `NotebookBridgeService`, transport clients such as `HttpJsonRpcBridgeClient`, and PascalCase filenames for class-oriented modules. Use clear separation between domain, bridge, MCP, and CLI concerns. Prefer short, explicit functions over shared stateful helpers.

## Testing Guidelines
The spec requires unit coverage for output normalization, cell ID persistence, JSON-RPC routing, auth validation, rendezvous parsing, and bridge error mapping. Integration tests should exercise the full VS Code-to-bridge flow, and MCP tests should cover session discovery and ambiguity handling.

Prefer:

- focused package tests first, for example `npm --workspace extension test` or `npm --workspace frontend-mcp test`
- then `npm run typecheck`
- then `npm test` before committing

When notebook execution completion rules change, keep the decision logic in a pure helper with a direct unit test so it can be validated without a live VS Code host.

## Commit & Pull Request Guidelines
This repository has no commit history yet, so no local convention is established. Start with short, imperative commit subjects such as `Add bridge client interface`. Keep PRs focused, reference the relevant `SPEC.md` section, and include any manual verification notes for notebook, bridge, or MCP behavior.

## Security & Configuration Tips
Preserve the core security constraints from the spec: bind bridge services to `127.0.0.1`, require bearer-token auth, and avoid exposing notebook state outside the active VS Code session. Treat `SPEC.md` changes as architectural changes and review them accordingly.