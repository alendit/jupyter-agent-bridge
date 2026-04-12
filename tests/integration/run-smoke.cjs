const assert = require("node:assert/strict");
const vscode = require("vscode");

async function run() {
  const extension = vscode.extensions.getExtension("local.jupyter-agent-bridge");
  assert.ok(extension, "extension manifest should be discoverable");

  await extension.activate();
  assert.equal(extension.isActive, true, "extension should activate successfully");

  const commands = await vscode.commands.getCommands(true);
  assert.ok(commands.includes("jupyterAgentBridge.startBridge"), "bridge start command should be registered");
  assert.ok(commands.includes("jupyterAgentBridge.stopBridge"), "bridge stop command should be registered");
  assert.ok(commands.includes("jupyterAgentBridge.showStatus"), "bridge status command should be registered");
  assert.ok(commands.includes("jupyterAgentBridge.copyMcpDefinition"), "copy MCP definition command should be registered");
  assert.ok(commands.includes("jupyterAgentBridge.openCellNavigation"), "open cell navigation command should be registered");
}

module.exports = {
  run,
};
