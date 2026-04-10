import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
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

test("describeTool index includes list_variables", () => {
  const tools = new NotebookTools(async () => {
    throw new Error("client should not be called in this unit test");
  });

  const description = (tools as unknown as { describeTool: (toolName?: string) => Record<string, unknown> }).describeTool();
  assert.match(JSON.stringify(description.tools), /list_variables/);
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

test("parseExecuteCellsRequest accepts stop_on_error", () => {
  const tools = new NotebookTools(async () => {
    throw new Error("client should not be called in this unit test");
  });

  const request = (
    tools as unknown as {
      parseExecuteCellsRequest: (value: unknown) => {
        notebook_uri: string;
        cell_ids: string[];
        stop_on_error?: boolean;
      };
    }
  ).parseExecuteCellsRequest({
    notebook_uri: "file:///workspace/demo.ipynb",
    cell_ids: ["cell-1"],
    stop_on_error: false,
  });

  assert.equal(request.notebook_uri, "file:///workspace/demo.ipynb");
  assert.deepEqual(request.cell_ids, ["cell-1"]);
  assert.equal(request.stop_on_error, false);
});

test("parseExecuteCellsRequest coerces quoted wait_for_completion booleans", () => {
  const tools = new NotebookTools(async () => {
    throw new Error("client should not be called in this unit test");
  });

  const request = (
    tools as unknown as {
      parseExecuteCellsRequest: (value: unknown) => {
        notebook_uri: string;
        cell_ids: string[];
        wait_for_completion?: true;
      };
    }
  ).parseExecuteCellsRequest({
    notebook_uri: "file:///workspace/demo.ipynb",
    cell_ids: ["cell-1"],
    wait_for_completion: "true",
  });

  assert.equal(request.notebook_uri, "file:///workspace/demo.ipynb");
  assert.deepEqual(request.cell_ids, ["cell-1"]);
  assert.equal(request.wait_for_completion, true);
});

test("parseSelectKernelRequest requires kernel_id and extension_id together", () => {
  const tools = new NotebookTools(async () => {
    throw new Error("client should not be called in this unit test");
  });

  assert.throws(
    () =>
      (
        tools as unknown as {
          parseSelectKernelRequest: (value: unknown) => unknown;
        }
      ).parseSelectKernelRequest({
        notebook_uri: "file:///workspace/demo.ipynb",
        kernel_id: "python-env",
      }),
    /kernel_id and extension_id must be provided together/,
  );
});

test("parseWaitForKernelReadyRequest accepts timeout and target generation", () => {
  const tools = new NotebookTools(async () => {
    throw new Error("client should not be called in this unit test");
  });

  const request = (
    tools as unknown as {
      parseWaitForKernelReadyRequest: (value: unknown) => {
        notebook_uri: string;
        timeout_ms?: number;
        target_generation?: number;
      };
    }
  ).parseWaitForKernelReadyRequest({
    notebook_uri: "file:///workspace/demo.ipynb",
    timeout_ms: 45000,
    target_generation: 2,
  });

  assert.equal(request.notebook_uri, "file:///workspace/demo.ipynb");
  assert.equal(request.timeout_ms, 45000);
  assert.equal(request.target_generation, 2);
});

test("parseListVariablesRequest accepts optional query and max_results", () => {
  const tools = new NotebookTools(async () => {
    throw new Error("client should not be called in this unit test");
  });

  const request = (
    tools as unknown as {
      parseListVariablesRequest: (value: unknown) => {
        notebook_uri: string;
        query?: string;
        offset?: number;
        max_results?: number;
      };
    }
  ).parseListVariablesRequest({
    notebook_uri: "file:///workspace/demo.ipynb",
    query: "df",
    offset: 25,
    max_results: 25,
  });

  assert.equal(request.notebook_uri, "file:///workspace/demo.ipynb");
  assert.equal(request.query, "df");
  assert.equal(request.offset, 25);
  assert.equal(request.max_results, 25);
});

test("toErrorToolResult returns structured invalid request details", () => {
  const tools = new NotebookTools(async () => {
    throw new Error("client should not be called in this unit test");
  });

  const result = (
    tools as unknown as {
      toErrorToolResult: (error: unknown) => { isError?: boolean; content: Array<Record<string, unknown>> };
    }
  ).toErrorToolResult(new Error("Invalid arguments for tool execute_cells: notebook_uri must be a non-empty string."));

  assert.equal(result.isError, true);
  const payload = JSON.parse(String(result.content[0]?.text)) as {
    error: { code: string; message: string; recoverable?: boolean };
  };
  assert.equal(payload.error.code, "InvalidRequest");
  assert.equal(payload.error.recoverable, true);
  assert.match(payload.error.message, /Invalid arguments for tool execute_cells/);
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
        include_rich_output_text?: boolean;
        output_file_path?: string;
        range?: { start: number; end: number };
        cell_ids?: string[];
      };
    }
  ).parseReadNotebookRequest({
    notebook_uri: "file:///workspace/demo.ipynb",
    include_outputs: true,
    include_rich_output_text: true,
    output_file_path: "tmp/notebook.json",
    range: { start: 0, end: 3 },
    cell_ids: ["cell-1", "cell-2"],
  });

  assert.equal(request.notebook_uri, "file:///workspace/demo.ipynb");
  assert.equal(request.include_outputs, true);
  assert.equal(request.include_rich_output_text, true);
  assert.equal(request.output_file_path, "tmp/notebook.json");
  assert.deepEqual(request.range, { start: 0, end: 3 });
  assert.deepEqual(request.cell_ids, ["cell-1", "cell-2"]);
});

