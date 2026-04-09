# SPEC.md — VS Code Notebook Bridge with MCP-First, CLI-Optional Frontends

## 1. Purpose

Provide a system that lets an agent work on **the live notebook open in VS Code** as a shared computational canvas.

The system must satisfy all of these simultaneously:

- the **agent** can read notebook state, edit cells, execute cells, and inspect results
- the **user** sees the same notebook update live in VS Code
- execution results are available both:
  - to the agent as structured tool results
  - to the user as persisted notebook outputs
- the implementation works with **VS Code’s notebook model and Jupyter integration**, not with a separate JupyterLab document model

This is **not** a general UI automation system. It is a bridge into the live VS Code notebook/session model.

---

## 1.1 MVP implementation target

To make the first implementation buildable, this spec targets a narrow MVP environment:

- VS Code desktop on the stable extension API
- TypeScript/Node-based extension and frontend packages
- local, file-backed notebooks with `notebookType === "jupyter-notebook"`
- one bridge session per VS Code window
- single-user local-machine trust boundaries only

Out of scope for the first implementation:

- VS Code web extensions
- remote SSH, dev container, Codespaces, or tunnel-based extension hosts
- non-file URI schemes
- non-Jupyter notebook types

Unsupported targets must fail explicitly with `UnsupportedEnvironment` or `UnsupportedNotebookType`. The extension must not silently fall back to partial behavior.

---

## 2. Product shape

The system has three layers:

1. **VS Code extension backend**  
   Owns access to the live notebook/editor/kernel state.

2. **Local bridge API**  
   Exposes the backend through localhost HTTP using JSON-RPC 2.0.

3. **External frontend(s)**  
   One or more client-facing adapters that call the bridge:
   - **MCP server** — primary frontend
   - **CLI tool** — optional secondary frontend

The system is therefore:

`Agent Host -> MCP or CLI -> Localhost HTTP JSON-RPC bridge -> VS Code extension -> VS Code Notebook API / Jupyter integration`

---

## 3. Frontend strategy

## 3.1 Primary frontend: MCP

The primary external integration surface is an **MCP server**.

Rationale:

- integrates naturally with **standard MCP-capable hosts**
- integrates naturally with **Cursor via standard MCP configuration**
- supports **automatic startup/managed lifecycle** in MCP-capable hosts
- provides a better experience across **multiple windows/workspaces**
- gives the tool a native “agent capability” shape inside editor-hosted agent workflows

This project is therefore **MCP-first** at the outermost interface.

---

## 3.2 Secondary frontend: CLI

A CLI frontend is optional and may be added later.

Rationale:

- useful for testing
- useful for scripting/debugging
- useful as a fallback client for the local bridge
- useful for environments where MCP host integration is unavailable or undesirable

However, the CLI is **not** the primary product surface.

---

## 3.3 Architectural consequence

The bridge/domain design must not depend on MCP-specific assumptions.

The correct separation is:

- **domain/backend logic** inside the extension
- **transport** as HTTP + JSON-RPC
- **frontend adapters** as MCP first, CLI optional

This ensures that the notebook logic is reusable regardless of the chosen external frontend.

---

## 3.4 Host compatibility rule

The notebook bridge and MCP protocol layer must remain host-agnostic.

Rules:

- do not depend on the VS Code Language Model API
- do not depend on VS Code chat participant APIs
- the core bridge contract must depend only on the standard MCP protocol plus host startup/configuration
- Cursor-specific APIs may be used only in a thin host-integration adapter that registers the bundled MCP server

Cursor compatibility is required.

For Cursor, the preferred integration is the Cursor extension MCP API, specifically `vscode.cursor.mcp.registerServer(...)`, used from the extension to register the bundled standalone MCP server. That Cursor-specific registration path must not leak into notebook services, bridge types, or the shared protocol package.

---

## 4. Topology

## 4.1 High-level topology

The architecture has four major parts:

1. **Agent host**  
   Usually VS Code agent mode, Cursor, or another MCP-capable environment.

2. **Standalone MCP server**  
   Launched by the host or by MCP config and exposes notebook tools.

3. **VS Code extension**  
   Runs inside the VS Code extension host and is the only component allowed to touch the live notebook/editor state.

4. **Optional CLI frontend**  
   Calls the same local bridge as the MCP server.

The normal communication path is:

`Agent Host -> MCP -> Standalone MCP Server -> Localhost HTTP bridge -> VS Code extension -> VS Code Notebook API / Jupyter integration`

The optional CLI path is:

`User or automation -> CLI -> Localhost HTTP bridge -> VS Code extension -> VS Code Notebook API / Jupyter integration`

---

## 5. Process model

## 5.1 In-process component

### VS Code extension

Runs inside the VS Code extension host.

Responsibilities:

- enumerate open notebooks and visible notebook editors
- resolve notebook handles to live `NotebookDocument` instances
- apply notebook edits
- observe notebook document changes and output changes
- trigger cell execution using VS Code/Jupyter integration
- collect and normalize cell outputs
- expose all of the above through a local bridge API

This is the **authoritative state owner**.

