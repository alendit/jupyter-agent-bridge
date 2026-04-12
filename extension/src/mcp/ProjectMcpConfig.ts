import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { BundledMcpServerConfig } from "./BundledMcpServer";

export type McpConfigTargetId = "claude-code" | "codex" | "copilot" | "copy-to-clipboard" | "cursor";

export interface McpConfigTarget {
  id: McpConfigTargetId;
  label: string;
  relativePath: string | null;
}

export interface McpConfigWriteResult {
  filePath: string;
  created: boolean;
}

const CODEX_MANAGED_BLOCK_START = "# BEGIN jupyter-agent-bridge MCP server";
const CODEX_MANAGED_BLOCK_END = "# END jupyter-agent-bridge MCP server";

export const MCP_CONFIG_TARGETS: McpConfigTarget[] = [
  { id: "claude-code", label: "Claude Code", relativePath: ".mcp.json" },
  { id: "codex", label: "Codex", relativePath: path.join(".codex", "config.toml") },
  { id: "copilot", label: "Copilot", relativePath: path.join(".vscode", "mcp.json") },
  { id: "copy-to-clipboard", label: "Copy to Clipboard", relativePath: null },
  { id: "cursor", label: "Cursor", relativePath: path.join(".cursor", "mcp.json") },
];

export function getMcpConfigTarget(id: McpConfigTargetId): McpConfigTarget {
  const target = MCP_CONFIG_TARGETS.find((candidate) => candidate.id === id);
  if (!target) {
    throw new Error(`Unsupported MCP config target: ${id}`);
  }

  return target;
}

export async function writeProjectMcpConfig(
  targetId: Exclude<McpConfigTargetId, "copy-to-clipboard">,
  workspaceFolderPath: string,
  config: BundledMcpServerConfig,
): Promise<McpConfigWriteResult> {
  const target = getMcpConfigTarget(targetId);
  if (!target.relativePath) {
    throw new Error(`Target ${target.label} does not write a project file.`);
  }

  const filePath = path.join(workspaceFolderPath, target.relativePath);
  const existingContent = await readExistingFile(filePath);
  const content = renderProjectMcpConfig(targetId, config, existingContent);

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");

  return {
    filePath,
    created: existingContent === null,
  };
}

export function renderClipboardMcpDefinitionSnippet(config: BundledMcpServerConfig): string {
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

export function renderProjectMcpConfig(
  targetId: Exclude<McpConfigTargetId, "copy-to-clipboard">,
  config: BundledMcpServerConfig,
  existingContent: string | null,
): string {
  switch (targetId) {
    case "claude-code":
    case "cursor":
      return renderJsonTarget("mcpServers", config.name, createGenericJsonEntry(config), existingContent);
    case "copilot":
      return renderJsonTarget("servers", config.name, createCopilotEntry(config), existingContent);
    case "codex":
      return renderCodexTarget(config, existingContent);
  }
}

function createGenericJsonEntry(config: BundledMcpServerConfig): Record<string, unknown> {
  return {
    command: config.command,
    args: config.args,
    env: config.env,
  };
}

function createCopilotEntry(config: BundledMcpServerConfig): Record<string, unknown> {
  return {
    type: "stdio",
    command: config.command,
    args: config.args,
    env: config.env,
  };
}

function renderJsonTarget(
  containerKey: "mcpServers" | "servers",
  serverName: string,
  entry: Record<string, unknown>,
  existingContent: string | null,
): string {
  const root = existingContent ? parseJsonRoot(existingContent) : {};
  const existingContainer = root[containerKey];
  const container = isRecord(existingContainer) ? { ...existingContainer } : {};
  container[serverName] = entry;

  return `${JSON.stringify(
    {
      ...root,
      [containerKey]: container,
    },
    null,
    2,
  )}\n`;
}

function renderCodexTarget(config: BundledMcpServerConfig, existingContent: string | null): string {
  const withoutManaged = removeManagedCodexBlock(existingContent ?? "");
  const withoutExistingServer = stripCodexServerSection(withoutManaged, config.name);
  const base = withoutExistingServer.trimEnd();
  const nextBlock = renderCodexServerBlock(config);

  if (base.length === 0) {
    return nextBlock;
  }

  return `${base}\n\n${nextBlock}`;
}

function renderCodexServerBlock(config: BundledMcpServerConfig): string {
  const lines = [
    CODEX_MANAGED_BLOCK_START,
    `[mcp_servers.${config.name}]`,
    `command = ${renderTomlString(config.command)}`,
    "args = [",
    ...config.args.map((arg) => `  ${renderTomlString(arg)},`),
    "]",
    "",
    `[mcp_servers.${config.name}.env]`,
    ...Object.entries(config.env).map(([key, value]) => `${key} = ${renderTomlString(value)}`),
    CODEX_MANAGED_BLOCK_END,
  ];

  return `${lines.join("\n")}\n`;
}

function parseJsonRoot(content: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Existing MCP config is not valid JSON: ${message}`);
  }

  if (!isRecord(parsed)) {
    throw new Error("Existing MCP config must be a JSON object at the root.");
  }

  return parsed;
}

function removeManagedCodexBlock(content: string): string {
  const escapedStart = escapeForRegExp(CODEX_MANAGED_BLOCK_START);
  const escapedEnd = escapeForRegExp(CODEX_MANAGED_BLOCK_END);
  return content.replace(new RegExp(`${escapedStart}[\\s\\S]*?${escapedEnd}\\n?`, "g"), "").trimEnd();
}

function stripCodexServerSection(content: string, serverName: string): string {
  const lines = content.split(/\r?\n/);
  const out: string[] = [];
  const serverHeaderPattern = new RegExp(`^\\[mcp_servers\\.${escapeForRegExp(serverName)}(?:\\.[^\\]]+)*\\]$`);
  let skipping = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const isHeader = /^\[.*\]$/.test(trimmed);
    const isServerHeader = serverHeaderPattern.test(trimmed);

    if (!skipping) {
      if (isServerHeader) {
        skipping = true;
        continue;
      }
      out.push(line);
      continue;
    }

    if (isHeader && !isServerHeader) {
      skipping = false;
      out.push(line);
    }
  }

  return out.join("\n").trimEnd();
}

function renderTomlString(value: string): string {
  return JSON.stringify(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function readExistingFile(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}
