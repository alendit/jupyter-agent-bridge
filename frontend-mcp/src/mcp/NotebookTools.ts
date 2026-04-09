import {
  DeleteCellRequest,
  ExecuteCellsRequest,
  InsertCellRequest,
  OpenNotebookRequest,
  ReadCellOutputsRequest,
  ReadNotebookRequest,
  ReplaceCellSourceRequest,
  MoveCellRequest,
} from "../../../packages/protocol/src";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { NotebookBridgeClient } from "../bridge/NotebookBridgeClient";

export class NotebookTools {
  public constructor(private readonly getClient: () => Promise<NotebookBridgeClient>) {}

  public register(server: McpServer): void {
    server.registerTool(
      "list_open_notebooks",
      {
        title: "List Open Notebooks",
        description: "List open Jupyter notebooks visible to the live VS Code bridge.",
        inputSchema: {},
      },
      async () => this.toToolResult(await (await this.getClient()).listOpenNotebooks()),
    );

    server.registerTool(
      "open_notebook",
      {
        title: "Open Notebook",
        description: "Open a notebook in the live VS Code session.",
        inputSchema: {
          notebook_uri: z.string().optional(),
          path: z.string().optional(),
          view_column: z.enum(["active", "beside"]).optional(),
        },
      },
      async (input) => this.toToolResult(await (await this.getClient()).openNotebook(input as OpenNotebookRequest)),
    );

    server.registerTool(
      "read_notebook",
      {
        title: "Read Notebook",
        description: "Read the live state of a notebook.",
        inputSchema: {
          notebook_uri: z.string(),
          include_outputs: z.boolean().optional(),
          range: z.object({ start: z.number().int(), end: z.number().int() }).optional(),
          cell_ids: z.array(z.string()).optional(),
        },
      },
      async (input) => this.toToolResult(await (await this.getClient()).readNotebook(input as ReadNotebookRequest)),
    );

    server.registerTool(
      "insert_cell",
      {
        title: "Insert Cell",
        description: "Insert a new cell into the live notebook.",
        inputSchema: {
          notebook_uri: z.string(),
          expected_notebook_version: z.number().int().optional(),
          position: z.union([
            z.object({ before_index: z.number().int().nonnegative() }),
            z.object({ before_cell_id: z.string() }),
            z.object({ after_cell_id: z.string() }),
            z.object({ at_end: z.literal(true) }),
          ]),
          cell: z.object({
            kind: z.enum(["markdown", "code"]),
            language: z.string().nullable().optional(),
            source: z.string(),
            metadata: z.record(z.unknown()).optional(),
          }),
        },
      },
      async (input) => this.toToolResult(await (await this.getClient()).insertCell(input as InsertCellRequest)),
    );

    server.registerTool(
      "replace_cell_source",
      {
        title: "Replace Cell Source",
        description: "Replace the source of an existing cell.",
        inputSchema: {
          notebook_uri: z.string(),
          cell_id: z.string(),
          expected_notebook_version: z.number().int().optional(),
          source: z.string(),
        },
      },
      async (input) =>
        this.toToolResult(await (await this.getClient()).replaceCellSource(input as ReplaceCellSourceRequest)),
    );

    server.registerTool(
      "delete_cell",
      {
        title: "Delete Cell",
        description: "Delete a cell from the live notebook.",
        inputSchema: {
          notebook_uri: z.string(),
          cell_id: z.string(),
          expected_notebook_version: z.number().int().optional(),
        },
      },
      async (input) => this.toToolResult(await (await this.getClient()).deleteCell(input as DeleteCellRequest)),
    );

    server.registerTool(
      "move_cell",
      {
        title: "Move Cell",
        description: "Move a cell to a different notebook index.",
        inputSchema: {
          notebook_uri: z.string(),
          cell_id: z.string(),
          expected_notebook_version: z.number().int().optional(),
          target_index: z.number().int().nonnegative(),
        },
      },
      async (input) => this.toToolResult(await (await this.getClient()).moveCell(input as MoveCellRequest)),
    );

    server.registerTool(
      "execute_cells",
      {
        title: "Execute Cells",
        description: "Execute code cells in the live notebook and return normalized outputs.",
        inputSchema: {
          notebook_uri: z.string(),
          cell_ids: z.array(z.string()),
          expected_notebook_version: z.number().int().optional(),
          timeout_ms: z.number().int().positive().optional(),
          wait_for_completion: z.literal(true).optional(),
        },
      },
      async (input) => this.toToolResult(await (await this.getClient()).executeCells(input as ExecuteCellsRequest)),
    );

    server.registerTool(
      "read_cell_outputs",
      {
        title: "Read Cell Outputs",
        description: "Read normalized outputs for a single cell.",
        inputSchema: {
          notebook_uri: z.string(),
          cell_id: z.string(),
        },
      },
      async (input) =>
        this.toToolResult(await (await this.getClient()).readCellOutputs(input as ReadCellOutputsRequest)),
    );

    server.registerTool(
      "get_kernel_info",
      {
        title: "Get Kernel Info",
        description: "Read best-effort kernel information for the notebook.",
        inputSchema: {
          notebook_uri: z.string(),
        },
      },
      async (input) =>
        this.toToolResult(await (await this.getClient()).getKernelInfo((input as { notebook_uri: string }).notebook_uri)),
    );

    server.registerTool(
      "summarize_notebook_state",
      {
        title: "Summarize Notebook State",
        description: "Return a compact machine-readable notebook summary.",
        inputSchema: {
          notebook_uri: z.string(),
        },
      },
      async (input) =>
        this.toToolResult(
          await (await this.getClient()).summarizeNotebookState((input as { notebook_uri: string }).notebook_uri),
        ),
    );
  }

  private toToolResult(result: unknown): { content: Array<{ type: "text"; text: string }> } {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }
}
