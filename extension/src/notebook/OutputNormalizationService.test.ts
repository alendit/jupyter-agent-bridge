import assert from "node:assert/strict";
import test from "node:test";
import * as vscode from "vscode";
import { OutputNormalizationService } from "./OutputNormalizationService";

function outputItem(mime: string, data: string): vscode.NotebookCellOutputItem {
  return {
    mime,
    data: Buffer.from(data),
  } as unknown as vscode.NotebookCellOutputItem;
}

function output(items: vscode.NotebookCellOutputItem[]): vscode.NotebookCellOutput {
  return {
    items,
  } as unknown as vscode.NotebookCellOutput;
}

test("normalizeOutputs omits rich rendered HTML by default", () => {
  const service = new OutputNormalizationService();

  const outputs = service.normalizeOutputs([
    output([outputItem("text/html", "<script>Plotly.newPlot(...)</script>")]),
  ]);

  assert.equal(outputs.length, 1);
  assert.deepEqual(outputs[0], {
    kind: "html",
    mime: "text/html",
    summary: "Rendered output omitted by default. Re-run with include_rich_output_text=true to inspect the raw payload.",
    omitted: true,
    original_bytes: Buffer.byteLength("<script>Plotly.newPlot(...)</script>"),
  });
});

test("normalizeOutputs omits application/vnd plotly bundles by default", () => {
  const service = new OutputNormalizationService();

  const payload = JSON.stringify({ data: [{ x: [1, 2, 3] }] });
  const outputs = service.normalizeOutputs([
    output([outputItem("application/vnd.plotly.v1+json", payload)]),
  ]);

  assert.equal(outputs.length, 1);
  assert.equal(outputs[0]?.kind, "json");
  assert.equal(outputs[0]?.mime, "application/vnd.plotly.v1+json");
  assert.equal(outputs[0]?.omitted, true);
  assert.match(String(outputs[0]?.summary), /include_rich_output_text=true/);
  assert.equal(outputs[0]?.json, undefined);
});

test("normalizeOutputs returns raw rich rendered output when explicitly requested", () => {
  const service = new OutputNormalizationService();

  const payload = "<div>chart</div>";
  const outputs = service.normalizeOutputs(
    [output([outputItem("text/html", payload)])],
    { includeRichOutputText: true },
  );

  assert.equal(outputs.length, 1);
  assert.equal(outputs[0]?.kind, "html");
  assert.equal(outputs[0]?.html, payload);
  assert.equal(outputs[0]?.omitted, undefined);
});
