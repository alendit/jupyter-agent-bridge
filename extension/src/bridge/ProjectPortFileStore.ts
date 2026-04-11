import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";

const PORT_FILE_RELATIVE_PATH = path.join(".jupyter-agent-bridge", "bridge", "port");

export class ProjectPortFileStore implements vscode.Disposable {
  public getPreferredPortFilePath(): string | null {
    const folder = this.getPreferredWorkspaceFolder();
    if (!folder) {
      return null;
    }

    return path.join(folder.uri.fsPath, PORT_FILE_RELATIVE_PATH);
  }

  public async write(port: number): Promise<string[]> {
    const folders = vscode.workspace.workspaceFolders ?? [];
    const writtenPaths: string[] = [];

    await Promise.all(
      folders.map(async (folder) => {
        const portFilePath = path.join(folder.uri.fsPath, PORT_FILE_RELATIVE_PATH);
        await fs.mkdir(path.dirname(portFilePath), { recursive: true });
        await fs.writeFile(portFilePath, `${port}\n`, "utf8");
        writtenPaths.push(portFilePath);
      }),
    );

    return writtenPaths.sort();
  }

  public dispose(): void {
    const folders = vscode.workspace.workspaceFolders ?? [];
    for (const folder of folders) {
      const portFilePath = path.join(folder.uri.fsPath, PORT_FILE_RELATIVE_PATH);
      void fs.rm(portFilePath, { force: true });
    }
  }

  private getPreferredWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
    const activeNotebookUri = vscode.window.activeNotebookEditor?.notebook.uri;
    if (activeNotebookUri) {
      const activeFolder = vscode.workspace.getWorkspaceFolder(activeNotebookUri);
      if (activeFolder) {
        return activeFolder;
      }
    }

    return vscode.workspace.workspaceFolders?.[0];
  }
}
