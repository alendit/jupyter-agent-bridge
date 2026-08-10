import { randomUUID } from "node:crypto";
import { JupyterKernelOutput } from "./JupyterKernelApiService";

const RESULT_PREFIX = "__JUPYTER_AGENT_BRIDGE_VARIABLES__";
export const MAX_VARIABLE_RESULT_BYTES = 256 * 1024;
const MAX_KERNEL_PAYLOAD_BYTES = 192 * 1024;
const MAX_CAPTURED_OUTPUT_BYTES = MAX_KERNEL_PAYLOAD_BYTES + 64 * 1024;
const MAX_NAME_LENGTH = 256;
const MAX_TYPE_LENGTH = 160;
const MAX_VALUE_LENGTH = 1024;
const MAX_METADATA_LENGTH = 240;

export interface KernelVariablePageOptions {
  query?: string;
  offset: number;
  maxResults: number;
}

export interface KernelVariablePage {
  variables: unknown[];
  total_available: number;
  next_offset: number | null;
  truncated: boolean;
}

interface BoundedVariableResult {
  variables: unknown[];
  total_available: number;
  next_offset: number | null;
  truncated: boolean;
}

export function createKernelVariableRequest(options: KernelVariablePageOptions): {
  code: string;
  marker: string;
  source: string;
} {
  const marker = `${RESULT_PREFIX}${randomUUID()}:`;
  const source = buildPythonCollector(marker, options);
  return {
    code: `exec(${JSON.stringify(source)}, {})`,
    marker,
    source,
  };
}

export class KernelVariableOutputDecoder {
  private text = "";
  private errorDetail = "";
  private readonly decoder = new TextDecoder();

  public constructor(private readonly marker: string) {}

  public accept(output: JupyterKernelOutput): void {
    for (const item of output.items) {
      if (item.mime.includes("error") || item.mime.endsWith("stderr")) {
        const available = Math.max(0, 4096 - this.errorDetail.length);
        this.errorDetail += this.decoder.decode(item.data.subarray(0, available));
      }
      if (item.mime.startsWith("text/") || item.mime.includes("stdout") || item.mime.includes("stderr")) {
        const boundedData = item.data.subarray(Math.max(0, item.data.byteLength - MAX_CAPTURED_OUTPUT_BYTES));
        const decoded = this.decoder.decode(boundedData);
        this.text = appendTail(this.text, decoded, MAX_CAPTURED_OUTPUT_BYTES);
      }
    }
  }

  public finish(): KernelVariablePage {
    const markerIndex = this.text.lastIndexOf(this.marker);
    if (markerIndex < 0) {
      const detail = this.errorDetail || this.text.trim();
      throw new Error(detail ? `Kernel variable query returned no result: ${detail}` : "Kernel variable query returned no result.");
    }

    const payloadStart = markerIndex + this.marker.length;
    const lineEnd = this.text.indexOf("\n", payloadStart);
    const encoded = this.text.slice(payloadStart, lineEnd >= 0 ? lineEnd : undefined);
    if (Buffer.byteLength(encoded, "utf8") > MAX_KERNEL_PAYLOAD_BYTES) {
      throw new Error("Kernel variable query exceeded the bridge payload limit.");
    }

    return validatePayload(JSON.parse(encoded));
  }
}

export function boundVariableResult<T extends BoundedVariableResult>(result: T, offset: number): T {
  const bounded = {
    ...result,
    variables: [...result.variables],
  };
  while (Buffer.byteLength(JSON.stringify(bounded), "utf8") > MAX_VARIABLE_RESULT_BYTES && bounded.variables.length > 0) {
    bounded.variables.pop();
    bounded.next_offset = offset + bounded.variables.length;
    bounded.truncated = true;
  }
  if (Buffer.byteLength(JSON.stringify(bounded), "utf8") > MAX_VARIABLE_RESULT_BYTES) {
    throw new Error("Variable metadata exceeded the bridge response limit.");
  }
  return bounded;
}

