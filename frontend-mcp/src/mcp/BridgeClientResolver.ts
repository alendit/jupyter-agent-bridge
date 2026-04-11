import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BridgeDiscovery } from "../bridge/BridgeDiscovery";
import { HttpJsonRpcBridgeClient } from "../bridge/HttpJsonRpcBridgeClient";
import { chooseSessionViaElicitation, ToolRequestExtra } from "./SessionSelection";

export function createBridgeClientResolver(
  discovery: BridgeDiscovery,
  server: McpServer,
  log?: (message: string) => void,
): (extra: ToolRequestExtra) => Promise<HttpJsonRpcBridgeClient> {
  return async (extra) => {
    const session = await discovery.selectSession({
      chooseSession: supportsClientElicitation(server)
        ? (candidates) => chooseSessionViaElicitation(candidates, extra, log)
        : undefined,
    });
    log?.(
      `bridge session selected session_id=${JSON.stringify(session.session_id)} bridge_url=${JSON.stringify(session.bridge_url)}`,
    );
    return new HttpJsonRpcBridgeClient(session.bridge_url, session.auth_token);
  };
}

export function supportsClientElicitation(server: McpServer): boolean {
  return server.server.getClientCapabilities()?.elicitation !== undefined;
}