The extension is the only component that knows the real live notebook state.

---

## 5.2 Out-of-process components

### Standalone MCP server

Runs as a normal external process launched by the agent host.

Responsibilities:

- implement MCP over stdio or host-required transport
- discover and connect to a running VS Code bridge endpoint
- translate MCP tool calls into bridge RPC calls
- translate bridge responses into MCP tool results
- keep MCP/protocol concerns isolated from notebook logic

This process must **not** attempt to manage notebook state itself.

It is an adapter, not a source of truth.

### Optional CLI tool

Runs as a normal external executable.

Responsibilities:

- discover and connect to a running VS Code bridge endpoint
- translate command-line arguments into bridge RPC calls
- print structured JSON or human-readable summaries
- assist testing, automation, and debugging

The CLI must use the same bridge contract as the MCP server.

---

## 6. Bridge protocol

## 6.1 Transport

The VS Code extension exposes a **localhost HTTP** endpoint.

Constraints:

- bind to `127.0.0.1` only
- use an ephemeral port by default
- require authenticated requests
- do not expose the endpoint on non-loopback interfaces

---

## 6.2 RPC protocol

Use **JSON-RPC 2.0** over HTTP.

Examples:
- HTTP POST to `/rpc`
- JSON body containing JSON-RPC request/response objects

The rest of the system must not depend directly on JSON-RPC details.

JSON-RPC is a **transport binding**, not a domain API.

---

## 6.3 Abstraction requirement

All bridge interaction must be abstracted behind internal typed clients.

Both MCP and CLI frontends must depend on an interface like:

```ts
interface NotebookBridgeClient {
  listOpenNotebooks(): Promise<ListOpenNotebooksResult>;
  openNotebook(input: OpenNotebookRequest): Promise<OpenNotebookResult>;
  readNotebook(input: ReadNotebookRequest): Promise<ReadNotebookResult>;
  insertCell(input: InsertCellRequest): Promise<InsertCellResult>;
  replaceCellSource(input: ReplaceCellSourceRequest): Promise<ReplaceCellSourceResult>;
  deleteCell(input: DeleteCellRequest): Promise<DeleteCellResult>;
  moveCell(input: MoveCellRequest): Promise<MoveCellResult>;
  executeCells(input: ExecuteCellsRequest): Promise<ExecuteCellsResult>;
  readCellOutputs(input: ReadCellOutputsRequest): Promise<ReadCellOutputsResult>;
  getKernelInfo(input: GetKernelInfoRequest): Promise<GetKernelInfoResult>;
  summarizeNotebookState(input: SummarizeNotebookStateRequest): Promise<SummarizeNotebookStateResult>;
}
```

The MCP server and CLI must not contain hard-coded JSON-RPC transport logic inside domain handlers.

The system must preserve a clean separation between:

- **domain operations**: notebook actions
- **bridge protocol**: JSON-RPC over HTTP
- **frontend protocol**: MCP or CLI

---

## 6.4 MVP extension API strategy

The extension implementation must use public VS Code extension APIs only.

Required API families:

- notebook open/show APIs for loading and revealing documents
- notebook/editor change events for state tracking
- `WorkspaceEdit` plus `NotebookEdit` for all live mutations
- built-in notebook execution/cancel commands, wrapped behind a single adapter module

The extension must not depend on Jupyter private extension internals. If a behavior cannot be implemented through public APIs plus built-in commands, it is deferred rather than patched through unsupported integration points.

The overall product must not depend on host-only AI/editor APIs either. Specifically, the implementation must not require:

- VS Code Language Model API features
- VS Code chat participant APIs

Only the notebook extension uses VS Code APIs, and only for notebook access plus optional host integration. Cursor's MCP registration API is allowed only for bundling and auto-starting the standalone MCP server when the extension detects it is running inside Cursor.

---

## 7. Component responsibilities

## 7.1 VS Code extension responsibilities

The extension must provide a `NotebookBridgeService` that is responsible for all notebook-domain behavior.

Subservices:

- `NotebookRegistry`
- `NotebookReadService`
- `NotebookMutationService`
- `NotebookExecutionService`
- `OutputNormalizationService`
- `KernelInspectionService`
- `BridgeHttpServer`
- `RendezvousStore`

### NotebookRegistry
Responsible for:
- tracking open notebooks
- resolving notebook URIs
- identifying active/visible notebook editors
- correlating notebook documents with editors

### NotebookReadService
Responsible for:
- reading notebook metadata
- reading ordered cell contents
- reading execution summaries
- reading outputs from the live document

### NotebookMutationService
Responsible for:
- inserting cells
- deleting cells
- moving cells
- replacing sources
- applying metadata changes

### NotebookExecutionService
Responsible for:
- executing cells
- waiting for execution completion
- correlating execution requests with resulting outputs
- collecting status and timing information
- handling timeout / cancellation / error mapping

### OutputNormalizationService
Responsible for:
- converting VS Code cell output structures into normalized domain payloads
- extracting text, JSON, HTML, image, error bundles
- preserving enough fidelity for downstream reasoning

