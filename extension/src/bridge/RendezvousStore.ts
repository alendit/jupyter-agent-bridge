import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { BridgeSessionInfo, RendezvousRecord, getDefaultSessionsDirectory } from "../../../packages/protocol/src";

export class RendezvousStore implements vscode.Disposable {
  private readonly sessionDirectory = getDefaultSessionsDirectory();
  private readonly sessionFilePath: string;
  private heartbeat?: NodeJS.Timeout;
  private createdAt = new Date().toISOString();

  public constructor(
    private readonly sessionId: string,
    private readonly authToken: string,
    private readonly getSessionInfo: () => BridgeSessionInfo,
  ) {
    this.sessionFilePath = path.join(this.sessionDirectory, `${this.sessionId}.json`);
  }

  public async start(): Promise<void> {
    await this.writeRecord();
    this.heartbeat = setInterval(() => {
      void this.writeRecord();
    }, 5_000);
  }

  public dispose(): void {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = undefined;
    }

    void fs.rm(this.sessionFilePath, { force: true });
  }

  private async writeRecord(): Promise<void> {
    const sessionInfo = this.getSessionInfo();
    const workspaceFolders = (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.toString());
    const record: RendezvousRecord = {
      session_id: this.sessionId,
      workspace_id: workspaceFolders[0] ?? null,
      workspace_folders: workspaceFolders,
      window_title: vscode.window.activeNotebookEditor?.notebook.uri.fsPath ?? "VS Code",
      bridge_url: sessionInfo.bridge_url,
      auth_token: this.authToken,
      capabilities: sessionInfo.capabilities,
      pid: process.pid,
      created_at: this.createdAt,
      last_seen_at: new Date().toISOString(),
    };

    await fs.mkdir(this.sessionDirectory, { recursive: true, mode: 0o700 });
    await fs.writeFile(this.sessionFilePath, `${JSON.stringify(record, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
  }
}
