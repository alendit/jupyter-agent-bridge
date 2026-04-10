import { PatchCellSourceRequest } from "../../../packages/protocol/src";

export type AppliedPatchFormat = Exclude<PatchCellSourceRequest["format"], "auto" | undefined>;

interface SearchReplaceEdit {
  old: string;
  new: string;
  replace_all?: boolean;
}

interface PatchOperation {
  oldText: string;
  newText: string;
  replaceAll?: boolean;
}

export interface PatchApplyResult {
  format: AppliedPatchFormat;
  updatedSource: string;
}

export class CellPatchService {
  public applyPatch(
    source: string,
    patch: string,
    format: PatchCellSourceRequest["format"] = "auto",
  ): PatchApplyResult {
    const parsed = this.parsePatch(patch, format);
    const updatedSource = this.applyOperations(source, parsed.operations);

    return {
      format: parsed.format,
      updatedSource,
    };
  }

  private parsePatch(
    patch: string,
    requestedFormat: PatchCellSourceRequest["format"] = "auto",
  ): { format: AppliedPatchFormat; operations: PatchOperation[] } {
    const normalizedPatch = patch.replace(/\r\n/gu, "\n");

    if (requestedFormat === "search_replace_json") {
      return {
        format: "search_replace_json",
        operations: this.parseSearchReplaceJson(normalizedPatch),
      };
    }

    if (requestedFormat === "codex_apply_patch") {
      return {
        format: "codex_apply_patch",
        operations: this.parseCodexApplyPatch(normalizedPatch),
      };
    }

    if (requestedFormat === "unified_diff") {
      return {
        format: "unified_diff",
        operations: this.parseUnifiedDiff(normalizedPatch),
      };
    }

    if (normalizedPatch.includes("*** Begin Patch")) {
      return {
        format: "codex_apply_patch",
        operations: this.parseCodexApplyPatch(normalizedPatch),
      };
    }

    if (looksLikeJson(normalizedPatch)) {
      return {
        format: "search_replace_json",
        operations: this.parseSearchReplaceJson(normalizedPatch),
      };
    }

    return {
      format: "unified_diff",
      operations: this.parseUnifiedDiff(normalizedPatch),
    };
  }

  private parseSearchReplaceJson(patch: string): PatchOperation[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(patch) as unknown;
    } catch (error) {
      throw new Error(`search_replace_json patch is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("search_replace_json patch must be a non-empty JSON array.");
    }

    return parsed.map((entry, index) => this.toSearchReplaceOperation(entry, index));
  }

  private toSearchReplaceOperation(entry: unknown, index: number): PatchOperation {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`search_replace_json patch entry ${index} must be an object.`);
    }

    const candidate = entry as SearchReplaceEdit;
    if (typeof candidate.old !== "string") {
      throw new Error(`search_replace_json patch entry ${index} is missing string field "old".`);
    }
    if (typeof candidate.new !== "string") {
      throw new Error(`search_replace_json patch entry ${index} is missing string field "new".`);
    }
    if (candidate.replace_all !== undefined && typeof candidate.replace_all !== "boolean") {
      throw new Error(`search_replace_json patch entry ${index} has non-boolean "replace_all".`);
    }

    return {
      oldText: candidate.old,
      newText: candidate.new,
      replaceAll: candidate.replace_all,
    };
  }

  private parseCodexApplyPatch(patch: string): PatchOperation[] {
    const updateMatch = patch.match(/\*\*\* Begin Patch\n\*\*\* Update File: [^\n]+\n([\s\S]*?)\n\*\*\* End Patch/u);
    if (!updateMatch || !updateMatch[1]) {
      throw new Error("codex_apply_patch must contain a single *** Update File block.");
    }

    const body = updateMatch[1]
      .split("\n")
      .filter((line) => line !== "*** End of File" && !line.startsWith("*** Move to:"))
      .join("\n");

    return this.parseUnifiedDiff(body);
  }

  private parseUnifiedDiff(patch: string): PatchOperation[] {
    const lines = patch.split("\n");
    const operations: PatchOperation[] = [];
    let currentHunk: string[] = [];
    let sawHunkHeader = false;

    const flushHunk = (): void => {
      if (currentHunk.length === 0) {
        return;
      }

      operations.push(parseHunkBody(currentHunk));
      currentHunk = [];
    };

    for (const line of lines) {
      if (line.startsWith("diff --git ") || line.startsWith("index ") || line.startsWith("--- ") || line.startsWith("+++ ")) {
        continue;
      }

      if (line.startsWith("@@")) {
        sawHunkHeader = true;
        flushHunk();
        continue;
      }

      if (line === "\\ No newline at end of file") {
        continue;
      }

      if (line.startsWith(" ") || line.startsWith("+") || line.startsWith("-")) {
        currentHunk.push(line);
        continue;
      }

      if (line.trim().length === 0 && currentHunk.length > 0) {
        currentHunk.push(" ");
        continue;
      }

      if (line.trim().length === 0) {
        continue;
      }

      throw new Error(`Unsupported diff line: ${line}`);
    }

    flushHunk();

    if (operations.length === 0) {
      if (!sawHunkHeader) {
        throw new Error("unified_diff patch did not contain any hunks.");
      }
      throw new Error("unified_diff patch contained empty hunks.");
    }

    return operations;
  }

  private applyOperations(source: string, operations: readonly PatchOperation[]): string {
    let updated = source.replace(/\r\n/gu, "\n");

    for (const operation of operations) {
      if (operation.replaceAll) {
        if (operation.oldText.length === 0) {
          throw new Error("search_replace_json replace_all operations require non-empty old text.");
        }
        if (!updated.includes(operation.oldText)) {
          throw new Error("Patch did not match the current cell source.");
        }
        updated = updated.split(operation.oldText).join(operation.newText);
        continue;
      }

      const firstIndex = updated.indexOf(operation.oldText);
      if (firstIndex === -1) {
        throw new Error("Patch did not match the current cell source.");
      }

      const secondIndex = updated.indexOf(operation.oldText, firstIndex + Math.max(operation.oldText.length, 1));
      if (secondIndex !== -1) {
        throw new Error("Patch matched multiple locations in the current cell source. Use more context or search_replace_json with replace_all.");
      }

      updated = `${updated.slice(0, firstIndex)}${operation.newText}${updated.slice(firstIndex + operation.oldText.length)}`;
    }

    return updated;
  }
}

function parseHunkBody(lines: readonly string[]): PatchOperation {
  const oldText = lines
    .filter((line) => line.startsWith(" ") || line.startsWith("-"))
    .map((line) => line.slice(1))
    .join("\n");
  const newText = lines
    .filter((line) => line.startsWith(" ") || line.startsWith("+"))
    .map((line) => line.slice(1))
    .join("\n");

  return {
    oldText,
    newText,
  };
}

function looksLikeJson(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith("[") || trimmed.startsWith("{");
}
