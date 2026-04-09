import * as vscode from "vscode";
import { NormalizedOutput } from "../../../packages/protocol/src";

const TEXT_LIMIT_BYTES = 64 * 1024;
const JSON_LIMIT_BYTES = 256 * 1024;
const IMAGE_LIMIT_BYTES = 1024 * 1024;
const OUTPUT_ITEM_LIMIT = 200;

export class OutputNormalizationService {
  private readonly decoder = new TextDecoder();

  public normalizeOutputs(outputs: readonly vscode.NotebookCellOutput[]): NormalizedOutput[] {
    const normalized: NormalizedOutput[] = [];

    for (const output of outputs) {
      for (const item of output.items) {
        if (normalized.length >= OUTPUT_ITEM_LIMIT) {
          return normalized;
        }

        normalized.push(this.normalizeItem(item));
      }
    }

    return normalized;
  }

  private normalizeItem(item: vscode.NotebookCellOutputItem): NormalizedOutput {
    const mime = item.mime;
    const rawBuffer = Buffer.from(item.data);

    if (mime.startsWith("image/")) {
      return this.normalizeImage(mime, rawBuffer);
    }

    if (mime === "text/markdown") {
      return this.normalizeText("markdown", mime, rawBuffer, TEXT_LIMIT_BYTES);
    }

    if (mime === "text/html") {
      const text = this.normalizeText("html", mime, rawBuffer, TEXT_LIMIT_BYTES);
      return {
        ...text,
        html: text.text,
        text: undefined,
      };
    }

    if (mime.includes("json")) {
      return this.normalizeJson(mime, rawBuffer);
    }

    if (mime.includes("error")) {
      return this.normalizeError(mime, rawBuffer);
    }

    if (mime.startsWith("text/")) {
      return this.normalizeText("text", mime, rawBuffer, TEXT_LIMIT_BYTES);
    }

    return {
      kind: "unknown",
      mime,
      text: this.decoder.decode(rawBuffer),
    };
  }

  private normalizeText(
    kind: "text" | "markdown" | "html",
    mime: string,
    rawBuffer: Buffer,
    limit: number,
  ): NormalizedOutput {
    const rawText = this.decoder.decode(rawBuffer);
    const limitedBuffer = rawBuffer.subarray(0, limit);
    return {
      kind,
      mime,
      text: this.decoder.decode(limitedBuffer),
      truncated: rawBuffer.byteLength > limit,
      original_bytes: rawBuffer.byteLength,
      returned_bytes: limitedBuffer.byteLength,
    };
  }

  private normalizeJson(mime: string, rawBuffer: Buffer): NormalizedOutput {
    const limitedBuffer = rawBuffer.subarray(0, JSON_LIMIT_BYTES);
    const text = this.decoder.decode(limitedBuffer);

    try {
      return {
        kind: "json",
        mime,
        json: JSON.parse(text),
        truncated: rawBuffer.byteLength > JSON_LIMIT_BYTES,
        original_bytes: rawBuffer.byteLength,
        returned_bytes: limitedBuffer.byteLength,
      };
    } catch {
      return {
        kind: "text",
        mime,
        text,
        truncated: rawBuffer.byteLength > JSON_LIMIT_BYTES,
        original_bytes: rawBuffer.byteLength,
        returned_bytes: limitedBuffer.byteLength,
      };
    }
  }

  private normalizeError(mime: string, rawBuffer: Buffer): NormalizedOutput {
    const text = this.decoder.decode(rawBuffer);

    try {
      const parsed = JSON.parse(text) as {
        name?: string;
        message?: string;
        stack?: string | string[];
      };
      return {
        kind: "error",
        mime,
        ename: parsed.name,
        evalue: parsed.message,
        traceback: Array.isArray(parsed.stack) ? parsed.stack : parsed.stack ? [parsed.stack] : [],
      };
    } catch {
      return {
        kind: "error",
        mime,
        evalue: text,
        traceback: [],
      };
    }
  }

  private normalizeImage(mime: string, rawBuffer: Buffer): NormalizedOutput {
    const limitedBuffer = rawBuffer.subarray(0, IMAGE_LIMIT_BYTES);
    return {
      kind: "image",
      mime,
      base64: limitedBuffer.toString("base64"),
      truncated: rawBuffer.byteLength > IMAGE_LIMIT_BYTES,
      original_bytes: rawBuffer.byteLength,
      returned_bytes: limitedBuffer.byteLength,
    };
  }
}
