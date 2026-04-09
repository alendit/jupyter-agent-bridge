# Repository Guidelines

## Project Structure & Module Organization
This repository is currently spec-first: [`SPEC.md`](SPEC.md) is the source of truth, and implementation packages have not been scaffolded yet. The spec defines a three-part layout:

- `extension/src/` for the VS Code extension and notebook-domain services
- `frontend-mcp/src/` for the standalone MCP server
- `frontend-cli/src/` for the optional CLI adapter

Keep VS Code API usage isolated to `extension/`. Keep transport code in `bridge/` modules, domain types in `types/`, and protocol adapters out of notebook logic.

## Build, Test, and Development Commands
No `package.json` or task runner exists yet. Until scaffolding lands, the main review command is:

```sh
sed -n '1,220p' SPEC.md
```

Once packages are added, prefer workspace-level scripts instead of ad hoc commands. Expected commands should be introduced as:

- `npm run build` for compiling all packages
- `npm test` for unit and integration tests
- `npm run lint` for static checks

Add or update this file when the actual command surface changes.

## Coding Style & Naming Conventions
Use TypeScript for implementation. Follow the spec’s naming patterns: service classes such as `NotebookBridgeService`, transport clients such as `HttpJsonRpcBridgeClient`, and PascalCase filenames for class-oriented modules. Use clear separation between domain, bridge, MCP, and CLI concerns. Prefer short, explicit functions over shared stateful helpers.

## Testing Guidelines
The spec requires unit coverage for output normalization, cell ID persistence, JSON-RPC routing, auth validation, rendezvous parsing, and bridge error mapping. Integration tests should exercise the full VS Code-to-bridge flow, and MCP tests should cover session discovery and ambiguity handling. Name tests after behavior, for example `NotebookExecutionService.test.ts`.

## Commit & Pull Request Guidelines
This repository has no commit history yet, so no local convention is established. Start with short, imperative commit subjects such as `Add bridge client interface`. Keep PRs focused, reference the relevant `SPEC.md` section, and include any manual verification notes for notebook, bridge, or MCP behavior.

## Security & Configuration Tips
Preserve the core security constraints from the spec: bind bridge services to `127.0.0.1`, require bearer-token auth, and avoid exposing notebook state outside the active VS Code session. Treat `SPEC.md` changes as architectural changes and review them accordingly.