test("parseReadCellOutputsRequest accepts include_rich_output_text", () => {
  const tools = new NotebookTools(async () => {
    throw new Error("client should not be called in this unit test");
  });

  const request = (
    tools as unknown as {
      parseReadCellOutputsRequest: (value: unknown) => {
        notebook_uri: string;
        cell_id: string;
        include_rich_output_text?: boolean;
        output_file_path?: string;
      };
    }
  ).parseReadCellOutputsRequest({
    notebook_uri: "file:///workspace/demo.ipynb",
    cell_id: "cell-1",
    include_rich_output_text: true,
    output_file_path: "tmp/cell-output.json",
  });

  assert.equal(request.notebook_uri, "file:///workspace/demo.ipynb");
  assert.equal(request.cell_id, "cell-1");
  assert.equal(request.include_rich_output_text, true);
  assert.equal(request.output_file_path, "tmp/cell-output.json");
});

test("routeResultToFileIfRequested writes a compact receipt instead of returning the payload", async () => {
  const tools = new NotebookTools(async () => {
    throw new Error("client should not be called in this unit test");
  });

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "jupyter-mcp-outputs-"));
  const targetPath = path.join(tempDir, "cell-output.json");
  const payload = {
    notebook_uri: "file:///workspace/demo.ipynb",
    cell_id: "cell-1",
    outputs: [{ kind: "json", mime: "application/json", json: { a: 1 } }],
  };

  const receipt = await (
    tools as unknown as {
      routeResultToFileIfRequested: (
        toolName: "read_notebook" | "read_cell_outputs",
        result: unknown,
        outputFilePath?: string,
      ) => Promise<{ written_to_file: boolean; output_file_path: string; bytes_written: number }>;
    }
  ).routeResultToFileIfRequested("read_cell_outputs", payload, targetPath);

  assert.equal(receipt.written_to_file, true);
  assert.equal(receipt.output_file_path, targetPath);
  assert.ok(receipt.bytes_written > 0);

  const stored = JSON.parse(await fs.readFile(targetPath, "utf8")) as typeof payload;
  assert.deepEqual(stored, payload);
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

test("parseListNotebookCellsRequest coerces quoted integer range values", () => {
  const tools = new NotebookTools(async () => {
    throw new Error("client should not be called in this unit test");
  });

  const request = (
    tools as unknown as {
      parseListNotebookCellsRequest: (value: unknown) => {
        notebook_uri: string;
        range?: { start: number; end: number };
      };
    }
  ).parseListNotebookCellsRequest({
    notebook_uri: "file:///workspace/demo.ipynb",
    range: { start: 0, end: "2" },
  });

  assert.equal(request.notebook_uri, "file:///workspace/demo.ipynb");
  assert.deepEqual(request.range, { start: 0, end: 2 });
});

