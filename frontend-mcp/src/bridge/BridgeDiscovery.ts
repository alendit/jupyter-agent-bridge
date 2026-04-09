import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  BridgeErrorException,
  RendezvousRecord,
  getDefaultSessionsDirectory,
  isRendezvousRecordFresh,
  recordMatchesWorkspace,
} from "../../../packages/protocol/src";

export class BridgeDiscovery {
  public constructor(
    private readonly cwd = process.cwd(),
    private readonly sessionsDirectory = getDefaultSessionsDirectory(),
  ) {}

  public async selectSession(): Promise<RendezvousRecord> {
    const sessions = await this.listSessions();
    if (sessions.length === 0) {
      throw new BridgeErrorException({
        code: "BridgeUnavailable",
        message: "No active VS Code notebook bridge sessions were found.",
        recoverable: true,
      });
    }

    const explicitSessionId = process.env.JUPYTER_MCP_SESSION_ID;
    if (explicitSessionId) {
      const session = sessions.find((candidate) => candidate.session_id === explicitSessionId);
      if (!session) {
        throw new BridgeErrorException({
          code: "AmbiguousSession",
          message: `Requested session was not found: ${explicitSessionId}`,
          recoverable: true,
        });
      }
      return session;
    }

    const workspaceMatches = sessions.filter((session) => recordMatchesWorkspace(session, this.cwd));
    if (workspaceMatches.length === 1) {
      return workspaceMatches[0];
    }

    if (workspaceMatches.length > 1) {
      throw new BridgeErrorException({
        code: "AmbiguousSession",
        message: "More than one notebook bridge matches the current workspace.",
        detail: workspaceMatches.map((session) => session.workspace_folders),
        recoverable: true,
      });
    }

    if (sessions.length === 1) {
      return sessions[0];
    }

    throw new BridgeErrorException({
      code: "AmbiguousSession",
      message: "More than one active notebook bridge is available. Set JUPYTER_MCP_SESSION_ID.",
      detail: sessions.map((session) => ({
        session_id: session.session_id,
        workspace_id: session.workspace_id,
      })),
      recoverable: true,
    });
  }

  public async listSessions(): Promise<RendezvousRecord[]> {
    let names: string[];

    try {
      names = await fs.readdir(this.sessionsDirectory);
    } catch {
      return [];
    }

    const records = await Promise.all(
      names
        .filter((name) => name.endsWith(".json"))
        .map(async (name) => {
          try {
            const fullPath = path.join(this.sessionsDirectory, name);
            const raw = await fs.readFile(fullPath, "utf8");
            const parsed = JSON.parse(raw) as RendezvousRecord;
            return isRendezvousRecordFresh(parsed) ? parsed : null;
          } catch {
            return null;
          }
        }),
    );

    return records
      .filter((record): record is RendezvousRecord => record !== null)
      .sort((left, right) => Date.parse(right.last_seen_at) - Date.parse(left.last_seen_at));
  }
}
