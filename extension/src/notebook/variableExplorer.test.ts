import assert from "node:assert/strict";
import test from "node:test";
import { normalizeNotebookVariable, selectNotebookVariables } from "./variableExplorer";

test("normalizeNotebookVariable keeps stable explorer fields", () => {
  assert.deepEqual(
    normalizeNotebookVariable({
      name: "df",
      type: "DataFrame",
      value: "<1000x4 dataframe>",
      summary: "1000 rows x 4 cols",
      size: "1000x4",
      shape: "(1000, 4)",
      supportsDataExplorer: true,
      ignored: "value",
    }),
    {
      name: "df",
      type: "DataFrame",
      value_preview: "<1000x4 dataframe>",
      summary: "1000 rows x 4 cols",
      size: "1000x4",
      shape: "(1000, 4)",
      supports_data_explorer: true,
    },
  );
});

test("selectNotebookVariables filters and truncates normalized variables", () => {
  const result = selectNotebookVariables(
    [
      { name: "df_train", type: "DataFrame", value: "<train>", supportsDataExplorer: true },
      { name: "df_test", type: "DataFrame", value: "<test>", supportsDataExplorer: true },
      { name: "model", type: "Pipeline", value: "<pipeline>", supportsDataExplorer: false },
    ],
    {
      notebook_uri: "file:///workspace/demo.ipynb",
      query: "df",
      offset: 1,
      max_results: 1,
    },
  );

  assert.equal(result.offset, 1);
  assert.equal(result.max_results, 1);
  assert.equal(result.total_available, 2);
  assert.equal(result.next_offset, null);
  assert.equal(result.truncated, false);
  assert.deepEqual(result.variables, [
    {
      name: "df_test",
      type: "DataFrame",
      value_preview: "<test>",
      summary: null,
      size: null,
      shape: null,
      supports_data_explorer: true,
    },
  ]);
});

test("normalizeNotebookVariable truncates long preview values", () => {
  const value = "x".repeat(400);
  const variable = normalizeNotebookVariable({
    name: "long_value",
    value,
  });

  assert.equal(variable?.value_preview?.endsWith("…"), true);
  assert.equal(variable?.value_preview?.length, 240);
});
