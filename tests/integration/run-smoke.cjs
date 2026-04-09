const assert = require("node:assert/strict");
const vscode = require("vscode");

async function run() {
  const extension = vscode.extensions.getExtension("local.jupyter-mcp");
  assert.ok(extension, "extension manifest should be discoverable");

  await extension.activate();
  assert.equal(extension.isActive, true, "extension should activate successfully");

  const commands = await vscode.commands.getCommands(true);
  assert.ok(commands.includes("jupyterMcp.startBridge"), "bridge start command should be registered");
  assert.ok(commands.includes("jupyterMcp.stopBridge"), "bridge stop command should be registered");
  assert.ok(commands.includes("jupyterMcp.showStatus"), "bridge status command should be registered");
  assert.ok(commands.includes("jupyterMcp.copyMcpDefinition"), "copy MCP definition command should be registered");
}

module.exports = {
  run,
};
