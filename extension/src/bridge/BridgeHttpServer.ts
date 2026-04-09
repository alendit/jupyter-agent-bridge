import * as http from "node:http";
import { AddressInfo } from "node:net";
import {
  BRIDGE_METHODS,
  JSON_RPC_ERRORS,
  JsonRpcRequest,
  JsonRpcResponse,
} from "../../../packages/protocol/src";
import { BearerTokenAuth } from "./Auth";
import { JsonRpcRouter } from "./JsonRpcRouter";

export class BridgeHttpServer {
  private readonly server: http.Server;
  private addressInfo?: AddressInfo;

  public constructor(
    private readonly auth: BearerTokenAuth,
    private readonly router: JsonRpcRouter,
  ) {
    this.server = http.createServer(async (request, response) => {
      await this.handleRequest(request, response);
    });
  }

  public async start(): Promise<string> {
    await new Promise<void>((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(0, "127.0.0.1", () => {
        this.server.off("error", reject);
        resolve();
      });
    });

    const address = this.server.address();
    if (!address || typeof address === "string") {
      throw new Error("Bridge server did not bind to a TCP socket.");
    }

    this.addressInfo = address;
    return `http://127.0.0.1:${address.port}/rpc`;
  }

  public async stop(): Promise<void> {
    if (!this.server.listening) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      this.server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  public get bridgeUrl(): string {
    if (!this.addressInfo) {
      throw new Error("Bridge server has not started.");
    }

    return `http://127.0.0.1:${this.addressInfo.port}/rpc`;
  }

  private async handleRequest(
    request: http.IncomingMessage,
    response: http.ServerResponse,
  ): Promise<void> {
    if (request.method !== "POST" || request.url !== "/rpc") {
      response.writeHead(404).end();
      return;
    }

    const rawBody = await readRequestBody(request);
    let payload: JsonRpcRequest;

    try {
      payload = JSON.parse(rawBody) as JsonRpcRequest;
    } catch {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: null,
          error: {
            code: JSON_RPC_ERRORS.parseError,
            message: "Invalid JSON",
          },
        } satisfies JsonRpcResponse),
      );
      return;
    }

    if (!payload || payload.jsonrpc !== "2.0" || typeof payload.method !== "string") {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: payload?.id ?? null,
          error: {
            code: JSON_RPC_ERRORS.invalidRequest,
            message: "Invalid JSON-RPC request",
          },
        } satisfies JsonRpcResponse),
      );
      return;
    }

    if (payload.method !== BRIDGE_METHODS.getSessionInfo) {
      try {
        this.auth.assertAuthorized(request.headers.authorization);
      } catch {
        response.writeHead(401, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: payload.id ?? null,
            error: {
              code: JSON_RPC_ERRORS.domainError,
              message: "Unauthorized",
              data: {
                code: "AuthenticationFailed",
                message: "Unauthorized",
              },
            },
          } satisfies JsonRpcResponse),
        );
        return;
      }
    }

    const rpcResponse = await this.router.route(payload);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(rpcResponse));
  }
}

async function readRequestBody(request: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}
