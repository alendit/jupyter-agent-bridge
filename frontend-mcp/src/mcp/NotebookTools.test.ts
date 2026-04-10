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

test("parseOpenNotebookRequest suggests the expected key name", () => {
  const tools = new NotebookTools(async () => {
    throw new Error("client should not be called in this unit test");
  });

  assert.throws(
    () =>
      (
        tools as unknown as {
          parseOpenNotebookRequest: (value: unknown) => unknown;
        }
      ).parseOpenNotebookRequest({
        notebook: "file:///workspace/demo.ipynb",
      }),
    /Unknown key "notebook"; expected "notebook_uri"\./,
  );
});

test("parseExecuteCellsRequest rejects false wait_for_completion with a clear message", () => {
  const tools = new NotebookTools(async () => {
    throw new Error("client should not be called in this unit test");
  });

  assert.throws(
    () =>
      (
        tools as unknown as {
          parseExecuteCellsRequest: (value: unknown) => unknown;
        }
      ).parseExecuteCellsRequest({
        notebook_uri: "file:///workspace/demo.ipynb",
        cell_ids: ["cell-1"],
        wait_for_completion: false,
      }),
    /wait_for_completion may be omitted or set to true, but false is not supported\./,
  );
});

test("parseReadNotebookRequest accepts range and cell_ids with clear shapes", () => {
  const tools = new NotebookTools(async () => {
    throw new Error("client should not be called in this unit test");
  });

  const request = (
    tools as unknown as {
      parseReadNotebookRequest: (value: unknown) => {
        notebook_uri: string;
        include_outputs?: boolean;
        range?: { start: number; end: number };
        cell_ids?: string[];
      };
    }
  ).parseReadNotebookRequest({
    notebook_uri: "file:///workspace/demo.ipynb",
    include_outputs: true,
    range: { start: 0, end: 3 },
    cell_ids: ["cell-1", "cell-2"],
  });

  assert.equal(request.notebook_uri, "file:///workspace/demo.ipynb");
  assert.equal(request.include_outputs, true);
  assert.deepEqual(request.range, { start: 0, end: 3 });
  assert.deepEqual(request.cell_ids, ["cell-1", "cell-2"]);
});

test("parseListNotebookCellsRequest accepts targeted preview queries", () => {
  const tools = new NotebookTools(async () => {
    throw new Error("client should not be called in this unit test");
  });

  const request = (
    tools as unknown as {
      parseListNotebookCellsRequest: (value: unknown) => {
        notebook_uri: string;
        range?: { start: number; end: number };
        cell_ids?: string[];
      };
    }
  ).parseListNotebookCellsRequest({
    notebook_uri: "file:///workspace/demo.ipynb",
    range: { start: 10, end: 20 },
    cell_ids: ["cell-10", "cell-11"],
  });

  assert.equal(request.notebook_uri, "file:///workspace/demo.ipynb");
  assert.deepEqual(request.range, { start: 10, end: 20 });
  assert.deepEqual(request.cell_ids, ["cell-10", "cell-11"]);
});

test("describeTool includes notebook rules and the preview tool", () => {
  const tools = new NotebookTools(async () => {
    throw new Error("client should not be called in this unit test");
  });

  const description = (tools as unknown as { describeTool: (toolName?: string) => Record<string, unknown> }).describeTool();

  assert.ok(Array.isArray(description.notebook_rules));
  assert.match(JSON.stringify(description.tools), /list_notebook_cells/);
});

test("parseSearchNotebookRequest accepts targeted search options", () => {
  const tools = new NotebookTools(async () => {
    throw new Error("client should not be called in this unit test");
  });

  const request = (
    tools as unknown as {
      parseSearchNotebookRequest: (value: unknown) => {
        notebook_uri: string;
        query: string;
        regex?: boolean;
        whole_word?: boolean;
        cell_kind?: string;
      };
    }
  ).parseSearchNotebookRequest({
    notebook_uri: "file:///workspace/demo.ipynb",
    query: "fit_model",
    regex: false,
    whole_word: true,
    cell_kind: "code",
  });

  assert.equal(request.notebook_uri, "file:///workspace/demo.ipynb");
  assert.equal(request.query, "fit_model");
  assert.equal(request.whole_word, true);
  assert.equal(request.cell_kind, "code");
});

test("parsePatchCellSourceRequest accepts source hash guarded patch edits", () => {
  const tools = new NotebookTools(async () => {
    throw new Error("client should not be called in this unit test");
  });

  const request = (
    tools as unknown as {
      parsePatchCellSourceRequest: (value: unknown) => {
        notebook_uri: string;
        cell_id: string;
        patch: string;
        format?: string;
        expected_cell_source_sha256?: string;
      };
    }
  ).parsePatchCellSourceRequest({
    notebook_uri: "file:///workspace/demo.ipynb",
    cell_id: "cell-1",
    patch: "@@\n-print(x)\n+print(x + 1)",
    format: "unified_diff",
    expected_cell_source_sha256: "abc123",
  });

  assert.equal(request.cell_id, "cell-1");
  assert.equal(request.format, "unified_diff");
  assert.equal(request.expected_cell_source_sha256, "abc123");
});
