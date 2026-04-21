const SEMVER_PATTERN =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export function usage() {
  return [
    "Usage: npm run cut-release -- <version> [--push <remote>]",
    "",
    "Examples:",
    "  npm run cut-release -- 0.0.5",
    "  npm run cut-release -- v0.0.5 --push github",
  ].join("\n");
}

export function normalizeReleaseVersion(input) {
  if (typeof input !== "string") {
    throw new Error("A release version is required.");
  }

  const trimmed = input.trim();
  if (trimmed.length === 0) {
    throw new Error("A release version is required.");
  }

  const normalized = trimmed.startsWith("v") ? trimmed.slice(1) : trimmed;
  if (!SEMVER_PATTERN.test(normalized)) {
    throw new Error(`Invalid release version: ${input}`);
  }

  return normalized;
}

export function parseCutReleaseArgs(argv) {
  let requestedVersion;
  let pushRemote = null;
  let showHelp = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      showHelp = true;
      continue;
    }

    if (arg === "--push") {
      const remote = argv[index + 1];
      if (!remote || remote.startsWith("-")) {
        throw new Error("Expected a remote name after --push.");
      }

      pushRemote = remote;
      index += 1;
      continue;
    }

    if (arg.startsWith("--push=")) {
      pushRemote = arg.slice("--push=".length);
      if (!pushRemote) {
        throw new Error("Expected a remote name after --push=.");
      }
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    if (requestedVersion !== undefined) {
      throw new Error(`Unexpected extra argument: ${arg}`);
    }

    requestedVersion = arg;
  }

  if (showHelp) {
    return { showHelp: true, version: null, pushRemote };
  }

  return {
    showHelp: false,
    version: normalizeReleaseVersion(requestedVersion),
    pushRemote,
  };
}

export function isDirtyWorktree(porcelainStatus) {
  return porcelainStatus.trim().length > 0;
}