### KernelInspectionService
Responsible for:
- reading best-effort kernel information
- reporting selected kernel/controller identity when available
- reporting executable/not executable state

### BridgeHttpServer
Responsible for:
- hosting localhost HTTP
- JSON-RPC request routing
- auth enforcement
- session lifecycle
- no notebook logic

### RendezvousStore
Responsible for:
- writing session discovery records
- removing them on shutdown
- exposing enough metadata for external frontends to attach to the correct VS Code session

---

## 7.2 Standalone MCP server responsibilities

The standalone MCP server must contain:

- `BridgeDiscovery`
- `BridgeSessionClient`
- `NotebookTools`
- `McpServerMain`

### BridgeDiscovery
Responsible for:
- locating active VS Code bridge endpoints
- selecting an appropriate session
- obtaining auth material

### BridgeSessionClient
Responsible for:
- HTTP + JSON-RPC transport
- retries / connection errors / protocol errors
- exposing a clean typed `NotebookBridgeClient`

### NotebookTools
Responsible for:
- MCP tool schema definitions
- mapping MCP requests to typed bridge client calls
- shaping responses for the agent host

### McpServerMain
Responsible for:
- MCP lifecycle
- tool registration
- startup/shutdown behavior
- compatibility with MCP-capable hosts

The MCP server must not know anything about VS Code APIs.

---

## 7.3 Optional CLI responsibilities

The optional CLI frontend must contain:

- `BridgeDiscovery`
- `BridgeSessionClient`
- `CommandHandlers`
- `CliMain`

### CommandHandlers
Responsible for:
- mapping CLI arguments to typed bridge client calls
- shaping output in JSON or concise human-readable form

### CliMain
Responsible for:
- argument parsing
- command dispatch
- exit codes
- output formatting

The CLI must not know anything about VS Code APIs.

---

## 8. Discovery and session binding

## 8.1 Discovery problem

The MCP server is launched externally by the host.

Therefore the MCP server must be able to discover a matching VS Code extension bridge instance.

The extension cannot be the only lifecycle owner of the MCP server.

The same discovery mechanism must also be usable by the optional CLI.

---

## 8.2 Rendezvous mechanism

The extension writes a **rendezvous record** to a known local directory.

The extension and all frontends must compute this directory through a shared helper so discovery logic is identical everywhere.

Default base directories:
- macOS: `~/Library/Caches/jupyter-mcp/sessions`
- Linux: `$XDG_STATE_HOME/jupyter-mcp/sessions`, falling back to `~/.local/state/jupyter-mcp/sessions`
- Windows: `%LOCALAPPDATA%\\jupyter-mcp\\sessions`

Rules:
- one record per active VS Code window/workspace session
- filename is `<session_id>.json`
- create the directory with user-only permissions where the platform supports it
- create each record file with user-only permissions where the platform supports it
- write the file on startup and refresh `last_seen_at` on a short heartbeat
- frontends ignore records older than 15 seconds and may additionally verify that `pid` is still alive

Example contents:

```json
{
  "session_id": "d2d8d0d1-3f8d-4ff1-b761-0f2f0b6f1e8a",
  "workspace_id": "file:///workspace/foo",
  "workspace_folders": ["file:///workspace/foo"],
  "window_title": "foo",
  "bridge_url": "http://127.0.0.1:43127/rpc",
  "auth_token": "opaque-secret",
  "capabilities": {
    "execute_cells": true,
    "interrupt_execution": false,
    "restart_kernel": false
  },
  "pid": 12345,
  "created_at": "2026-03-29T12:00:00Z",
  "last_seen_at": "2026-03-29T12:00:05Z"
}
```

The external frontend uses this to discover and connect to a live bridge.

---

## 8.3 Session selection

If more than one active VS Code bridge exists, the MCP server or CLI selects one using:

1. explicit session/workspace argument, if provided
2. current workspace/cwd match
3. single available session
4. otherwise fail with a clear ambiguity error

The frontend must not guess silently when multiple plausible workspaces exist.

---

## 8.4 Multiple-window rationale for MCP

One reason MCP is the primary frontend is that MCP-capable hosts already provide a more natural environment for:

- associating tools with the active editor/workspace
- auto-starting tools
- managing per-project configuration
- presenting tool availability in the host's agent/tool UI

This makes multi-window and multi-workspace operation more natural than a prompt-only CLI workflow.

The bridge still remains the real session authority.

---

## 9. Security model

## 9.1 Local-only exposure
The bridge must bind to `127.0.0.1` only.

## 9.2 Authentication
Every bridge request must include an auth token.

Suggested mechanism:
- `Authorization: Bearer <token>`

## 9.3 Session isolation
Each VS Code window/workspace should use a distinct session ID and token.

## 9.4 Threat model
This system assumes local-machine trust boundaries, but still treats loopback services as requiring auth because other local processes may exist.

## 9.5 Scope restriction
The extension should only expose notebooks that are open in the current VS Code session, or explicitly opened through the bridge.

---

## 10. Source-of-truth invariants

The implementation must preserve these invariants:

1. **Authoritative state lives in VS Code**  
   The live `NotebookDocument` is the source of truth.

