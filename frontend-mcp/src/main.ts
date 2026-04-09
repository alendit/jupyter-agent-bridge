import { BridgeErrorException } from "../../packages/protocol/src";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { BridgeDiscovery } from "./bridge/BridgeDiscovery";
import { HttpJsonRpcBridgeClient } from "./bridge/HttpJsonRpcBridgeClient";
import { NotebookTools } from "./mcp/NotebookTools";

async function main(): Promise<void> {
  const discovery = new BridgeDiscovery();
  const server = new McpServer({
    name: "jupyter-mcp",
    version: "0.1.0",
  });

  const tools = new NotebookTools(async () => {
    const session = await discovery.selectSession();
    return new HttpJsonRpcBridgeClient(session.bridge_url, session.auth_token);
  });
  tools.register(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

void main().catch((error) => {
  const message =
    error instanceof BridgeErrorException ? error.message : error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