function buildPythonCollector(marker: string, options: KernelVariablePageOptions): string {
  const query = options.query?.trim().toLowerCase() ?? "";
  return `
import contextlib
import json
import reprlib
import types
from IPython import get_ipython

MAX_PAYLOAD_BYTES = ${MAX_KERNEL_PAYLOAD_BYTES}
MAX_NAME_LENGTH = ${MAX_NAME_LENGTH}
MAX_TYPE_LENGTH = ${MAX_TYPE_LENGTH}
MAX_VALUE_LENGTH = ${MAX_VALUE_LENGTH}
MAX_METADATA_LENGTH = ${MAX_METADATA_LENGTH}
QUERY = ${JSON.stringify(query)}
OFFSET = ${options.offset}
MAX_RESULTS = ${options.maxResults}
MARKER = ${JSON.stringify(marker)}

class _DiscardOutput:
    def write(self, text):
        return len(text)
    def flush(self):
        pass

def _bounded(value, limit):
    if value is None:
        return None
    try:
        text = str(value)
    except Exception as error:
        text = "<unavailable: " + type(error).__name__ + ">"
    if len(text) <= limit:
        return text
    return text[:max(0, limit - 3)] + "..."

def _safe_repr(value):
    value_type = type(value)
    if value_type not in (type(None), bool, int, float, complex, str, bytes):
        return "<" + _type_name(value_type) + ">"
    formatter = reprlib.Repr()
    formatter.maxstring = MAX_VALUE_LENGTH
    formatter.maxother = MAX_VALUE_LENGTH
    formatter.maxlist = 20
    formatter.maxtuple = 20
    formatter.maxset = 20
    formatter.maxfrozenset = 20
    formatter.maxdict = 20
    try:
        with contextlib.redirect_stdout(_DiscardOutput()), contextlib.redirect_stderr(_DiscardOutput()):
            return _bounded(formatter.repr(value), MAX_VALUE_LENGTH)
    except Exception as error:
        return "<repr unavailable: " + type(error).__name__ + ">"

def _type_name(value_type):
    module = getattr(value_type, "__module__", "")
    qualified_name = getattr(value_type, "__qualname__", value_type.__name__)
    return _bounded((module + "." if module not in ("", "builtins") else "") + qualified_name, MAX_TYPE_LENGTH)

def _describe(name, value):
    value_type = type(value)
    module = getattr(value_type, "__module__", "")
    type_name = _type_name(value_type)
    record = {
        "name": _bounded(name, MAX_NAME_LENGTH),
        "type": type_name,
        "value": _safe_repr(value),
        "summary": None,
        "size": None,
        "shape": None,
        "supportsDataExplorer": module.startswith(("numpy", "pandas", "polars", "pyarrow")),
    }
    if value_type in (str, bytes, list, tuple, dict, set, frozenset):
        record["size"] = str(len(value))
    elif module.startswith("numpy") and hasattr(value_type, "shape"):
        shape = tuple(value.shape)
        record["shape"] = _bounded(repr(shape), MAX_METADATA_LENGTH)
        record["size"] = str(value.size)
    elif module.startswith(("pandas", "polars", "pyarrow")) and hasattr(value_type, "shape"):
        shape = tuple(value.shape)
        record["shape"] = _bounded(repr(shape), MAX_METADATA_LENGTH)
    return record

namespace = get_ipython().user_ns
excluded_types = (types.ModuleType, types.FunctionType, types.MethodType, types.BuiltinFunctionType, type)
matches = []
for name, value in sorted(list(namespace.items()), key=lambda item: item[0].lower()):
    if name.startswith("_") or isinstance(value, excluded_types):
        continue
    type_name = _type_name(type(value))
    if QUERY and QUERY not in name.lower() and QUERY not in type_name.lower():
        continue
    matches.append((name, value))

total_available = len(matches)
page = [_describe(name, value) for name, value in matches[OFFSET:OFFSET + MAX_RESULTS]]
next_offset = OFFSET + len(page) if OFFSET + len(page) < total_available else None
payload = {
    "variables": page,
    "total_available": total_available,
    "next_offset": next_offset,
    "truncated": next_offset is not None,
}
encoded = json.dumps(payload, ensure_ascii=True, separators=(",", ":"))
while len(encoded.encode("utf-8")) > MAX_PAYLOAD_BYTES and payload["variables"]:
    payload["variables"].pop()
    payload["next_offset"] = OFFSET + len(payload["variables"])
    payload["truncated"] = True
    encoded = json.dumps(payload, ensure_ascii=True, separators=(",", ":"))
print(MARKER + encoded)
`;
}

function validatePayload(value: unknown): KernelVariablePage {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Kernel variable query returned an invalid payload.");
  }
  const record = value as Record<string, unknown>;
  if (
    !Array.isArray(record.variables) ||
    !Number.isInteger(record.total_available) ||
    (record.next_offset !== null && !Number.isInteger(record.next_offset)) ||
    typeof record.truncated !== "boolean"
  ) {
    throw new Error("Kernel variable query returned an invalid payload.");
  }
  return {
    variables: record.variables,
    total_available: record.total_available as number,
    next_offset: record.next_offset as number | null,
    truncated: record.truncated,
  };
}

function appendTail(current: string, addition: string, maxBytes: number): string {
  const combined = current + addition;
  const encoded = Buffer.from(combined, "utf8");
  if (encoded.byteLength <= maxBytes) {
    return combined;
  }
  return encoded.subarray(encoded.byteLength - maxBytes).toString("utf8");
}
