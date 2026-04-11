import assert from "node:assert/strict";
import test from "node:test";
import { prepareSearchQuery, searchPreparedCells } from "./searchCore";

test("searchPreparedCells finds matches with section context and filters", () => {
  const query = prepareSearchQuery({
    notebook_uri: "file:///workspace/demo.ipynb",
    query: "model",
    cell_kind: "code",
  });

  const result = searchPreparedCells(
    [
      {
        cell_id: "c1",
        cell_index: 0,
        kind: "code",
        section_path: ["Training"],
        source_fingerprint: "sha-c1",
        lines: ["fit_model(x)", "plot_model(x)"],
        lines_lowercase: ["fit_model(x)", "plot_model(x)"],
      },
      {
        cell_id: "c2",
        cell_index: 1,
        kind: "markdown",
        section_path: ["Notes"],
        source_fingerprint: "sha-c2",
        lines: ["# model notes"],
        lines_lowercase: ["# model notes"],
      },
    ],
    query,
  );

  assert.deepEqual(result, {
    truncated: false,
    matches: [
      {
        cell_id: "c1",
        cell_index: 0,
        kind: "code",
        line: 1,
        column: 5,
        match_text: "model",
        line_text: "fit_model(x)",
        section_path: ["Training"],
        source_fingerprint: "sha-c1",
      },
      {
        cell_id: "c1",
        cell_index: 0,
        kind: "code",
        line: 2,
        column: 6,
        match_text: "model",
        line_text: "plot_model(x)",
        section_path: ["Training"],
        source_fingerprint: "sha-c1",
      },
    ],
  });
});

test("prepareSearchQuery validates regular expressions", () => {
  assert.throws(
    () =>
      prepareSearchQuery({
        notebook_uri: "file:///workspace/demo.ipynb",
        query: "(",
        regex: true,
      }),
    /not a valid regular expression/,
  );
});
