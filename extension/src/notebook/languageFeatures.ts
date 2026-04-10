interface PositionLike {
  line: number;
  character: number;
}

interface RangeLike {
  start: PositionLike;
  end: PositionLike;
}

interface DiagnosticCodeLike {
  value: string | number;
}

interface DiagnosticLike {
  severity?: number;
  message: string;
  source?: string;
  code?: string | number | DiagnosticCodeLike;
  range: RangeLike;
}

interface DocumentSymbolLike {
  name: string;
  detail?: string;
  kind: number;
  range: RangeLike;
  selectionRange: RangeLike;
  children?: readonly unknown[];
}

interface SymbolInformationLike {
  name: string;
  kind: number;
  containerName?: string;
  location: {
    uri: unknown;
    range: RangeLike;
  };
}

interface TextEditLike {
  range: RangeLike;
  newText: string;
}

export interface FlattenedSymbol {
  name: string;
  detail?: string;
  kind: string;
  container_name?: string;
  start_line: number;
  start_column: number;
  end_line: number;
  end_column: number;
  selection_start_line: number;
  selection_start_column: number;
  selection_end_line: number;
  selection_end_column: number;
}

export interface FlattenSymbolsOptions {
  query?: string;
  maxResults: number;
}

const SYMBOL_KIND_NAMES = [
  "file",
  "module",
  "namespace",
  "package",
  "class",
  "method",
  "property",
  "field",
  "constructor",
  "enum",
  "interface",
  "function",
  "variable",
  "constant",
  "string",
  "number",
  "boolean",
  "array",
  "object",
  "key",
  "null",
  "enum_member",
  "struct",
  "event",
  "operator",
  "type_parameter",
] as const;

export function diagnosticSeverityToProtocol(severity?: number): "error" | "warning" | "information" | "hint" {
  switch (severity) {
    case 0:
      return "error";
    case 1:
      return "warning";
    case 2:
      return "information";
    case 3:
      return "hint";
    default:
      return "information";
  }
}

export function diagnosticCodeToString(code: DiagnosticLike["code"]): string | undefined {
  if (typeof code === "string" || typeof code === "number") {
    return String(code);
  }

  if (code && typeof code === "object" && "value" in code) {
    const value = (code as DiagnosticCodeLike).value;
    if (typeof value === "string" || typeof value === "number") {
      return String(value);
    }
  }

  return undefined;
}

export function rangeToOneBased(range: RangeLike): {
  start_line: number;
  start_column: number;
  end_line: number;
  end_column: number;
} {
  return {
    start_line: range.start.line + 1,
    start_column: range.start.character + 1,
    end_line: range.end.line + 1,
    end_column: range.end.character + 1,
  };
}

export function flattenProvidedSymbols(
  symbols: readonly unknown[],
  options: FlattenSymbolsOptions,
): {
  symbols: FlattenedSymbol[];
  truncated: boolean;
} {
  const query = options.query?.trim().toLowerCase();
  const flattened: FlattenedSymbol[] = [];
  let truncated = false;

  const pushSymbol = (symbol: FlattenedSymbol): void => {
    if (flattened.length >= options.maxResults) {
      truncated = true;
      return;
    }

    if (!query) {
      flattened.push(symbol);
      return;
    }

    const haystacks = [symbol.name, symbol.detail, symbol.container_name]
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .map((value) => value.toLowerCase());
    if (haystacks.some((value) => value.includes(query))) {
      flattened.push(symbol);
    }
  };

  const visitDocumentSymbol = (symbol: DocumentSymbolLike, parents: string[]): void => {
    if (truncated) {
      return;
    }

    const range = rangeToOneBased(symbol.range);
    const selection = rangeToOneBased(symbol.selectionRange);
    pushSymbol({
      name: symbol.name,
      detail: symbol.detail,
      kind: symbolKindToProtocol(symbol.kind),
      container_name: parents.length > 0 ? parents.join(".") : undefined,
      start_line: range.start_line,
      start_column: range.start_column,
      end_line: range.end_line,
      end_column: range.end_column,
      selection_start_line: selection.start_line,
      selection_start_column: selection.start_column,
      selection_end_line: selection.end_line,
      selection_end_column: selection.end_column,
    });

    for (const child of symbol.children ?? []) {
      if (!isDocumentSymbolLike(child)) {
        continue;
      }

      visitDocumentSymbol(child, [...parents, symbol.name]);
      if (truncated) {
        return;
      }
    }
  };

  for (const symbol of symbols) {
    if (truncated) {
      break;
    }

    if (isDocumentSymbolLike(symbol)) {
      visitDocumentSymbol(symbol, []);
      continue;
    }

    if (isSymbolInformationLike(symbol)) {
      const range = rangeToOneBased(symbol.location.range);
      pushSymbol({
        name: symbol.name,
        kind: symbolKindToProtocol(symbol.kind),
        container_name: symbol.containerName,
        start_line: range.start_line,
        start_column: range.start_column,
        end_line: range.end_line,
        end_column: range.end_column,
        selection_start_line: range.start_line,
        selection_start_column: range.start_column,
        selection_end_line: range.end_line,
        selection_end_column: range.end_column,
      });
    }
  }

  return {
    symbols: flattened,
    truncated,
  };
}

