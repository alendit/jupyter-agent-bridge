import { PatchCellSourceRequest } from "../../../packages/protocol/src";
import { z } from "zod";

export interface SearchReplacePatchEdit {
  old: string;
  new: string;
  replace_all?: boolean;
}

export const SEARCH_REPLACE_PATCH_EDIT_SCHEMA = z.object({
  old: z.string(),
  new: z.string(),
  replace_all: z.boolean().optional(),
});

export const SEARCH_REPLACE_PATCH_ARRAY_SCHEMA = z
  .array(SEARCH_REPLACE_PATCH_EDIT_SCHEMA)
  .min(1, "search_replace_json patch must be an array with at least one edit.");

export type PatchToolInputValue = string | SearchReplacePatchEdit[];

export function normalizeCellSourceInput(source: string): string {
  return source;
}

export function serializeSearchReplacePatchInput(patch: SearchReplacePatchEdit[]): string {
  return JSON.stringify(SEARCH_REPLACE_PATCH_ARRAY_SCHEMA.parse(patch));
}

export function normalizePatchToolInput(
  patch: PatchToolInputValue,
  format?: PatchCellSourceRequest["format"],
): string {
  if (Array.isArray(patch)) {
    if (format === "unified_diff" || format === "codex_apply_patch") {
      throw new Error(`${format} patch must be a string.`);
    }
    return serializeSearchReplacePatchInput(patch);
  }

  if (format === "search_replace_json") {
    throw new Error("search_replace_json patch must be an array of {old, new, replace_all?} edits.");
  }

  return patch;
}
