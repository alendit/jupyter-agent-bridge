import * as fs from "node:fs/promises";
import * as path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { NOTEBOOK_APP_RESOURCE_URI } from "./AppTypes";

export class AppResourceRegistry {
  public async register(server: McpServer): Promise<void> {
    const { registerAppResource, RESOURCE_MIME_TYPE } = await import("@modelcontextprotocol/ext-apps/server");
    const registerAppResourceUnsafe = registerAppResource as (...args: unknown[]) => unknown;

    registerAppResourceUnsafe(
      server,
      "Notebook Console",
      NOTEBOOK_APP_RESOURCE_URI,
      {
        description: "Interactive notebook companion UI for session selection, review, triage, and execution monitoring.",
      },
      async () => ({
        contents: [
          {
            uri: NOTEBOOK_APP_RESOURCE_URI,
            mimeType: RESOURCE_MIME_TYPE,
            text: await fs.readFile(this.resolveHtmlPath(), "utf8"),
            _meta: {
              ui: {
                prefersBorder: true,
              },
            },
          },
        ],
      }),
    );
  }

  private resolveHtmlPath(): string {
    return path.join(__dirname, "..", "apps", "jupyter-mcp-app.html");
  }
}
