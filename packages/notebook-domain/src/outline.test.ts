import assert from "node:assert/strict";
import test from "node:test";
import { buildNotebookOutline, extractMarkdownHeadings } from "./outline";

test("extractMarkdownHeadings skips fenced code blocks and preserves heading levels", () => {
  const headings = extractMarkdownHeadings([
    "# Top",
    "```python",
    "# not a heading",
    "```",
    "## Inner",
    "~~~md",
    "### also not a heading",
    "~~~",
  ].join("\n"));

  assert.deepEqual(headings, [
    { level: 1, title: "Top" },
    { level: 2, title: "Inner" },
  ]);
});

test("buildNotebookOutline returns heading paths and section end indexes", () => {
  const outline = buildNotebookOutline([
    { cell_id: "c1", index: 0, kind: "markdown", source: "# Intro" },
    { cell_id: "c2", index: 1, kind: "code", source: "print(1)" },
    { cell_id: "c3", index: 2, kind: "markdown", source: "## Details\n### Deep Dive" },
    { cell_id: "c4", index: 3, kind: "code", source: "print(2)" },
    { cell_id: "c5", index: 4, kind: "markdown", source: "# Next" },
  ]);

  assert.deepEqual(outline, [
    {
      cell_id: "c1",
      cell_index: 0,
      level: 1,
      title: "Intro",
      path: ["Intro"],
      section_end_cell_index_exclusive: 4,
    },
    {
      cell_id: "c3",
      cell_index: 2,
      level: 2,
      title: "Details",
      path: ["Intro", "Details"],
      section_end_cell_index_exclusive: 4,
    },
    {
      cell_id: "c3",
      cell_index: 2,
      level: 3,
      title: "Deep Dive",
      path: ["Intro", "Details", "Deep Dive"],
      section_end_cell_index_exclusive: 4,
    },
    {
      cell_id: "c5",
      cell_index: 4,
      level: 1,
      title: "Next",
      path: ["Next"],
      section_end_cell_index_exclusive: 5,
    },
  ]);
});