2. **No shadow notebook model**  
   External frontends must not maintain their own authoritative notebook representation.

3. **Visible consistency**  
   If the frontend returns that a cell was changed or executed, the user-visible notebook must reflect that same result.

4. **Execution consistency**  
   Returned execution outputs must be derived from the notebook’s live output model.

5. **Stable addressing**  
   Cells must be addressable by stable IDs rather than only positional indices.

6. **Transport replaceability**  
   Switching from JSON-RPC/HTTP to another transport must not require rewriting notebook-domain logic.

7. **Frontend replaceability**  
   Adding or removing MCP/CLI frontends must not require redesigning the extension domain layer.

---

## 11. Domain model

## 11.1 Notebook handle

Primary notebook identifier:
- notebook URI string

Secondary metadata:
- notebook type
- dirty state
- active editor presence
- visible editor count

---

## 11.2 Cell handle

Cells must be represented using a stable `cell_id`.

### Cell ID strategy
If a native stable ID exists, use it.

Otherwise the extension generates a stable ID and persists it in cell metadata under a dedicated namespace, for example:

```json
{
  "jupyterMcp": {
    "cellId": "c_000017"
  }
}
```

Indices may be returned for convenience but must not be the primary mutation handle.

---

## 11.3 Metadata namespace

The extension-owned metadata namespace is `jupyterMcp`.

Rules:
- only extension-owned fields live under this key
- the MVP stores `cellId` here when the notebook format does not provide a stable cell identifier
- existing user metadata outside this namespace must be preserved verbatim

## 11.4 Notebook revision model

Each open notebook receives an in-memory monotonically increasing `notebook_version`.

Rules:
- initialize the version when the notebook is first registered
- increment it whenever `onDidChangeNotebookDocument` fires for that document
- include the current `notebook_version` in every successful read, mutation, and execution response
- mutating and execution requests may include `expected_notebook_version`
- if `expected_notebook_version` is provided and does not match current state, fail with `NotebookChanged`

The version exists to make concurrent edits explicit. It is not persisted into the notebook file.

## 11.5 Mutation serialization

All mutating and execution requests are serialized per notebook through an async queue inside the extension.

Rules:
- reads may run concurrently
- writes for different notebooks may run concurrently
- writes and executions for the same notebook must not overlap
- the MVP does not attempt automatic merge behavior between user edits and agent edits

---

## 12. Supported operations

All concrete request and response bodies used by the build are defined later in this spec. Section 12 names the required operations; sections 26 through 29 define the exact implementation contract.

## 12.1 Discovery operations

### `list_open_notebooks`
Return:
- notebook URI
- notebook type
- dirty state
- active editor boolean
- visible editor count
- selected kernel label/id if known

### `open_notebook`
Input:
- absolute notebook URI

Behavior:
- open in VS Code
- return notebook metadata

---

## 12.2 Read operations

### `read_notebook`
Input:
- notebook URI
- optional cell range
- optional include outputs flag

Return:
- notebook metadata
- ordered cells
- for each cell:
  - `cell_id`
  - index
  - kind
  - language
  - source
  - metadata
  - execution summary if available
  - normalized outputs if requested

### `read_cell_outputs`
Input:
- notebook URI
- `cell_id`

Return:
- normalized outputs only

### `summarize_notebook_state`
Input:
- notebook URI

Return:
- concise machine-readable state:
  - last executed cells
  - cells with errors
  - cells with images
  - dirty state
  - kernel summary

---

## 12.3 Mutation operations

### `insert_cell`
Input:
- notebook URI
- position
- kind
- language
- source
- optional metadata

### `replace_cell_source`
Input:
- notebook URI
- `cell_id`
- new source

### `delete_cell`
Input:
- notebook URI
- `cell_id`

### `move_cell`
Input:
- notebook URI
- `cell_id`
- target index

### `set_cell_kind`
Input:
- notebook URI
- `cell_id`
- kind
- optional language

### `update_notebook_metadata`
Input:
- notebook URI
- metadata patch

Rules:
- all edits must go through notebook edit APIs
- raw file rewriting is forbidden for live mutations
- return updated handles/state after mutation

---

## 12.4 Execution operations

### `execute_cells`
Input:
- notebook URI
- list of `cell_id`s
- optional `wait_for_completion` default `true`
- optional `timeout_ms`
- optional `stop_on_error` default `true`

Return:
- per-cell status
- execution order if available
- start/end time if available
- normalized outputs
- error details if any
- kernel identity summary

### `interrupt_execution`
Input:
- notebook URI

Return:
- status

### `restart_kernel`
Input:
- notebook URI

Return:
- status

MVP may implement `execute_cells` first and leave interrupt/restart for later if execution control surface is not yet reliable.

---

## 12.5 Kernel operations

### `get_kernel_info`
Input:
- notebook URI

Return best-effort:
- selected kernel label
- provider/controller identity if known
- language
- status
- executable state

### `select_kernel`
Input:
- notebook URI
- kernel selector

This is optional for MVP.

Read-only kernel inspection is higher priority than programmatic kernel switching.

