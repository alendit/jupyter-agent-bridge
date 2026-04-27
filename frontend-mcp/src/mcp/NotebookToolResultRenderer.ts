import { asBridgeError, NormalizedOutput } from "../../../packages/protocol/src";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { CallToolResult, ImageContent } from "@modelcontextprotocol/sdk/types.js";

export class NotebookToolResultRenderer {
  public async routeResultToFileIfRequested(
    toolName: "read_notebook" | "read_cell_outputs",
    result: unknown,
    outputFilePath?: string,
  ): Promise<unknown> {
    if (!outputFilePath) {
      return result;
    }

    const resolvedPath = path.resolve(outputFilePath);
    const serialized = `${JSON.stringify(result, null, 2)}\n`;
    await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
    await fs.writeFile(resolvedPath, serialized, "utf8");

    return {
      written_to_file: true,
      tool: toolName,
      output_file_path: resolvedPath,
      bytes_written: Buffer.byteLength(serialized),
      summary: "Result written to file and omitted from MCP text content.",
    };
  }

  public toToolResult(result: unknown): CallToolResult {
    const images: ImageContent[] = [];
    const textResult = this.serializeForTextContent(result, images);

    return {
      structuredContent: this.toStructuredContent(textResult),
      content: [
        {
          type: "text",
          text: JSON.stringify(textResult, null, 2),
        },
        ...images,
      ],
    };
  }

  public toErrorToolResult(error: unknown): CallToolResult {
    const bridgeError =
      error instanceof Error && error.message.startsWith("Invalid arguments for tool")
        ? {
            code: "InvalidRequest",
            message: error.message,
            recoverable: true,
          }
        : asBridgeError(error);

    return {
      isError: true,
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: bridgeError }, null, 2),
        },
      ],
    };
  }

  private toStructuredContent(result: unknown): Record<string, unknown> {
    if (Array.isArray(result)) {
      return { notebooks: result };
    }

    if (result && typeof result === "object") {
      return result as Record<string, unknown>;
    }

    return { result };
  }

  private serializeForTextContent(value: unknown, images: ImageContent[]): unknown {
    if (this.isNormalizedImageOutput(value)) {
      const imageIndex = images.length + 1;
      images.push({
        type: "image",
        data: value.base64,
        mimeType: value.mime,
      });

      return {
        ...value,
        base64: `[omitted: see MCP image content ${imageIndex}]`,
        mcp_image_index: imageIndex,
      };
    }

    if (Array.isArray(value)) {
      return value.map((entry) => this.serializeForTextContent(entry, images));
    }

    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [key, this.serializeForTextContent(entry, images)]),
      );
    }

    return value;
  }

  private isNormalizedImageOutput(
    value: unknown,
  ): value is NormalizedOutput & { kind: "image"; mime: string; base64: string } {
    if (!value || typeof value !== "object") {
      return false;
    }

    const candidate = value as Partial<NormalizedOutput>;
    return candidate.kind === "image" && typeof candidate.mime === "string" && typeof candidate.base64 === "string";
  }
}
