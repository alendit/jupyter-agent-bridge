import * as os from "node:os";
import * as path from "node:path";
import { SessionCapabilities } from "./rpc";

export interface RendezvousRecord {
  session_id: string;
  workspace_id: string | null;
  workspace_folders: string[];
  window_title: string;
  bridge_url: string;
  auth_token: string;
  capabilities: SessionCapabilities;
  pid: number;
  created_at: string;
  last_seen_at: string;
}

export const SESSION_TTL_MS = 15_000;

export function getDefaultSessionsDirectory(platform: NodeJS.Platform = process.platform): string {
  const home = os.homedir();

  if (platform === "darwin") {
    return path.join(home, "Library", "Caches", "jupyter-mcp", "sessions");
  }

  if (platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA;
    return path.join(localAppData ?? path.join(home, "AppData", "Local"), "jupyter-mcp", "sessions");
  }

  const stateHome = process.env.XDG_STATE_HOME ?? path.join(home, ".local", "state");
  return path.join(stateHome, "jupyter-mcp", "sessions");
}

export function isRendezvousRecordFresh(record: RendezvousRecord, now = Date.now()): boolean {
  const seenAt = Date.parse(record.last_seen_at);
  return Number.isFinite(seenAt) && now - seenAt <= SESSION_TTL_MS;
}

export function recordMatchesWorkspace(record: RendezvousRecord, cwd: string): boolean {
  return record.workspace_folders.some((folder) => {
    if (!folder.startsWith("file://")) {
      return false;
    }

    try {
      const workspacePath = new URL(folder).pathname;
      return cwd === workspacePath || cwd.startsWith(`${workspacePath}${path.sep}`);
    } catch {
      return false;
    }
  });
}