---

## 13. Output normalization

Outputs must be normalized into a transport-safe and model-consumable schema.

Supported normalized kinds:

- `text`
- `markdown`
- `json`
- `html`
- `image`
- `error`
- `unknown`

Examples:

```json
{
  "kind": "text",
  "mime": "text/plain",
  "text": "42"
}
```

```json
{
  "kind": "image",
  "mime": "image/png",
  "base64": "<...>"
}
```

```json
{
  "kind": "error",
  "ename": "ValueError",
  "evalue": "bad input",
  "traceback": ["..."]
}
```

Normalization requirements:

- preserve MIME type
- preserve ordering
- avoid lossy conversion when practical
- keep payloads bounded where necessary
- include truncation metadata if output is trimmed

MVP transport limits:

- at most 200 normalized output items per cell
- at most 64 KiB of UTF-8 text for any one text, markdown, or html item
- at most 256 KiB of serialized JSON for any one json item
- at most 1 MiB raw bytes for any one image item before base64 encoding

If truncation happens, it must happen in the extension before transport and the normalized output must include:
- `truncated`
- `original_bytes`
- `returned_bytes`

---

## 14. Execution semantics

## 14.1 Visibility rule
Execution is notebook-visible by default.

If a cell is executed through the bridge, its outputs must appear in the notebook.

## 14.2 No hidden state mutation
The agent must not rely on invisible state changes that are not represented in the notebook, unless a future explicit ephemeral mode is introduced.

## 14.3 Correlation
The extension must correlate an execution request with the resulting outputs and status it returns.

## 14.4 Status model
Per-cell execution status must use a normalized state machine:

- `queued`
- `running`
- `succeeded`
- `failed`
- `cancelled`
- `timed_out`

---

## 15. Bridge RPC surface

The bridge should expose JSON-RPC methods corresponding to domain operations.

Required MVP methods:

- `bridge.get_session_info`
- `notebook.list_open`
- `notebook.open`
- `notebook.read`
- `notebook.insert_cell`
- `notebook.replace_cell_source`
- `notebook.delete_cell`
- `notebook.move_cell`
- `notebook.execute_cells`
- `notebook.read_cell_outputs`
- `notebook.get_kernel_info`
- `notebook.summarize_state`

The exact wire names are fixed for the first implementation and are restated in section 28.

The domain layer must not depend on JSON-RPC method name strings scattered throughout the codebase.

---

## 16. MCP surface

The MCP server exposes a tool layer mirroring the notebook-domain capabilities.

Suggested MCP tools:

- `list_open_notebooks`
- `open_notebook`
- `read_notebook`
- `insert_cell`
- `replace_cell_source`
- `delete_cell`
- `move_cell`
- `execute_cells`
- `read_cell_outputs`
- `get_kernel_info`
- `summarize_notebook_state`

The MCP tool contracts should be near-isomorphic to the domain API to minimize impedance mismatch.

The MCP frontend is the preferred integration for host-driven agent workflows in Cursor and other MCP-capable editors.

---

## 17. Optional CLI surface

Suggested CLI commands:

```text
vscode-notebook-bridge sessions list
vscode-notebook-bridge notebooks list
vscode-notebook-bridge notebooks open --uri <uri>
vscode-notebook-bridge notebooks read --uri <uri>
vscode-notebook-bridge cells insert ...
vscode-notebook-bridge cells replace ...
vscode-notebook-bridge cells delete ...
vscode-notebook-bridge cells move ...
vscode-notebook-bridge cells execute ...
vscode-notebook-bridge cells outputs ...
vscode-notebook-bridge kernel info --uri <uri>
```

The CLI is primarily for:
- testing
- debugging
- scripting
- fallback operation outside MCP-capable hosts

---

## 18. Error model

Errors must be normalized at two levels:

## 18.1 Bridge/domain errors
Canonical domain error codes:

- `NotebookNotFound`
- `NotebookNotOpen`
- `CellNotFound`
- `KernelUnavailable`
- `KernelSelectionFailed`
- `ExecutionFailed`
- `ExecutionTimedOut`
- `InvalidRequest`
- `NotebookBusy`
- `NotebookChanged`
- `UnsupportedNotebookType`
- `UnsupportedEnvironment`
- `PermissionDenied`
- `AmbiguousSession`
- `BridgeUnavailable`
- `AuthenticationFailed`

Each must include:
- `code`
- `message`
- optional `detail`
- optional `recoverable`

## 18.2 Protocol errors
Transport/protocol failures must be mapped separately:
- HTTP connection failure
- auth failure
- malformed JSON-RPC response
- method not found
- timeout

These must be converted into clear MCP-facing or CLI-facing failures.

---

## 19. Implementation structure

Suggested repo/module structure:

