import { BridgeErrorException } from "../../packages/protocol/src";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { AppResourceRegistry } from "./apps/AppResourceRegistry";
import { AppTools } from "./apps/AppTools";
import { BridgeDiscovery } from "./bridge/BridgeDiscovery";
import { createFrontendLogger } from "./logging";
import { createBridgeClientResolver } from "./mcp/BridgeClientResolver";
import { resolveToolProfile } from "./mcp/NotebookToolCatalog";
import { NotebookPrompts } from "./mcp/NotebookPrompts";
import { NotebookResources } from "./mcp/NotebookResources";
import { NotebookTools } from "./mcp/NotebookTools";

async function main(): Promise<void> {
  const logger = createFrontendLogger();
  const discovery = new BridgeDiscovery();
  const profile = resolveToolProfile();
  const server = new McpServer({
    name: "jupyter-agent-bridge",
    version: "0.1.0",
  });
  logger.info(`frontend-mcp starting pid=${process.pid} profile=${profile} log_path=${JSON.stringify(logger.logPath)}`);

  const getClient = createBridgeClientResolver(discovery, server, (message) => logger.info(message));
  const tools = new NotebookTools(getClient, (message) => logger.info(message));
  const appTools = new AppTools(getClient, discovery, (message) => logger.info(message));
  const prompts = new NotebookPrompts();
  tools.register(server);
  await appTools.register(server, { enableApps: profile === "full" });
  prompts.register(server);

  if (profile === "full") {
    const resources = new NotebookResources(getClient);
    const appResources = new AppResourceRegistry();
    resources.register(server);
    await appResources.register(server);
  }

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
