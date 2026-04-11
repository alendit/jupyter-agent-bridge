import { ListResourcesResult } from "@modelcontextprotocol/sdk/types.js";
import {
  McpServer,
  ReadResourceTemplateCallback,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { NotebookBridgeClient } from "../bridge/NotebookBridgeClient";
import { NotebookReadOperations } from "./NotebookReadOperations";
import { ToolRequestExtra } from "./SessionSelection";

const JSON_MIME_TYPE = "application/json";

export const FIXED_RESOURCE_URIS = {
  activeSession: "jupyter://session/active",
  openNotebooks: "jupyter://notebooks/open",
} as const;

export const NOTEBOOK_RESOURCE_TEMPLATES = {
  outline: "jupyter://notebook/outline{?notebook_uri}",
  cells: "jupyter://notebook/cells{?notebook_uri}",
  snapshot: "jupyter://notebook/read{?notebook_uri}",
  state: "jupyter://notebook/state{?notebook_uri}",
  kernel: "jupyter://notebook/kernel{?notebook_uri}",
  variables: "jupyter://notebook/variables{?notebook_uri}",
  diagnostics: "jupyter://notebook/diagnostics{?notebook_uri}",
  symbols: "jupyter://notebook/symbols{?notebook_uri}",
  search: "jupyter://notebook/search{?notebook_uri,query}",
  cellOutputs: "jupyter://cell/outputs{?notebook_uri,cell_id}",
} as const;

type NotebookResourceTemplateKey = keyof typeof NOTEBOOK_RESOURCE_TEMPLATES;

export class NotebookResources {
  private readonly reads: NotebookReadOperations;

  public constructor(getClient: (extra: ToolRequestExtra) => Promise<NotebookBridgeClient>) {
    this.reads = new NotebookReadOperations(getClient);
  }

  public register(server: McpServer): void {
    server.registerResource(
      "active_session_summary",
      FIXED_RESOURCE_URIS.activeSession,
      {
        title: "Active Session Summary",
        description: "Read-only MCP shell view of the currently selected bridge session.",
        mimeType: JSON_MIME_TYPE,
      },
      async (_uri, extra) => this.jsonResource(FIXED_RESOURCE_URIS.activeSession, await this.reads.getSessionInfo(extra)),
    );

    server.registerResource(
      "open_notebook_list",
      FIXED_RESOURCE_URIS.openNotebooks,
      {
        title: "Open Notebook List",
        description: "Read-only list of notebooks visible through the selected bridge session.",
        mimeType: JSON_MIME_TYPE,
      },
      async (_uri, extra) =>
        this.jsonResource(FIXED_RESOURCE_URIS.openNotebooks, {
          notebooks: await this.reads.listOpenNotebooks(extra),
        }),
    );

    this.registerNotebookTemplate(
      server,
      "notebook_outline",
      "outline",
      "Read-only notebook outline resource.",
      async (uri, _variables, extra) => {
        const notebookUri = this.requiredQueryParam(uri, "notebook_uri");
        return this.jsonResource(uri.toString(), await this.reads.getNotebookOutline(notebookUri, extra));
      },
      (notebookUri) => buildNotebookScopedUri("jupyter://notebook/outline", notebookUri),
    );

    this.registerNotebookTemplate(
      server,
      "notebook_cells",
      "cells",
      "Read-only notebook cell preview resource.",
      async (uri, _variables, extra) => {
        const notebookUri = this.requiredQueryParam(uri, "notebook_uri");
        return this.jsonResource(
          uri.toString(),
          await this.reads.listNotebookCells({ notebook_uri: notebookUri }, extra),
        );
      },
      (notebookUri) => buildNotebookScopedUri("jupyter://notebook/cells", notebookUri),
    );

    this.registerNotebookTemplate(
      server,
      "notebook_snapshot",
      "snapshot",
      "Read-only notebook snapshot resource without outputs.",
      async (uri, _variables, extra) => {
        const notebookUri = this.requiredQueryParam(uri, "notebook_uri");
        return this.jsonResource(
          uri.toString(),
          await this.reads.readNotebook({ notebook_uri: notebookUri }, extra),
        );
      },
      (notebookUri) => buildNotebookScopedUri("jupyter://notebook/read", notebookUri),
    );

    this.registerNotebookTemplate(
      server,
      "notebook_state_summary",
      "state",
      "Read-only notebook state summary resource.",
      async (uri, _variables, extra) => {
        const notebookUri = this.requiredQueryParam(uri, "notebook_uri");
        return this.jsonResource(uri.toString(), await this.reads.summarizeNotebookState(notebookUri, extra));
      },
      (notebookUri) => buildNotebookScopedUri("jupyter://notebook/state", notebookUri),
    );

    this.registerNotebookTemplate(
      server,
      "notebook_kernel_info",
      "kernel",
      "Read-only notebook kernel info resource.",
      async (uri, _variables, extra) => {
        const notebookUri = this.requiredQueryParam(uri, "notebook_uri");
        return this.jsonResource(uri.toString(), await this.reads.getKernelInfo(notebookUri, extra));
      },
      (notebookUri) => buildNotebookScopedUri("jupyter://notebook/kernel", notebookUri),
    );

    this.registerNotebookTemplate(
      server,
      "notebook_variables",
      "variables",
      "Read-only notebook variable explorer resource.",
      async (uri, _variables, extra) => {
        const notebookUri = this.requiredQueryParam(uri, "notebook_uri");
        return this.jsonResource(
          uri.toString(),
          await this.reads.listVariables({ notebook_uri: notebookUri }, extra),
        );
      },
      (notebookUri) => buildNotebookScopedUri("jupyter://notebook/variables", notebookUri),
    );

    this.registerNotebookTemplate(
      server,
      "notebook_diagnostics",
      "diagnostics",
      "Read-only notebook diagnostics resource.",
      async (uri, _variables, extra) => {
        const notebookUri = this.requiredQueryParam(uri, "notebook_uri");
        return this.jsonResource(
          uri.toString(),
          await this.reads.getDiagnostics({ notebook_uri: notebookUri }, extra),
        );
      },
      (notebookUri) => buildNotebookScopedUri("jupyter://notebook/diagnostics", notebookUri),
    );

    this.registerNotebookTemplate(
      server,
      "notebook_symbols",
      "symbols",
      "Read-only notebook symbols resource.",
      async (uri, _variables, extra) => {
        const notebookUri = this.requiredQueryParam(uri, "notebook_uri");
        return this.jsonResource(
          uri.toString(),
          await this.reads.findSymbols({ notebook_uri: notebookUri }, extra),
        );
      },
      (notebookUri) => buildNotebookScopedUri("jupyter://notebook/symbols", notebookUri),
    );

    server.registerResource(
      "notebook_search",
      new ResourceTemplate(NOTEBOOK_RESOURCE_TEMPLATES.search, {
        list: undefined,
      }),
      {
        title: "Notebook Search",
        description: "Read-only notebook search resource. Requires notebook_uri and query parameters.",
        mimeType: JSON_MIME_TYPE,
      },
      async (uri, _variables, extra) => {
        const notebookUri = this.requiredQueryParam(uri, "notebook_uri");
        const query = this.requiredQueryParam(uri, "query");
        return this.jsonResource(
          uri.toString(),
          await this.reads.searchNotebook({ notebook_uri: notebookUri, query }, extra),
        );
      },
    );

    server.registerResource(
      "cell_outputs",
      new ResourceTemplate(NOTEBOOK_RESOURCE_TEMPLATES.cellOutputs, {
        list: async (extra) => this.listCellOutputResources(extra),
      }),
      {
        title: "Cell Outputs",
        description: "Read-only resource for outputs of notebook cells that currently have outputs.",
        mimeType: JSON_MIME_TYPE,
      },
      async (uri, _variables, extra) => {
        const notebookUri = this.requiredQueryParam(uri, "notebook_uri");
        const cellId = this.requiredQueryParam(uri, "cell_id");
        return this.jsonResource(
          uri.toString(),
          await this.reads.readCellOutputs({ notebook_uri: notebookUri, cell_id: cellId }, extra),
        );
      },
    );
  }

  private registerNotebookTemplate(
    server: McpServer,
    name: string,
    key: NotebookResourceTemplateKey,
    description: string,
    read: ReadResourceTemplateCallback,
    buildUri: (notebookUri: string) => string,
  ): void {
    server.registerResource(
      name,
      new ResourceTemplate(NOTEBOOK_RESOURCE_TEMPLATES[key], {
        list: async (extra) => this.listNotebookResources(extra, buildUri),
      }),
      {
        title: resourceTitleFromName(name),
        description,
        mimeType: JSON_MIME_TYPE,
      },
      read,
    );
  }

  private async listNotebookResources(
    extra: ToolRequestExtra,
    buildUri: (notebookUri: string) => string,
  ): Promise<ListResourcesResult> {
    const notebooks = await this.reads.listOpenNotebooks(extra);
    return {
      resources: notebooks.map((notebook) => ({
        uri: buildUri(notebook.notebook_uri),
        name: notebook.notebook_uri,
        title: notebook.notebook_uri,
        mimeType: JSON_MIME_TYPE,
      })),
    };
  }

  private async listCellOutputResources(extra: ToolRequestExtra): Promise<ListResourcesResult> {
    const notebooks = await this.reads.listOpenNotebooks(extra);
    const resources = [];

    for (const notebook of notebooks) {
      const cells = await this.reads.listNotebookCells({ notebook_uri: notebook.notebook_uri }, extra);
      for (const cell of cells.cells) {
        if (!cell.has_outputs) {
          continue;
        }

        resources.push({
          uri: buildCellOutputUri(notebook.notebook_uri, cell.cell_id),
          name: `${notebook.notebook_uri}#${cell.cell_id}`,
          title: `${cell.cell_id} outputs`,
          mimeType: JSON_MIME_TYPE,
        });
      }
    }

    return { resources };
  }

  private jsonResource(uri: string, value: unknown) {
    return {
      contents: [
        {
          uri,
          mimeType: JSON_MIME_TYPE,
          text: `${JSON.stringify(value, null, 2)}\n`,
        },
      ],
    };
  }

  private requiredQueryParam(uri: URL, key: string): string {
    const value = uri.searchParams.get(key);
    if (!value) {
      throw new Error(`Missing required query parameter "${key}" for resource ${uri.toString()}.`);
    }

    return value;
  }
}

function buildNotebookScopedUri(baseUri: string, notebookUri: string): string {
  const url = new URL(baseUri);
  url.searchParams.set("notebook_uri", notebookUri);
  return url.toString();
}

function buildCellOutputUri(notebookUri: string, cellId: string): string {
  const url = new URL("jupyter://cell/outputs");
  url.searchParams.set("notebook_uri", notebookUri);
  url.searchParams.set("cell_id", cellId);
  return url.toString();
}

function resourceTitleFromName(name: string): string {
  return name
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