```text
vscode-notebook-bridge/
  package.json
  tsconfig.base.json
  extension/
    package.json
    src/
      extension.ts
      commands/
        NotebookCommandAdapter.ts
      cursor/
        CursorMcpRegistrar.ts
      bridge/
        BridgeHttpServer.ts
        JsonRpcRouter.ts
        Auth.ts
        RendezvousStore.ts
      notebook/
        NotebookBridgeService.ts
        NotebookRegistry.ts
        NotebookReadService.ts
        NotebookMutationService.ts
        NotebookExecutionService.ts
        OutputNormalizationService.ts
        KernelInspectionService.ts
      types/
        domain.ts
        bridge.ts

  packages/
    protocol/
      package.json
      src/
        domain.ts
        errors.ts
        rpc.ts

  frontend-mcp/
    package.json
    src/
      main.ts
      mcp/
        NotebookTools.ts
      bridge/
        BridgeDiscovery.ts
        HttpJsonRpcBridgeClient.ts
        NotebookBridgeClient.ts
      types/
        domain.ts
        mcp.ts

  tests/
    integration/
    fixtures/
```

Design constraints:

- `packages/protocol` is the only shared source of domain and RPC types
- bridge request payloads are validated at runtime before entering notebook services
- transport adapters are separate
- MCP and JSON-RPC code are separate
- VS Code API usage is isolated to the extension package
- CLI can be added later without changing extension service boundaries

---

## 20. Lifecycle

## 20.1 Extension startup
On activation, the extension:

1. starts the localhost HTTP bridge
2. generates session ID + auth token
3. writes rendezvous record
4. begins serving bridge requests

## 20.2 MCP server startup
On launch, the MCP frontend:

1. reads rendezvous records
2. selects a target session
3. authenticates to the bridge
4. exposes MCP tools backed by the bridge

Host-specific startup notes:

- in Cursor, the extension should register the bundled standalone MCP server through `vscode.cursor.mcp.registerServer(...)`
- on extension deactivation, the Cursor integration should unregister that server if the API supports `unregisterServer(...)`
- in other MCP-capable hosts, use the host's normal MCP server configuration mechanism
- no VS Code language-model API or chat participant API is required for startup

## 20.3 Optional CLI startup
On launch, the CLI frontend:

1. reads rendezvous records
2. selects a target session
3. authenticates to the bridge
4. executes the requested command against the bridge

## 20.4 Extension shutdown
On shutdown, the extension:

1. stops the HTTP server
2. removes or invalidates rendezvous record
3. rejects new bridge requests

## 20.5 Frontend behavior on bridge loss
If bridge connectivity is lost:
- fail active requests cleanly
- surface `BridgeUnavailable`
- optionally retry briefly for transient VS Code reload scenarios

---

## 21. MVP scope

The shipping MVP must implement:

- VS Code extension backend
- localhost HTTP bridge
- JSON-RPC transport
- rendezvous discovery
- auth token enforcement
- MCP frontend
- Cursor-compatible bundled MCP startup via the Cursor extension MCP registration API
- list/open/read notebook
- insert/replace/delete/move cell
- execute cells
- read normalized outputs
- basic kernel info
- summarize notebook state

The shipping MVP does **not** need:

- CLI frontend
- websocket transport
- remote access
- multi-client coordination
- arbitrary UI automation
- general non-notebook editor control
- kernel switching
- streaming output events

CLI is a deferred secondary frontend, not an MVP requirement.

Build order for the MVP:

1. `packages/protocol` plus extension read-only bridge
2. extension mutation services plus cell ID persistence
3. execution plus output normalization
4. MCP frontend wired to the bridge

The extension must be buildable and testable after step 3 even if the MCP frontend is not yet complete.

---

## 22. Deferred features

Potential future additions:

- CLI frontend
- streaming execution progress/events
- image size negotiation / binary blob offloading
- explicit ephemeral execution mode
- multi-window arbitration UX
- remote bridge access with stronger auth
- non-Jupyter notebook type support
- collaborative concurrency control between user edits and agent edits

---

## 23. Testing strategy

## 23.1 Unit tests
Cover:
- output normalization
- cell ID generation/persistence
- JSON-RPC request routing
- auth validation
- rendezvous parsing
- bridge client error mapping

## 23.2 Integration tests
End-to-end flow:

1. launch VS Code test instance with extension
2. open notebook
3. discover bridge
4. call bridge over HTTP/JSON-RPC
5. insert markdown cell
6. insert code cell
7. execute code cell
8. verify:
   - response contains outputs
   - notebook document contains outputs
   - reread returns same outputs

## 23.3 MCP integration tests
Must include:
- MCP frontend startup from config
- session selection with one active window
- session ambiguity with multiple windows
- successful tool invocation through MCP host-compatible lifecycle

## 23.4 Manual tests
Must include:
- multiple open workspaces
- notebook already open in editor
- user editing while agent operates
- execution error
- image output
- kernel restart
- bridge token invalidation
- VS Code reload while MCP server remains running
- Cursor bundled MCP registration and auto-start behavior, plus equivalent host-managed startup where configured

---

## 24. Resolved MVP decisions

