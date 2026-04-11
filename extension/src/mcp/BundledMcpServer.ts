import * as fs from "node:fs";
import * as path from "node:path";

export interface BundledMcpServerConfig {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
}

const SERVER_NAME = "jupyter-agent-bridge";

export function resolveBundledMcpEntrypoint(extensionPath: string): string | null {
  const candidates = [
    path.join(extensionPath, "frontend-mcp", "dist", "frontend-mcp", "src", "main.js"),
    path.join(extensionPath, "..", "frontend-mcp", "dist", "frontend-mcp", "src", "main.js"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function buildBundledMcpServerConfig(
  extensionPath: string,
  portFilePath: string,
): BundledMcpServerConfig | null {
  const entrypoint = resolveBundledMcpEntrypoint(extensionPath);
  if (!entrypoint) {
    return null;
  }

  return {
    name: SERVER_NAME,
    command: "node",
    args: [entrypoint, portFilePath],
    env: {},
  };
}

export function renderMcpDefinitionSnippet(config: BundledMcpServerConfig): string {
  return JSON.stringify(
    {
      mcpServers: {
        [config.name]: {
          command: config.command,
          args: config.args,
          env: config.env,
        },
      },
    },
    null,
    2,
  );
}
