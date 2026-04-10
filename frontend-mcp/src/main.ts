import { BridgeErrorException } from "../../packages/protocol/src";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { BridgeDiscovery } from "./bridge/BridgeDiscovery";
import { HttpJsonRpcBridgeClient } from "./bridge/HttpJsonRpcBridgeClient";
import { createFrontendLogger } from "./logging";
import { NotebookTools } from "./mcp/NotebookTools";

async function main(): Promise<void> {
  const logger = createFrontendLogger();
  const discovery = new BridgeDiscovery();
  const server = new McpServer({
    name: "jupyter-mcp",
    version: "0.1.0",
  });
  logger.info(`frontend-mcp starting pid=${process.pid} log_path=${JSON.stringify(logger.logPath)}`);

  const tools = new NotebookTools(async () => {
    const session = await discovery.selectSession();
    logger.info(
      `bridge session selected session_id=${JSON.stringify(session.session_id)} bridge_url=${JSON.stringify(session.bridge_url)}`,
    );
    return new HttpJsonRpcBridgeClient(session.bridge_url, session.auth_token);
  }, (message) => logger.info(message));
  tools.register(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("frontend-mcp connected to stdio transport");
}

void main().catch((error) => {
  const message =
    error instanceof BridgeErrorException ? error.message : error instanceof Error ? error.stack ?? error.message : String(error);
  const logger = createFrontendLogger();
  logger.error(message);
  process.exitCode = 1;
});