1. Execute notebook cells through public VS Code APIs and built-in notebook commands wrapped by `NotebookCommandAdapter`. Do not call Jupyter private internals.
2. Kernel/controller IDs are optional. The contract must work when only a display label is available.
3. Serialize all mutating and execution work per notebook in the MVP.
4. Use `notebook_version` plus optional `expected_notebook_version` for concurrency control. Do not silently merge conflicting writes.
5. Apply output truncation in the extension before the payload crosses the bridge.
6. Keep session selection host-agnostic: explicit session ID, then workspace match, then single available session, otherwise `AmbiguousSession`.
7. Keep editor-host integration isolated: core notebook services stay host-agnostic, while Cursor may use its MCP extension API only to register the bundled standalone MCP server.

## 24.1 Remaining non-blocking questions

- Can kernel restart be supported portably enough for MVP+1 without depending on host-specific behavior?
- Should remote workspace support use a different discovery/auth mechanism than local rendezvous files?

---

## 25. Final architecture decision

This project is built around these fixed decisions:

- the **VS Code extension owns live notebook state**
- the **extension exposes a localhost HTTP bridge**
- the **bridge protocol is JSON-RPC**
- the **JSON-RPC transport is abstracted behind a typed domain client**
- the **MCP frontend is the primary external integration surface**
- the **CLI frontend is optional and secondary**
- the **notebook is the shared visible record for both agent and user**

Any implementation that bypasses the live VS Code notebook model is out of scope.

---

## 26. Build-ready implementation contract

## 26.1 Package and tooling decisions

The first implementation should use:

- npm workspaces for repo-level package management
- TypeScript everywhere
- a shared `packages/protocol` package for domain types, error types, and JSON-RPC method names
- `@vscode/test-electron` for extension integration tests

The extension should activate when a Jupyter notebook is opened and may also expose a manual bridge-start command for debugging.

If the extension detects the Cursor MCP extension API at runtime, it should register the bundled standalone MCP server automatically. This integration must be runtime-guarded so the same extension still works in plain VS Code without Cursor symbols present.

Implementation notes for Cursor support:

- define Cursor MCP API typings through local TypeScript module augmentation for `vscode`
- feature-detect the API at runtime before calling it
- keep all Cursor-specific code inside `CursorMcpRegistrar`
- register a stable MCP server name so repeated activations replace or refresh the same registration instead of creating duplicates

## 26.2 Extension runtime behavior

The extension must implement these behaviors exactly:

1. Maintain a `NotebookRegistry` keyed by normalized notebook URI.
2. On first read or write of a notebook, ensure every cell has a stable `cell_id`. If IDs are missing, write them back through `NotebookEdit.updateCellMetadata` before answering the request.
3. Resolve all `cell_id` values to current indices immediately before each mutation or execution.
4. Apply cell edits only through `WorkspaceEdit` plus `NotebookEdit`.
5. Execute cells by converting target cell IDs into `NotebookRange` values and invoking the built-in execution command through `NotebookCommandAdapter`.
6. Wait for execution completion by observing notebook change events until every requested cell reaches a terminal state or the request timeout expires.
7. Return a fresh snapshot from live notebook state after every successful mutation or execution.

Specific MVP rules:

- `open_notebook` accepts an absolute notebook URI only
- `execute_cells` supports code cells only; markdown cells in the request cause `InvalidRequest`
- `wait_for_completion=false` is not part of the MVP; reject it with `InvalidRequest`
- `interrupt_execution`, `restart_kernel`, and `select_kernel` are explicitly deferred even if placeholders exist in the protocol
- if `vscode.cursor.mcp.registerServer` is available, use it to register the bundled MCP server instead of requiring manual Cursor MCP config
- the Cursor registration must use stdio transport and launch the bundled `frontend-mcp` entrypoint, not a second embedded notebook implementation

## 26.3 Summary-oriented operations

`summarize_notebook_state` must return a compact machine-readable structure rather than prose.

Required fields:

- `dirty`
- `kernel`
- `last_executed_cell_ids`
- `cells_with_errors`
- `cells_with_images`
- `active_cell_id` if an active editor is available

The summary should cap each cell ID list at 20 items.

---

## 27. Concrete domain contracts

The extension and the MCP frontend must share domain contracts equivalent to the following TypeScript interfaces:

