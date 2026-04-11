# Smoke Workspace

Run the full manual dev-host check with:

```sh
npm run dev:host
```

That command rebuilds the repo, launches an Extension Development Host, and opens `demo.ipynb`.

Manual checks:

1. Run `Jupyter Agent Bridge: Start Bridge`.
2. Confirm the info message shows a localhost bridge URL.
3. Confirm a rendezvous record appears under the platform session directory described in `docs/ARCHITECTURE.md`.
4. In Cursor, confirm the extension registers the bundled MCP server if the Cursor MCP API is available.
