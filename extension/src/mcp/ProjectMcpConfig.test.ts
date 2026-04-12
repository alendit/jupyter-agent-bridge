import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import type { BundledMcpServerConfig } from "./BundledMcpServer";
import {
  MCP_CONFIG_TARGETS,
  renderClipboardMcpDefinitionSnippet,
  renderProjectMcpConfig,
  writeProjectMcpConfig,
} from "./ProjectMcpConfig";

const CONFIG: BundledMcpServerConfig = {
  name: "jupyter-agent-bridge",
  command: "node",
  args: ["/tmp/main.js", "/tmp/.jupyter-agent-bridge/bridge/port"],
  env: {},
};

test("MCP config targets are sorted alphabetically by label", () => {
  assert.deepEqual(
    MCP_CONFIG_TARGETS.map((target) => target.label),
    ["Claude Code", "Codex", "Copilot", "Copy to Clipboard", "Cursor"],
  );
});

test("renderProjectMcpConfig writes Copilot config under servers with stdio type", () => {
  const content = renderProjectMcpConfig(
    "copilot",
    CONFIG,
    JSON.stringify({
      inputs: [{ type: "promptString", id: "token", description: "API token" }],
      servers: {
        existing: {
          type: "stdio",
          command: "python",
        },
      },
    }),
  );

  const parsed = JSON.parse(content) as Record<string, unknown>;
  assert.deepEqual(parsed.inputs, [{ type: "promptString", id: "token", description: "API token" }]);
  assert.deepEqual((parsed.servers as Record<string, unknown>).existing, {
    type: "stdio",
    command: "python",
  });
  assert.deepEqual((parsed.servers as Record<string, Record<string, unknown>>)["jupyter-agent-bridge"], {
    type: "stdio",
    command: "node",
    args: ["/tmp/main.js", "/tmp/.jupyter-agent-bridge/bridge/port"],
    env: {},
  });
});

test("renderProjectMcpConfig writes Cursor and Claude Code configs under mcpServers", () => {
  const content = renderProjectMcpConfig("cursor", CONFIG, JSON.stringify({ mcpServers: { existing: { command: "python" } } }));
  const parsed = JSON.parse(content) as Record<string, Record<string, unknown>>;
  assert.deepEqual(parsed.mcpServers.existing, { command: "python" });
  assert.deepEqual(parsed.mcpServers["jupyter-agent-bridge"], {
    command: "node",
    args: ["/tmp/main.js", "/tmp/.jupyter-agent-bridge/bridge/port"],
    env: {},
  });
});

test("renderProjectMcpConfig replaces an existing Codex server block and preserves other tables", () => {
  const existing = `
[profiles.default]
model = "gpt-5"

[mcp_servers.jupyter-agent-bridge]
command = "old"
args = [
  "/old/main.js",
]

[mcp_servers.jupyter-agent-bridge.env]

[mcp_servers.jupyter-agent-bridge.tools.read_notebook]
approval_mode = "approve"

[mcp_servers.other]
command = "python"
`.trim();

  const content = renderProjectMcpConfig("codex", CONFIG, existing);
  assert.match(content, /\[profiles\.default\]/);
  assert.match(content, /\[mcp_servers\.other\]/);
  assert.match(content, /# BEGIN jupyter-agent-bridge MCP server/);
  assert.match(content, /\[mcp_servers\.jupyter-agent-bridge\]/);
  assert.doesNotMatch(content, /\[mcp_servers\.jupyter-agent-bridge\.tools\.read_notebook\]/);
  assert.match(content, /command = "node"/);
});

test("writeProjectMcpConfig writes the selected project file", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "jupyter-agent-bridge-"));
  const result = await writeProjectMcpConfig("claude-code", workspace, CONFIG);
  const content = await fs.readFile(result.filePath, "utf8");

  assert.equal(result.filePath, path.join(workspace, ".mcp.json"));
  assert.equal(result.created, true);
  const parsed = JSON.parse(content) as Record<string, Record<string, unknown>>;
  assert.deepEqual(parsed.mcpServers["jupyter-agent-bridge"], {
    command: "node",
    args: ["/tmp/main.js", "/tmp/.jupyter-agent-bridge/bridge/port"],
    env: {},
  });
});

test("renderClipboardMcpDefinitionSnippet preserves the generic JSON snippet", () => {
  const parsed = JSON.parse(renderClipboardMcpDefinitionSnippet(CONFIG)) as Record<string, Record<string, unknown>>;
  assert.deepEqual(parsed.mcpServers["jupyter-agent-bridge"], {
    command: "node",
    args: ["/tmp/main.js", "/tmp/.jupyter-agent-bridge/bridge/port"],
    env: {},
  });
});
