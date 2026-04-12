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
    private readonly portFilePath = process.argv[2] || process.env.JUPYTER_AGENT_BRIDGE_PORT_FILE || null,
  ) {}

  private pinnedSessionId: string | null = null;

  public getPinnedSessionId(): string | null {
    return this.pinnedSessionId;
  }

  public setPinnedSession(sessionId: string | null): void {
    this.pinnedSessionId = sessionId;
  }

  public async selectSession(options?: {
    chooseSession?: (candidates: readonly RendezvousRecord[]) => Promise<RendezvousRecord | undefined>;
  }): Promise<RendezvousRecord> {
    const sessions = await this.listSessions();
    if (sessions.length === 0) {
      throw new BridgeErrorException({
        code: "BridgeUnavailable",
        message: "No active VS Code notebook bridge sessions were found.",
        recoverable: true,
      });
    }

    const explicitPort = await this.readPortFromFile();
    if (explicitPort !== null) {
      const match = sessions.find((session) => sessionPort(session) === explicitPort);
      if (!match) {
        throw new BridgeErrorException({
          code: "BridgeUnavailable",
          message: `No active notebook bridge matched port ${explicitPort} from the port file.`,
          detail: {
            port_file: this.portFilePath,
            port: explicitPort,
          },
          recoverable: true,
        });
      }

      return match;
    }

    const explicitSessionId = process.env.JUPYTER_AGENT_BRIDGE_SESSION_ID;
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

    if (this.pinnedSessionId) {
      const pinned = sessions.find((candidate) => candidate.session_id === this.pinnedSessionId);
      if (pinned) {
        return pinned;
      }

      this.pinnedSessionId = null;
    }

    const workspaceMatches = sessions.filter((session) => recordMatchesWorkspace(session, this.cwd));
    if (workspaceMatches.length === 1) {
      return workspaceMatches[0];
    }

    if (workspaceMatches.length > 1) {
      return this.resolveAmbiguousSession(
        "More than one notebook bridge matches the current workspace.",
        workspaceMatches,
        options?.chooseSession,
      );
    }

    if (sessions.length === 1) {
      return sessions[0];
    }

    return this.resolveAmbiguousSession(
      "More than one active notebook bridge is available. Set JUPYTER_AGENT_BRIDGE_SESSION_ID.",
      sessions,
      options?.chooseSession,
    );
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

  private async resolveAmbiguousSession(
    message: string,
    candidates: readonly RendezvousRecord[],
    chooseSession?: (candidates: readonly RendezvousRecord[]) => Promise<RendezvousRecord | undefined>,
  ): Promise<RendezvousRecord> {
    const cached =
      this.pinnedSessionId === null
        ? undefined
        : candidates.find((candidate) => candidate.session_id === this.pinnedSessionId);
    if (cached) {
      return cached;
    }
    this.pinnedSessionId = null;

    if (chooseSession) {
      const chosen = await chooseSession(candidates);
      if (chosen && candidates.some((candidate) => candidate.session_id === chosen.session_id)) {
        this.pinnedSessionId = chosen.session_id;
        return chosen;
      }
    }

    throw new BridgeErrorException({
      code: "AmbiguousSession",
      message,
      detail: candidates.map((session) => ({
        session_id: session.session_id,
        workspace_id: session.workspace_id,
        window_title: session.window_title,
        workspace_folders: session.workspace_folders,
      })),
      recoverable: true,
    });
  }

  private async readPortFromFile(): Promise<number | null> {
    if (!this.portFilePath) {
      return null;
    }

    try {
      const raw = await fs.readFile(this.portFilePath, "utf8");
      const port = Number.parseInt(raw.trim(), 10);
      return Number.isFinite(port) ? port : null;
    } catch {
      return null;
    }
  }
}

function sessionPort(session: RendezvousRecord): number | null {
  try {
    return new URL(session.bridge_url).port ? Number.parseInt(new URL(session.bridge_url).port, 10) : null;
  } catch {
    return null;
  }
}
