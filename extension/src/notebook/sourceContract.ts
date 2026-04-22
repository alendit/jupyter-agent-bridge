export interface SourceContractSummary {
  before_source_fingerprint: string;
  after_source_fingerprint: string;
  canonical_source_preview: string;
  warnings: string[];
}

interface SummarizeSourceContractArgs {
  beforeSource: string;
  afterSource: string;
  beforeFingerprint: string;
  afterFingerprint: string;
  operation: "replace_cell_source" | "patch_cell_source" | "preview_replace" | "preview_patch";
}

const SUSPICIOUS_LITERAL_ESCAPE_WARNING =
  "Source contains literal backslash escape sequences such as \\n or \\t. JSON strings are stored verbatim after decoding.";

export function buildCanonicalSourcePreview(source: string, maxChars = 200): string {
  const normalized = normalizeSource(source);
  if (normalized.length <= maxChars) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxChars))}…`;
}

export function collectSourceContractWarnings(source: string): string[] {
  const normalized = normalizeSource(source);
  if (!normalized.includes("\n") && /\\(?:n|r|t)/u.test(normalized)) {
    return [SUSPICIOUS_LITERAL_ESCAPE_WARNING];
  }

  return [];
}

export function summarizeSourceContract(args: SummarizeSourceContractArgs): SourceContractSummary {
  const warnings = collectSourceContractWarnings(args.afterSource);
  if (
    (args.operation === "patch_cell_source" || args.operation === "preview_patch") &&
    args.beforeSource === args.afterSource
  ) {
    warnings.unshift("Patch did not change the cell source.");
  }

  return {
    before_source_fingerprint: args.beforeFingerprint,
    after_source_fingerprint: args.afterFingerprint,
    canonical_source_preview: buildCanonicalSourcePreview(args.afterSource),
    warnings,
  };
}

function normalizeSource(source: string): string {
  return source.replace(/\r\n/gu, "\n");
}
