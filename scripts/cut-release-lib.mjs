const SEMVER_PATTERN =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const SEMVER_CORE_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const RELEASE_TYPES = new Set(["major", "minor", "patch"]);

export function usage() {
  return [
    "Usage: npm run cut-release -- <major|minor|patch|version> [--push <remote>]",
    "",
    "Examples:",
    "  npm run cut-release -- patch",
    "  npm run cut-release -- minor --push github",
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

export function normalizeReleaseTarget(input) {
  if (typeof input !== "string") {
    throw new Error("A release version or bump type is required.");
  }

  const trimmed = input.trim();
  if (trimmed.length === 0) {
    throw new Error("A release version or bump type is required.");
  }

  if (RELEASE_TYPES.has(trimmed)) {
    return trimmed;
  }

  return normalizeReleaseVersion(trimmed);
}

export function resolveReleaseVersion(currentVersion, releaseTarget) {
  if (RELEASE_TYPES.has(releaseTarget)) {
    const match = normalizeReleaseVersion(currentVersion).match(SEMVER_CORE_PATTERN);
    if (!match) {
      throw new Error(`Invalid current package version: ${currentVersion}`);
    }

    const [, majorText, minorText, patchText] = match;
    const major = Number.parseInt(majorText, 10);
    const minor = Number.parseInt(minorText, 10);
    const patch = Number.parseInt(patchText, 10);

    switch (releaseTarget) {
      case "major":
        return `${major + 1}.0.0`;
      case "minor":
        return `${major}.${minor + 1}.0`;
      case "patch":
        return `${major}.${minor}.${patch + 1}`;
      default:
        throw new Error(`Unsupported release type: ${releaseTarget}`);
    }
  }

  return normalizeReleaseVersion(releaseTarget);
}

export function parseCutReleaseArgs(argv) {
  let requestedTarget;
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

    if (requestedTarget !== undefined) {
      throw new Error(`Unexpected extra argument: ${arg}`);
    }

    requestedTarget = arg;
  }

  if (showHelp) {
    return { showHelp: true, releaseTarget: null, pushRemote };
  }

  return {
    showHelp: false,
    releaseTarget: normalizeReleaseTarget(requestedTarget),
    pushRemote,
  };
}

export function isDirtyWorktree(porcelainStatus) {
  return porcelainStatus.trim().length > 0;
}
