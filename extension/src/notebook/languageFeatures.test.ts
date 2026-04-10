import assert from "node:assert/strict";
import test from "node:test";
import {
  applyTextEdits,
  diagnosticCodeToString,
  diagnosticSeverityToProtocol,
  flattenProvidedSymbols,
} from "./languageFeatures";

test("flattenProvidedSymbols flattens nested document symbols and filters by query", () => {
  const result = flattenProvidedSymbols(
    [
      {
        name: "Trainer",
        detail: "class",
        kind: 4,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 10, character: 0 },
        },
        selectionRange: {
          start: { line: 0, character: 6 },
          end: { line: 0, character: 13 },
        },
        children: [
          {
            name: "fit",
            detail: "method",
            kind: 5,
            range: {
              start: { line: 2, character: 2 },
              end: { line: 4, character: 18 },
            },
            selectionRange: {
              start: { line: 2, character: 6 },
              end: { line: 2, character: 9 },
            },
          },
        ],
      },
      {
        name: "helper_value",
        kind: 12,
        location: {
          uri: "file:///workspace/demo.py",
          range: {
            start: { line: 20, character: 0 },
            end: { line: 20, character: 12 },
          },
        },
      },
    ],
    {
      query: "fit",
      maxResults: 10,
    },
  );

  assert.equal(result.truncated, false);
  assert.deepEqual(result.symbols, [
    {
      name: "fit",
      detail: "method",
      kind: "method",
      container_name: "Trainer",
      start_line: 3,
      start_column: 3,
      end_line: 5,
      end_column: 19,
      selection_start_line: 3,
      selection_start_column: 7,
      selection_end_line: 3,
      selection_end_column: 10,
    },
  ]);
});

test("applyTextEdits applies sorted non-overlapping edits", () => {
  const result = applyTextEdits("print( 1 )\nvalue=2\n", [
    {
      range: {
        start: { line: 0, character: 6 },
        end: { line: 0, character: 9 },
      },
      newText: "1",
    },
    {
      range: {
        start: { line: 1, character: 5 },
        end: { line: 1, character: 6 },
      },
      newText: " = ",
    },
  ]);

  assert.equal(result.updatedSource, "print(1)\nvalue = 2\n");
  assert.equal(result.appliedEditCount, 2);
});

test("applyTextEdits rejects overlapping edits", () => {
  assert.throws(
    () =>
      applyTextEdits("abcdef", [
        {
          range: {
            start: { line: 0, character: 1 },
            end: { line: 0, character: 4 },
          },
          newText: "X",
        },
        {
          range: {
            start: { line: 0, character: 3 },
            end: { line: 0, character: 5 },
          },
          newText: "Y",
        },
      ]),
    /overlapping text edits/,
  );
});

test("diagnostic helpers normalize severity and code", () => {
  assert.equal(diagnosticSeverityToProtocol(0), "error");
  assert.equal(diagnosticSeverityToProtocol(3), "hint");
  assert.equal(diagnosticCodeToString("E123"), "E123");
  assert.equal(diagnosticCodeToString(42), "42");
  assert.equal(diagnosticCodeToString({ value: "F401" }), "F401");
});
