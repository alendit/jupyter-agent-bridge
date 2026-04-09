import test from "node:test";
import assert from "node:assert/strict";
import { NotebookTools } from "./NotebookTools";

test("toToolResult emits native MCP image content and omits base64 from text payloads", async () => {
  const tools = new NotebookTools(async () => {
    throw new Error("client should not be called in this unit test");
  });

  const result = {
    notebook_uri: "file:///workspace/demo.ipynb",
    results: [
      {
        cell_id: "cell-1",
        outputs: [
          {
            kind: "text",
            mime: "text/plain",
            text: "hello",
          },
          {
            kind: "image",
            mime: "image/png",
            base64: "aGVsbG8=",
            returned_bytes: 5,
          },
        ],
      },
      {
        cell_id: "cell-2",
        outputs: [
          {
            kind: "image",
            mime: "image/jpeg",
            base64: "d29ybGQ=",
            truncated: true,
            returned_bytes: 5,
          },
        ],
      },
    ],
  };

  const toolResult = (tools as unknown as { toToolResult: (value: unknown) => { content: Array<Record<string, unknown>> } }).toToolResult(
    result,
  );

  assert.equal(toolResult.content.length, 3);
  assert.deepEqual(toolResult.content[1], {
    type: "image",
    data: "aGVsbG8=",
    mimeType: "image/png",
  });
  assert.deepEqual(toolResult.content[2], {
    type: "image",
    data: "d29ybGQ=",
    mimeType: "image/jpeg",
  });

  const parsed = JSON.parse(String(toolResult.content[0]?.text)) as {
    results: Array<{ outputs: Array<Record<string, unknown>> }>;
  };
  assert.equal(parsed.results[0]?.outputs[1]?.base64, "[omitted: see MCP image content 1]");
  assert.equal(parsed.results[0]?.outputs[1]?.mcp_image_index, 1);
  assert.equal(parsed.results[1]?.outputs[0]?.base64, "[omitted: see MCP image content 2]");
  assert.equal(parsed.results[1]?.outputs[0]?.mcp_image_index, 2);
});

test("normalizeInsertCellRequest accepts the simpler position.mode shape", () => {
  const tools = new NotebookTools(async () => {
    throw new Error("client should not be called in this unit test");
  });

  const request = (
    tools as unknown as {
      normalizeInsertCellRequest: (value: unknown) => {
        notebook_uri: string;
        position: Record<string, unknown>;
        cell: Record<string, unknown>;
      };
    }
  ).normalizeInsertCellRequest({
    notebook_uri: "file:///workspace/demo.ipynb",
    position: {
      mode: "after_cell_id",
      cell_id: "cell-1",
    },
    cell: {
      kind: "markdown",
      source: "## Notes",
    },
  });

  assert.equal(request.notebook_uri, "file:///workspace/demo.ipynb");
  assert.deepEqual(request.position, { after_cell_id: "cell-1" });
  assert.deepEqual(request.cell, { kind: "markdown", source: "## Notes" });
});

test("normalizeInsertCellRequest reports a did-you-mean suggestion for bad position keys", () => {
  const tools = new NotebookTools(async () => {
    throw new Error("client should not be called in this unit test");
  });

  assert.throws(
    () =>
      (
        tools as unknown as {
          normalizeInsertCellRequest: (value: unknown) => unknown;
        }
      ).normalizeInsertCellRequest({
        notebook_uri: "file:///workspace/demo.ipynb",
        position: {
          after: "cell-1",
        },
        cell: {
          kind: "markdown",
          source: "## Notes",
        },
      }),
    /Unknown key "after"; expected "after_cell_id"\./,
  );
});

test("describeTool returns exact schema and examples for insert_cell", () => {
  const tools = new NotebookTools(async () => {
    throw new Error("client should not be called in this unit test");
  });

  const description = (tools as unknown as { describeTool: (toolName?: string) => Record<string, unknown> }).describeTool(
    "insert_cell",
  );

  assert.equal(description.name, "insert_cell");
  assert.match(String(description.schema), /position/);
  assert.ok(Array.isArray(description.examples));
  assert.match(String((description.examples as string[])[0]), /"mode":"at_end"/);
});