test("parseExecuteCellsRequest reports a helpful boolean hint for invalid strings", () => {
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
        wait_for_completion: "yes",
      }),
    /Use true or false, not "yes"\./,
  );
});

test("describeTool includes notebook rules and the preview tool", () => {
  const tools = new NotebookTools(async () => {
    throw new Error("client should not be called in this unit test");
  });

  const description = (tools as unknown as { describeTool: (toolName?: string) => Record<string, unknown> }).describeTool();

  assert.ok(Array.isArray(description.notebook_rules));
  assert.match(JSON.stringify(description.tools), /list_notebook_cells/);
  assert.match(JSON.stringify(description.tools), /wait_for_kernel_ready/);
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

test("parseFindSymbolsRequest accepts targeted semantic navigation queries", () => {
  const tools = new NotebookTools(async () => {
    throw new Error("client should not be called in this unit test");
  });

  const request = (
    tools as unknown as {
      parseFindSymbolsRequest: (value: unknown) => {
        notebook_uri: string;
        query?: string;
        range?: { start: number; end: number };
        cell_ids?: string[];
      };
    }
  ).parseFindSymbolsRequest({
    notebook_uri: "file:///workspace/demo.ipynb",
    query: "Trainer",
    range: { start: 5, end: 12 },
    cell_ids: ["cell-7"],
  });

  assert.equal(request.notebook_uri, "file:///workspace/demo.ipynb");
  assert.equal(request.query, "Trainer");
  assert.deepEqual(request.range, { start: 5, end: 12 });
  assert.deepEqual(request.cell_ids, ["cell-7"]);
});

test("parseGetDiagnosticsRequest accepts severity filters", () => {
  const tools = new NotebookTools(async () => {
    throw new Error("client should not be called in this unit test");
  });

  const request = (
    tools as unknown as {
      parseGetDiagnosticsRequest: (value: unknown) => {
        notebook_uri: string;
        severities?: string[];
        max_results?: number;
      };
    }
  ).parseGetDiagnosticsRequest({
    notebook_uri: "file:///workspace/demo.ipynb",
    severities: ["error", "warning"],
    max_results: 25,
  });

  assert.equal(request.notebook_uri, "file:///workspace/demo.ipynb");
  assert.deepEqual(request.severities, ["error", "warning"]);
  assert.equal(request.max_results, 25);
});

test("parseGoToDefinitionRequest requires an exact cell position", () => {
  const tools = new NotebookTools(async () => {
    throw new Error("client should not be called in this unit test");
  });

  const request = (
    tools as unknown as {
      parseGoToDefinitionRequest: (value: unknown) => {
        notebook_uri: string;
        cell_id: string;
        line: number;
        column: number;
        expected_cell_source_sha256?: string;
      };
    }
  ).parseGoToDefinitionRequest({
    notebook_uri: "file:///workspace/demo.ipynb",
    cell_id: "cell-4",
    line: 12,
    column: 9,
    expected_cell_source_sha256: "sha",
  });

  assert.equal(request.cell_id, "cell-4");
  assert.equal(request.line, 12);
  assert.equal(request.column, 9);
  assert.equal(request.expected_cell_source_sha256, "sha");
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

test("parseFormatCellRequest accepts stale-safe formatter requests", () => {
  const tools = new NotebookTools(async () => {
    throw new Error("client should not be called in this unit test");
  });

  const request = (
    tools as unknown as {
      parseFormatCellRequest: (value: unknown) => {
        notebook_uri: string;
        cell_id: string;
        expected_notebook_version?: number;
        expected_cell_source_sha256?: string;
      };
    }
  ).parseFormatCellRequest({
    notebook_uri: "file:///workspace/demo.ipynb",
    cell_id: "cell-3",
    expected_notebook_version: 11,
    expected_cell_source_sha256: "sha-3",
  });

  assert.equal(request.cell_id, "cell-3");
  assert.equal(request.expected_notebook_version, 11);
  assert.equal(request.expected_cell_source_sha256, "sha-3");
});
