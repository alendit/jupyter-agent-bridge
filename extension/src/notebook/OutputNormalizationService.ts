import * as vscode from "vscode";
import { NormalizedOutput } from "../../../packages/protocol/src";

const TEXT_LIMIT_BYTES = 64 * 1024;
const JSON_LIMIT_BYTES = 256 * 1024;
const IMAGE_LIMIT_BYTES = 1024 * 1024;
const OUTPUT_ITEM_LIMIT = 200;

interface NormalizeOutputOptions {
  includeRichOutputText?: boolean;
}

export class OutputNormalizationService {
  private readonly decoder = new TextDecoder();

  public normalizeOutputs(
    outputs: readonly vscode.NotebookCellOutput[],
    options: NormalizeOutputOptions = {},
  ): NormalizedOutput[] {
    const normalized: NormalizedOutput[] = [];

    for (const output of outputs) {
      for (const item of output.items) {
        if (normalized.length >= OUTPUT_ITEM_LIMIT) {
          return normalized;
        }

        for (const normalizedItem of this.normalizeItem(item, options)) {
          if (normalized.length >= OUTPUT_ITEM_LIMIT) {
            return normalized;
          }

          normalized.push(normalizedItem);
        }
      }
    }

    return normalized;
  }

  private normalizeItem(item: vscode.NotebookCellOutputItem, options: NormalizeOutputOptions): NormalizedOutput[] {
    const mime = item.mime;
    const rawBuffer = Buffer.from(item.data);

    if (mime.startsWith("image/")) {
      return [this.normalizeImage(mime, rawBuffer)];
    }

    if (mime === "application/vnd.code.notebook.stdout") {
      return [this.normalizeText("stdout", mime, rawBuffer, TEXT_LIMIT_BYTES)];
    }

    if (mime === "application/vnd.code.notebook.stderr") {
      return [this.normalizeText("stderr", mime, rawBuffer, TEXT_LIMIT_BYTES)];
    }

    if (mime === "application/vnd.code.notebook.error") {
      return [this.normalizeError(mime, rawBuffer)];
    }

    if (mime === "application/vnd.plotly.v1+json") {
      return this.normalizePlotlyBundle(mime, rawBuffer, options);
    }

    if (!options.includeRichOutputText && this.isRichRenderedMime(mime)) {
      return [this.normalizeOmittedRenderedOutput(mime, rawBuffer)];
    }

    if (mime === "text/markdown") {
      return [this.normalizeText("markdown", mime, rawBuffer, TEXT_LIMIT_BYTES)];
    }

    if (mime === "text/html") {
      const text = this.normalizeText("html", mime, rawBuffer, TEXT_LIMIT_BYTES);
      return [{
        ...text,
        html: text.text,
        text: undefined,
      }];
    }

    if (mime.includes("json")) {
      return [this.normalizeJson(mime, rawBuffer)];
    }

    if (mime.includes("error")) {
      return [this.normalizeError(mime, rawBuffer)];
    }

    if (mime.startsWith("text/")) {
      return [this.normalizeText("text", mime, rawBuffer, TEXT_LIMIT_BYTES)];
    }

    return [{
      kind: "unknown",
      mime,
      text: this.decoder.decode(rawBuffer),
    }];
  }

  private normalizeOmittedRenderedOutput(mime: string, rawBuffer: Buffer): NormalizedOutput {
    return {
      kind: this.classifyRenderedOutputKind(mime),
      mime,
      summary: this.buildOmittedRenderedOutputSummary(mime),
      omitted: true,
      original_bytes: rawBuffer.byteLength,
    };
  }

  private buildOmittedRenderedOutputSummary(mime: string): string {
    if (mime === "application/vnd.plotly.v1+json") {
      return 'Rendered Plotly output omitted by default. Prefer `import plotly.io; plotly.io.renderers.default = "vscode+png"` (equivalently `plotly_mimetype+png`). Install `kaleido` in the notebook environment if Plotly needs static image rendering support to emit the PNG snapshot the MCP can return in an agent-readable format. Re-run with include_rich_output_text=true only when the raw Plotly payload is needed.';
    }

    return "Rendered output omitted by default. Re-run with include_rich_output_text=true to inspect the raw payload.";
  }

  private normalizeText(
    kind: "text" | "markdown" | "html" | "stdout" | "stderr",
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

  private normalizePlotlyBundle(
    mime: string,
    rawBuffer: Buffer,
    options: NormalizeOutputOptions,
  ): NormalizedOutput[] {
    const limitedBuffer = rawBuffer.subarray(0, JSON_LIMIT_BYTES);
    const text = this.decoder.decode(limitedBuffer);

    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const plotlyOutput = options.includeRichOutputText
        ? this.normalizeJson(mime, rawBuffer)
        : this.normalizeOmittedRenderedOutput(mime, rawBuffer);

      const embeddedImages = this.extractEmbeddedPlotlyImages(parsed);
      return [plotlyOutput, ...embeddedImages];
    } catch {
      return options.includeRichOutputText
        ? [this.normalizeJson(mime, rawBuffer)]
        : [this.normalizeOmittedRenderedOutput(mime, rawBuffer)];
    }
  }

  private extractEmbeddedPlotlyImages(payload: Record<string, unknown>): NormalizedOutput[] {
    const images: NormalizedOutput[] = [];

    for (const [mime, value] of Object.entries(payload)) {
      if (!mime.startsWith("image/") || typeof value !== "string") {
        continue;
      }

      const normalized = this.normalizeEmbeddedImage(mime, value);
      if (normalized) {
        images.push(normalized);
      }
    }

    return images;
  }

  private normalizeEmbeddedImage(mime: string, value: string): NormalizedOutput | null {
    const dataUriMatch = value.match(/^data:([^;,]+)(;base64)?,(.*)$/s);
    if (dataUriMatch) {
      const [, dataUriMime, base64Marker, body] = dataUriMatch;
      if (dataUriMime !== mime) {
        return null;
      }

      if (base64Marker) {
        return this.normalizeImageBase64String(mime, body);
      }

      return this.normalizeImageTextString(mime, decodeURIComponent(body));
    }

    if (mime === "image/svg+xml") {
      return this.normalizeImageTextString(mime, value);
    }

    return this.normalizeImageBase64String(mime, value);
  }

  private normalizeImageBase64String(mime: string, base64: string): NormalizedOutput | null {
    try {
      const rawBuffer = Buffer.from(base64, "base64");
      if (rawBuffer.toString("base64") !== base64.replace(/\s+/g, "")) {
        return null;
      }

      return this.normalizeImage(mime, rawBuffer);
    } catch {
      return null;
    }
  }

  private normalizeImageTextString(mime: string, text: string): NormalizedOutput {
    return this.normalizeImage(mime, Buffer.from(text));
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

  private isRichRenderedMime(mime: string): boolean {
    return (
      mime === "text/html" ||
      mime === "application/javascript" ||
      mime === "text/javascript" ||
      mime.startsWith("application/vnd.")
    );
  }

  private classifyRenderedOutputKind(mime: string): NormalizedOutput["kind"] {
    if (mime === "text/html") {
      return "html";
    }

    if (mime.includes("json")) {
      return "json";
    }

    if (mime.startsWith("text/")) {
      return "text";
    }

    return "unknown";
  }
}