export function applyTextEdits(
  source: string,
  edits: readonly TextEditLike[],
): {
  updatedSource: string;
  appliedEditCount: number;
} {
  if (edits.length === 0) {
    return {
      updatedSource: source,
      appliedEditCount: 0,
    };
  }

  const lineStarts = buildLineStartOffsets(source);
  const mapped = edits.map((edit) => ({
    start: positionToOffset(source, lineStarts, edit.range.start),
    end: positionToOffset(source, lineStarts, edit.range.end),
    newText: edit.newText,
  }));
  const ascending = [...mapped].sort((left, right) => left.start - right.start || left.end - right.end);

  for (let index = 1; index < ascending.length; index += 1) {
    const previous = ascending[index - 1];
    const current = ascending[index];
    if (current.start < previous.end || (current.start === previous.start && current.end === previous.end)) {
      throw new Error("Formatter returned overlapping text edits.");
    }
  }

  let updatedSource = source;
  for (const edit of ascending.reverse()) {
    updatedSource = `${updatedSource.slice(0, edit.start)}${edit.newText}${updatedSource.slice(edit.end)}`;
  }

  return {
    updatedSource,
    appliedEditCount: edits.length,
  };
}

function symbolKindToProtocol(kind: number): string {
  return SYMBOL_KIND_NAMES[kind] ?? "unknown";
}

function buildLineStartOffsets(source: string): number[] {
  const lineStarts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\n") {
      lineStarts.push(index + 1);
    }
  }
  return lineStarts;
}

function positionToOffset(source: string, lineStarts: readonly number[], position: PositionLike): number {
  if (
    !Number.isInteger(position.line) ||
    !Number.isInteger(position.character) ||
    position.line < 0 ||
    position.character < 0 ||
    position.line >= lineStarts.length
  ) {
    throw new Error(`Invalid formatter position ${position.line}:${position.character}.`);
  }

  const lineStart = lineStarts[position.line];
  let lineEnd = position.line + 1 < lineStarts.length ? lineStarts[position.line + 1] : source.length;
  while (lineEnd > lineStart && (source[lineEnd - 1] === "\n" || source[lineEnd - 1] === "\r")) {
    lineEnd -= 1;
  }

  if (position.character > lineEnd - lineStart) {
    throw new Error(`Invalid formatter position ${position.line}:${position.character}.`);
  }

  return lineStart + position.character;
}

function isPositionLike(value: unknown): value is PositionLike {
  return (
    value !== null &&
    typeof value === "object" &&
    "line" in value &&
    "character" in value &&
    typeof (value as { line: unknown }).line === "number" &&
    typeof (value as { character: unknown }).character === "number"
  );
}

function isRangeLike(value: unknown): value is RangeLike {
  return (
    value !== null &&
    typeof value === "object" &&
    "start" in value &&
    "end" in value &&
    isPositionLike((value as { start: unknown }).start) &&
    isPositionLike((value as { end: unknown }).end)
  );
}

function isDocumentSymbolLike(value: unknown): value is DocumentSymbolLike {
  return (
    value !== null &&
    typeof value === "object" &&
    "name" in value &&
    "kind" in value &&
    "range" in value &&
    "selectionRange" in value &&
    typeof (value as { name: unknown }).name === "string" &&
    typeof (value as { kind: unknown }).kind === "number" &&
    isRangeLike((value as { range: unknown }).range) &&
    isRangeLike((value as { selectionRange: unknown }).selectionRange)
  );
}

function isSymbolInformationLike(value: unknown): value is SymbolInformationLike {
  return (
    value !== null &&
    typeof value === "object" &&
    "name" in value &&
    "kind" in value &&
    "location" in value &&
    typeof (value as { name: unknown }).name === "string" &&
    typeof (value as { kind: unknown }).kind === "number" &&
    (value as { containerName?: unknown }).containerName !== null &&
    (() => {
      const location = (value as { location: unknown }).location;
      return (
        location !== null &&
        typeof location === "object" &&
        "range" in location &&
        isRangeLike((location as { range: unknown }).range)
      );
    })()
  );
}
