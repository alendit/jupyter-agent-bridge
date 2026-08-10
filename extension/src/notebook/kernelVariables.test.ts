import assert from "node:assert/strict";
import test from "node:test";
import {
  KernelVariableOutputDecoder,
  MAX_VARIABLE_RESULT_BYTES,
  boundVariableResult,
  createKernelVariableRequest,
} from "./kernelVariables";

const encoder = new TextEncoder();

test("createKernelVariableRequest bounds values and the complete payload in the kernel", () => {
  const request = createKernelVariableRequest({ query: "frame", offset: 10, maxResults: 25 });

  assert.match(request.source, /MAX_PAYLOAD_BYTES = 196608/);
  assert.match(request.source, /MAX_VALUE_LENGTH = 1024/);
  assert.match(request.source, /QUERY = "frame"/);
  assert.match(request.source, /OFFSET = 10/);
  assert.match(request.source, /MAX_RESULTS = 25/);
  assert.match(request.source, /matches\[OFFSET:OFFSET \+ MAX_RESULTS\]/);
  assert.match(request.source, /value_type not in \(type\(None\), bool, int, float, complex, str, bytes\)/);
  assert.match(request.source, /module\.startswith\("numpy"\) and hasattr\(value_type, "shape"\)/);
  assert.match(request.source, /while len\(encoded\.encode\("utf-8"\)\) > MAX_PAYLOAD_BYTES/);
  assert.equal(request.code, `exec(${JSON.stringify(request.source)}, {})`);
});

test("KernelVariableOutputDecoder extracts a tagged page from streamed output", () => {
  const marker = "__marker__:";
  const decoder = new KernelVariableOutputDecoder(marker);
  decoder.accept({
    items: [
      { mime: "application/vnd.code.notebook.stdout", data: encoder.encode("unrelated output\n__mark") },
      {
        mime: "application/vnd.code.notebook.stdout",
        data: encoder.encode(
          'er__:{"variables":[{"name":"df","value":"<large>"}],"total_available":2,"next_offset":1,"truncated":true}\n',
        ),
      },
    ],
  });

  assert.deepEqual(decoder.finish(), {
    variables: [{ name: "df", value: "<large>" }],
    total_available: 2,
    next_offset: 1,
    truncated: true,
  });
});

test("KernelVariableOutputDecoder reports bounded kernel errors when no result arrives", () => {
  const decoder = new KernelVariableOutputDecoder("__missing__:");
  decoder.accept({
    items: [{ mime: "application/vnd.code.notebook.stderr", data: encoder.encode("failure ".repeat(1000)) }],
  });

  assert.throws(() => decoder.finish(), /Kernel variable query returned no result: failure/);
});

test("KernelVariableOutputDecoder rejects malformed payloads", () => {
  const decoder = new KernelVariableOutputDecoder("__marker__:");
  decoder.accept({
    items: [{ mime: "text/plain", data: encoder.encode('__marker__:{"variables":[]}\n') }],
  });

  assert.throws(() => decoder.finish(), /invalid payload/);
});

test("boundVariableResult caps the final response and preserves continuation", () => {
  const result = boundVariableResult(
    {
      variables: Array.from({ length: 400 }, (_, index) => ({ name: `value_${index}`, value_preview: "x".repeat(1024) })),
      total_available: 400,
      next_offset: null,
      truncated: false,
    },
    0,
  );

  assert.ok(Buffer.byteLength(JSON.stringify(result), "utf8") <= MAX_VARIABLE_RESULT_BYTES);
  assert.ok(result.variables.length < 400);
  assert.equal(result.next_offset, result.variables.length);
  assert.equal(result.truncated, true);
});
