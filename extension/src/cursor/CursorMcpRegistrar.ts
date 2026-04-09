import * as vscode from "vscode";
import { buildBundledMcpServerConfig } from "../mcp/BundledMcpServer";

export class CursorMcpRegistrar implements vscode.Disposable {
  private registered = false;

  public constructor(
    private readonly extensionPath: string,
    private readonly sessionId: string,
  ) {}

  public registerIfAvailable(): void {
    if (this.registered) {
      return;
    }

    const cursorMcp = (vscode as typeof vscode & {
      cursor?: {
        mcp?: {
          registerServer?: (config: {
            name: string;
            server: { command: string; args: string[]; env: Record<string, string> };
          }) => void;
        };
      };
    }).cursor?.mcp;

    const registerServer = cursorMcp?.registerServer;
    if (typeof registerServer !== "function") {
      return;
    }

    const config = buildBundledMcpServerConfig(this.extensionPath, this.sessionId);
    if (!config) {
      return;
    }

    registerServer({
      name: config.name,
      server: {
        command: config.command,
        args: config.args,
        env: {
          ...Object.fromEntries(
            Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
          ),
          ...config.env,
        },
      },
    });
    this.registered = true;
  }

  public dispose(): void {
    if (!this.registered) {
      return;
    }

    const unregisterServer = (vscode as typeof vscode & {
      cursor?: {
        mcp?: {
          unregisterServer?: (name: string) => void;
        };
      };
    }).cursor?.mcp?.unregisterServer;

    if (typeof unregisterServer === "function") {
      unregisterServer("jupyter-mcp");
    }

    this.registered = false;
  }
}
