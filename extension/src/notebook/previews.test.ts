import assert from "node:assert/strict";
import test from "node:test";
import { buildNotebookCellPreviews, buildSourcePreview, summarizeOutputKinds } from "./previews";

test("buildSourcePreview trims markdown headings and truncates long lines", () => {
  assert.equal(buildSourcePreview("markdown", "# Section Title"), "Section Title");
  assert.match(
    buildSourcePreview("code", `print("${"x".repeat(200)}")`),
    /^print\("x{100,}.*…$/,
  );
});

test("summarizeOutputKinds maps mime types without decoding payloads", () => {
  assert.deepEqual(
    summarizeOutputKinds(["image/png", "application/json", "text/plain", "text/plain"]),
    ["image", "json", "text"],
  );
});

test("buildNotebookCellPreviews adds section paths and cheap cell summaries", () => {
  const previews = buildNotebookCellPreviews(
    [
      {
        cell_id: "c1",
        index: 0,
        kind: "markdown",
        language: null,
        source: "# Intro",
        source_sha256: "sha-c1",
        execution_status: null,
        execution_order: null,
        started_at: null,
        ended_at: null,
        output_mime_types: [],
      },
      {
        cell_id: "c2",
        index: 1,
        kind: "code",
        language: "python",
        source: "x = 1\nprint(x)",
        source_sha256: "sha-c2",
        execution_status: "succeeded",
        execution_order: 7,
        started_at: "2026-04-10T10:00:00.000Z",
        ended_at: "2026-04-10T10:00:02.000Z",
        output_mime_types: ["text/plain"],
      },
      {
        cell_id: "c3",
        index: 2,
        kind: "code",
        language: "python",
        source: "y = x + 1",
        source_sha256: "sha-c3",
        execution_status: null,
        execution_order: null,
        started_at: null,
        ended_at: null,
        output_mime_types: [],
      },
    ],
    [
      {
        cell_id: "c1",
        cell_index: 0,
        level: 1,
        title: "Intro",
        path: ["Intro"],
        section_end_cell_index_exclusive: 3,
      },
    ],
  );

  assert.deepEqual(previews, [
    {
      cell_id: "c1",
      index: 0,
      kind: "markdown",
      language: null,
      source_preview: "Intro",
      source_line_count: 1,
      source_sha256: "sha-c1",
      execution_status: null,
      execution_order: null,
      started_at: null,
      ended_at: null,
      has_outputs: false,
      output_kinds: [],
      section_path: ["Intro"],
    },
    {
      cell_id: "c2",
      index: 1,
      kind: "code",
      language: "python",
      source_preview: "x = 1",
      source_line_count: 2,
      source_sha256: "sha-c2",
      execution_status: "succeeded",
      execution_order: 7,
      started_at: "2026-04-10T10:00:00.000Z",
      ended_at: "2026-04-10T10:00:02.000Z",
      has_outputs: true,
      output_kinds: ["text"],
      section_path: ["Intro"],
    },
    {
      cell_id: "c3",
      index: 2,
      kind: "code",
      language: "python",
      source_preview: "y = x + 1",
      source_line_count: 1,
      source_sha256: "sha-c3",
      execution_status: null,
      execution_order: null,
      started_at: null,
      ended_at: null,
      has_outputs: false,
      output_kinds: [],
      section_path: ["Intro"],
    },
  ]);
});
