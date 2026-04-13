import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export class NotebookPrompts {
  public register(server: McpServer): void {
    server.prompt(
      "triage_notebook",
      "Assess notebook health: check diagnostics, identify failing cells, and summarize state.",
      { notebook_uri: z.string().describe("Absolute notebook URI, e.g. file:///workspace/demo.ipynb") },
      async ({ notebook_uri }) => ({
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: [
                `Triage the notebook ${notebook_uri}:`,
                "",
                "1. Call summarize_notebook_state to get the current status.",
                "2. Call get_diagnostics to check for errors and warnings.",
                "3. If there are cells with errors, call read_cell_outputs on each to inspect runtime exceptions.",
                "4. Summarize findings: which cells have problems, what the diagnostics say, and whether the kernel is healthy.",
              ].join("\n"),
            },
          },
        ],
      }),
    );

    server.prompt(
      "safe_edit_cell",
      "Edit a cell with stale-safety: read current state, apply the change, verify the result.",
      {
        notebook_uri: z.string().describe("Absolute notebook URI"),
        cell_id: z.string().describe("Target cell ID"),
        instruction: z.string().describe("What to change in the cell"),
      },
      async ({ notebook_uri, cell_id, instruction }) => ({
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: [
                `Edit cell ${cell_id} in ${notebook_uri}: ${instruction}`,
                "",
                "Steps:",
                "1. Call read_notebook with cell_ids=[cell_id] to get the current source and source_fingerprint.",
                "2. Construct the edit (use patch_cell_source for small changes, replace_cell_source for full rewrites).",
                "3. Pass expected_cell_source_fingerprint from step 1 to guard against stale state.",
                "4. If NotebookChanged is returned, re-read and retry.",
                "5. After a successful edit, call get_diagnostics to check for new errors.",
              ].join("\n"),
            },
          },
        ],
      }),
    );

    server.prompt(
      "execute_and_inspect",
      "Execute cells and inspect the results: run code, check outputs, report errors.",
      {
        notebook_uri: z.string().describe("Absolute notebook URI"),
        cell_ids: z.string().optional().describe("Comma-separated cell IDs to execute, or omit to execute all"),
      },
      async ({ notebook_uri, cell_ids }) => ({
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: [
                `Execute and inspect results in ${notebook_uri}${cell_ids ? ` (cells: ${cell_ids})` : ""}:`,
                "",
                "1. Call execute_cells with stop_on_error=true.",
                "2. For each cell result, check execution status.",
                "3. For failed cells, call read_cell_outputs to get the full error traceback.",
                "4. For succeeded cells with outputs, summarize what they produced.",
                "5. Report overall execution outcome.",
              ].join("\n"),
            },
          },
        ],
      }),
    );

    server.prompt(
      "recover_kernel",
      "Diagnose and recover from a stuck or broken kernel.",
      { notebook_uri: z.string().describe("Absolute notebook URI") },
      async ({ notebook_uri }) => ({
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: [
                `Recover the kernel for ${notebook_uri}:`,
                "",
                "1. Call summarize_notebook_state to check kernel status.",
                "2. If the kernel is busy or stuck, call interrupt_execution first.",
                "3. If interrupt does not resolve, call restart_kernel.",
                "4. After restart, call wait_for_kernel_ready to confirm recovery.",
                "5. Report final kernel state. Note: restarting clears all kernel variables.",
              ].join("\n"),
            },
          },
        ],
      }),
    );
  }
}
