import "vscode";

declare module "vscode" {
  export namespace cursor {
    export namespace mcp {
      export interface ExtMcpServerConfig {
        name: string;
        server: {
          command: string;
          args: string[];
          env: Record<string, string>;
        };
      }

      export function registerServer(config: ExtMcpServerConfig): void;
      export function unregisterServer(serverName: string): void;
    }
  }
}

