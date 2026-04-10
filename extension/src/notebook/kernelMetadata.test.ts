import assert from "node:assert/strict";
import test from "node:test";
import * as vscode from "vscode";
import { parseNotebookKernelMetadata } from "./kernelMetadata";

function createDocument(overrides?: {
  metadata?: Record<string, unknown>;
  notebookType?: string;
  cells?: Array<{ kind: vscode.NotebookCellKind; languageId: string }>;
}): Pick<vscode.NotebookDocument, "metadata" | "notebookType" | "getCells"> {
  return {
    metadata: overrides?.metadata ?? {},
    notebookType: overrides?.notebookType ?? "jupyter-notebook",
    getCells: () =>
      (overrides?.cells ?? []).map((cell) => ({
        kind: cell.kind,
        document: {
          languageId: cell.languageId,
        },
      })) as vscode.NotebookCell[],
  };
}

test("parseNotebookKernelMetadata reads kernelspec metadata", () => {
  const parsed = parseNotebookKernelMetadata(
    createDocument({
      metadata: {
        custom: {
          metadata: {
            kernelspec: {
              name: "python3",
              display_name: "Python 3.13",
            },
            language_info: {
              name: "python",
            },
          },
        },
      },
    }),
  );

  assert.deepEqual(parsed, {
    kernel_label: "Python 3.13",
    kernel_id: "python3",
    language: "python",
    execution_supported: true,
    has_kernel: true,
    signature: "python3::Python 3.13",
  });
});

test("parseNotebookKernelMetadata falls back to first code cell language", () => {
  const parsed = parseNotebookKernelMetadata(
    createDocument({
      cells: [
        { kind: vscode.NotebookCellKind.Markup, languageId: "markdown" },
        { kind: vscode.NotebookCellKind.Code, languageId: "python" },
      ],
    }),
  );

  assert.equal(parsed.language, "python");
  assert.equal(parsed.has_kernel, false);
  assert.equal(parsed.signature, null);
});

test("parseNotebookKernelMetadata reads top-level notebook metadata", () => {
  const parsed = parseNotebookKernelMetadata(
    createDocument({
      metadata: {
        metadata: {
          kernelspec: {
            name: "python3",
            display_name: "Python 3.13",
          },
          language_info: {
            name: "python",
          },
        },
      },
    }),
  );

  assert.deepEqual(parsed, {
    kernel_label: "Python 3.13",
    kernel_id: "python3",
    language: "python",
    execution_supported: true,
    has_kernel: true,
    signature: "python3::Python 3.13",
  });
});
