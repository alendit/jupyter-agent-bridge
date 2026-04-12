export function buildUnifiedSourceDiff(currentSource: string, proposedSource: string): string {
  const currentLines = normalizeSource(currentSource).split("\n");
  const proposedLines = normalizeSource(proposedSource).split("\n");

  let prefix = 0;
  while (
    prefix < currentLines.length &&
    prefix < proposedLines.length &&
    currentLines[prefix] === proposedLines[prefix]
  ) {
    prefix += 1;
  }

  let currentSuffix = currentLines.length;
  let proposedSuffix = proposedLines.length;
  while (
    currentSuffix > prefix &&
    proposedSuffix > prefix &&
    currentLines[currentSuffix - 1] === proposedLines[proposedSuffix - 1]
  ) {
    currentSuffix -= 1;
    proposedSuffix -= 1;
  }

  const currentChanged = currentLines.slice(prefix, currentSuffix);
  const proposedChanged = proposedLines.slice(prefix, proposedSuffix);

  const oldStart = prefix + 1;
  const newStart = prefix + 1;
  const oldCount = currentChanged.length;
  const newCount = proposedChanged.length;

  const body = [
    ...currentChanged.map((line) => `-${line}`),
    ...proposedChanged.map((line) => `+${line}`),
  ];

  if (body.length === 0) {
    return `@@ -${oldStart},0 +${newStart},0 @@`;
  }

  return [`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`, ...body].join("\n");
}

function normalizeSource(source: string): string {
  return source.replace(/\r\n/gu, "\n");
}
