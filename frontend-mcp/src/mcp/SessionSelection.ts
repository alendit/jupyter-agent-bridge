import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import { ElicitResultSchema, ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types.js";
import type { RendezvousRecord } from "../../../packages/protocol/src";

export type ToolRequestExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

export async function chooseSessionViaElicitation(
  candidates: readonly RendezvousRecord[],
  extra: ToolRequestExtra,
  log?: (message: string) => void,
): Promise<RendezvousRecord | undefined> {
  try {
    const result = await extra.sendRequest(
      {
        method: "elicitation/create",
        params: {
          mode: "form",
          message: "Multiple Jupyter Agent Bridge sessions are available. Choose the VS Code window to use for notebook tools.",
          requestedSchema: {
            type: "object",
            properties: {
              session_id: {
                type: "string",
                title: "Notebook bridge session",
                oneOf: candidates.map((candidate) => ({
                  const: candidate.session_id,
                  title: formatSessionChoiceLabel(candidate),
                })),
              },
            },
            required: ["session_id"],
          },
        },
      },
      ElicitResultSchema,
    );

    if (result.action !== "accept") {
      log?.(`session elicitation not accepted action=${result.action}`);
      return undefined;
    }

    const sessionId = result.content?.session_id;
    if (typeof sessionId !== "string") {
      log?.("session elicitation returned an invalid session_id");
      return undefined;
    }

    return candidates.find((candidate) => candidate.session_id === sessionId);
  } catch (error) {
    log?.(
      `session elicitation failed error=${JSON.stringify(error instanceof Error ? error.message : String(error))}`,
    );
    return undefined;
  }
}

export function formatSessionChoiceLabel(session: RendezvousRecord): string {
  return `${session.window_title} | ${compactWorkspaceLabel(session)} | ${session.session_id}`;
}

function compactWorkspaceLabel(session: RendezvousRecord): string {
  if (session.workspace_folders.length === 0) {
    return "no workspace";
  }

  const [firstFolder, ...rest] = session.workspace_folders;
  const base = fileUriBaseName(firstFolder);
  return rest.length === 0 ? base : `${base} +${rest.length}`;
}

function fileUriBaseName(uri: string): string {
  try {
    const pathname = new URL(uri).pathname;
    const trimmed = pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
    const segments = trimmed.split("/");
    return segments.at(-1) || uri;
  } catch {
    return uri;
  }
}
