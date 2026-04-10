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
    private readonly log?: (message: string) => void,
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
      this.log?.(`RPC parse_error method=unknown remote=${request.socket.remoteAddress ?? "unknown"}`);
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
      this.log?.(`RPC invalid_request method=${String(payload?.method ?? "unknown")} id=${String(payload?.id ?? "null")}`);
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
        this.log?.(`RPC unauthorized method=${payload.method} id=${String(payload.id ?? "null")}`);
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

    const startedAt = Date.now();
    this.log?.(
      `RPC request method=${payload.method} id=${String(payload.id ?? "null")}${summarizeParams(payload.params)}`,
    );
    const rpcResponse = await this.router.route(payload);
    const elapsedMs = Date.now() - startedAt;
    if ("error" in rpcResponse) {
      const errorCode =
        typeof rpcResponse.error.data === "object" && rpcResponse.error.data && "code" in rpcResponse.error.data
          ? String((rpcResponse.error.data as { code?: unknown }).code ?? rpcResponse.error.message)
          : rpcResponse.error.message;
      this.log?.(
        `RPC error method=${payload.method} id=${String(payload.id ?? "null")} elapsed_ms=${elapsedMs} code=${errorCode}`,
      );
    } else {
      this.log?.(`RPC response method=${payload.method} id=${String(payload.id ?? "null")} elapsed_ms=${elapsedMs}`);
    }
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

function summarizeParams(params: unknown): string {
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    return "";
  }

  const record = params as Record<string, unknown>;
  const parts: string[] = [];
  const notebookUri = shortString(record.notebook_uri);
  if (notebookUri) {
    parts.push(` notebook_uri=${notebookUri}`);
  }
  const cellId = shortString(record.cell_id);
  if (cellId) {
    parts.push(` cell_id=${cellId}`);
  }
  if (Array.isArray(record.cell_ids)) {
    parts.push(` cell_ids=${record.cell_ids.length}`);
  }
  const query = shortString(record.query, 80);
  if (query) {
    parts.push(` query=${query}`);
  }
  if (typeof record.max_results === "number") {
    parts.push(` max_results=${record.max_results}`);
  }
  if (typeof record.offset === "number") {
    parts.push(` offset=${record.offset}`);
  }
  if (record.range && typeof record.range === "object" && !Array.isArray(record.range)) {
    const range = record.range as { start?: unknown; end?: unknown };
    if (typeof range.start === "number" && typeof range.end === "number") {
      parts.push(` range=${range.start}:${range.end}`);
    }
  }

  return parts.join("");
}

function shortString(value: unknown, maxLength = 120): string | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  if (value.length <= maxLength) {
    return JSON.stringify(value);
  }

  return JSON.stringify(`${value.slice(0, maxLength - 1)}…`);
}