```ts
export type NotebookCellKind = "markdown" | "code";
export type OutputKind = "text" | "markdown" | "json" | "html" | "image" | "error" | "unknown";
export type ExecutionStatus =
  | "idle"
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "timed_out";

export interface BridgeError {
  code:
    | "AuthenticationFailed"
    | "AmbiguousSession"
    | "BridgeUnavailable"
    | "CellNotFound"
    | "ExecutionFailed"
    | "ExecutionTimedOut"
    | "InvalidRequest"
    | "KernelSelectionFailed"
    | "KernelUnavailable"
    | "NotebookBusy"
    | "NotebookChanged"
    | "NotebookNotFound"
    | "NotebookNotOpen"
    | "PermissionDenied"
    | "UnsupportedEnvironment"
    | "UnsupportedNotebookType";
  message: string;
  detail?: unknown;
  recoverable?: boolean;
}

export interface KernelInfo {
  kernel_label: string | null;
  kernel_id: string | null;
  language: string | null;
  execution_supported: boolean;
  state: "unknown" | "idle" | "busy";
}

export interface NotebookSummary {
  notebook_uri: string;
  notebook_type: string;
  notebook_version: number;
  dirty: boolean;
  active_editor: boolean;
  visible_editor_count: number;
  kernel: KernelInfo | null;
}

export interface CellExecutionSummary {
  status: ExecutionStatus;
  execution_order: number | null;
  started_at: string | null;
  ended_at: string | null;
}

export interface NormalizedOutput {
  kind: OutputKind;
  mime: string | null;
  text?: string;
  json?: unknown;
  html?: string;
  base64?: string;
  ename?: string;
  evalue?: string;
  traceback?: string[];
  truncated?: boolean;
  original_bytes?: number;
  returned_bytes?: number;
}

export interface CellSnapshot {
  cell_id: string;
  index: number;
  kind: NotebookCellKind;
  language: string | null;
  source: string;
  metadata: Record<string, unknown>;
  execution: CellExecutionSummary | null;
  outputs?: NormalizedOutput[];
}

export interface NotebookSnapshot {
  notebook: NotebookSummary;
  cells: CellSnapshot[];
}

export interface OpenNotebookRequest {
  notebook_uri: string;
  view_column?: "active" | "beside";
}

export interface ReadNotebookRequest {
  notebook_uri: string;
  include_outputs?: boolean;
  range?: { start: number; end: number };
  cell_ids?: string[];
}

export interface InsertCellRequest {
  notebook_uri: string;
  expected_notebook_version?: number;
  position:
    | { before_index: number }
    | { before_cell_id: string }
    | { after_cell_id: string }
    | { at_end: true };
  cell: {
    kind: NotebookCellKind;
    language?: string | null;
    source: string;
    metadata?: Record<string, unknown>;
  };
}

export interface ReplaceCellSourceRequest {
  notebook_uri: string;
  cell_id: string;
  expected_notebook_version?: number;
  source: string;
}

export interface DeleteCellRequest {
  notebook_uri: string;
  cell_id: string;
  expected_notebook_version?: number;
}

export interface MoveCellRequest {
  notebook_uri: string;
  cell_id: string;
  expected_notebook_version?: number;
  target_index: number;
}

export interface ReadCellOutputsRequest {
  notebook_uri: string;
  cell_id: string;
}

export interface ExecuteCellsRequest {
  notebook_uri: string;
  cell_ids: string[];
  expected_notebook_version?: number;
  timeout_ms?: number;
  wait_for_completion?: true;
}

export interface NotebookStateSummary {
  notebook_uri: string;
  notebook_version: number;
  dirty: boolean;
  kernel: KernelInfo | null;
  last_executed_cell_ids: string[];
  cells_with_errors: string[];
  cells_with_images: string[];
  active_cell_id?: string;
}
```

All successful mutation operations must return a fresh `NotebookSnapshot`. `execute_cells` must return per-cell execution results plus the final `notebook_version`.

---

## 28. Required JSON-RPC surface

The JSON-RPC method names for the first implementation are fixed:

- `bridge.get_session_info`
- `notebook.list_open`
- `notebook.open`
- `notebook.read`
- `notebook.insert_cell`
- `notebook.replace_cell_source`
- `notebook.delete_cell`
- `notebook.move_cell`
- `notebook.execute_cells`
- `notebook.read_cell_outputs`
- `notebook.get_kernel_info`
- `notebook.summarize_state`

Method rules:

- every request is an HTTP `POST` to `/rpc`
- every request except `bridge.get_session_info` requires `Authorization: Bearer <token>`
- `bridge.get_session_info` may require auth as well; if so, discovery must provide the token first
- JSON-RPC transport errors remain transport errors and must not be remapped into fake domain success payloads

`bridge.get_session_info` returns:

- `session_id`
- `workspace_id`
- `workspace_folders`
- `bridge_url`
- `extension_version`
- `capabilities`

The frontend must use this method as its first smoke test after rendezvous discovery.

For Cursor integration, the standalone MCP server must be launchable from the extension's Cursor MCP registration adapter without requiring VS Code language-model or chat APIs.

---

## 29. Acceptance criteria for the extension build

The extension portion is ready to implement when these criteria are treated as the definition of done:

1. Opening a Jupyter notebook starts the bridge and writes a live rendezvous record.
2. A typed bridge client can discover the session, authenticate, and call `notebook.list_open`.
3. `open_notebook` plus `read_notebook` return stable `cell_id` values and `notebook_version`.
4. `insert_cell`, `replace_cell_source`, `delete_cell`, and `move_cell` visibly change the notebook in VS Code and return a fresh snapshot.
5. `execute_cells` returns normalized outputs that match what the user sees persisted in the notebook.
6. Concurrent writes to the same notebook are serialized and version mismatches fail explicitly.
7. Stale rendezvous records are ignored.
8. Unsupported environments fail clearly without partial success.
9. When running inside Cursor, the extension can register and auto-start its bundled MCP server through the Cursor MCP extension API and still reaches the same bridge contract as any other host.

Once the extension satisfies section 29, the MCP frontend can be built against the fixed bridge contract without redesigning the notebook services.