const test = require("node:test");
const assert = require("node:assert/strict");

test("normalizeReleaseVersion accepts plain and v-prefixed semver", async () => {
  const { normalizeReleaseVersion } = await import("../scripts/cut-release-lib.mjs");

  assert.equal(normalizeReleaseVersion("0.0.5"), "0.0.5");
  assert.equal(normalizeReleaseVersion("v0.0.5"), "0.0.5");
});

test("normalizeReleaseVersion rejects missing or invalid versions", async () => {
  const { normalizeReleaseVersion } = await import("../scripts/cut-release-lib.mjs");

  assert.throws(() => normalizeReleaseVersion(""), /release version is required/i);
  assert.throws(() => normalizeReleaseVersion("latest"), /invalid release version/i);
});

test("parseCutReleaseArgs accepts an optional push remote", async () => {
  const { parseCutReleaseArgs } = await import("../scripts/cut-release-lib.mjs");

  assert.deepEqual(parseCutReleaseArgs(["v0.0.5", "--push", "github"]), {
    showHelp: false,
    releaseTarget: "0.0.5",
    pushRemote: "github",
  });
});

test("parseCutReleaseArgs accepts semver bump keywords", async () => {
  const { parseCutReleaseArgs } = await import("../scripts/cut-release-lib.mjs");

  assert.deepEqual(parseCutReleaseArgs(["patch"]), {
    showHelp: false,
    releaseTarget: "patch",
    pushRemote: null,
  });
  assert.deepEqual(parseCutReleaseArgs(["minor", "--push=origin"]), {
    showHelp: false,
    releaseTarget: "minor",
    pushRemote: "origin",
  });
});

test("parseCutReleaseArgs rejects unknown flags and extra args", async () => {
  const { parseCutReleaseArgs } = await import("../scripts/cut-release-lib.mjs");

  assert.throws(() => parseCutReleaseArgs(["0.0.5", "--nope"]), /unknown option/i);
  assert.throws(() => parseCutReleaseArgs(["0.0.5", "extra"]), /unexpected extra argument/i);
});

test("resolveReleaseVersion increments the requested semver part", async () => {
  const { resolveReleaseVersion } = await import("../scripts/cut-release-lib.mjs");

  assert.equal(resolveReleaseVersion("0.3.0", "patch"), "0.3.1");
  assert.equal(resolveReleaseVersion("0.3.0", "minor"), "0.4.0");
  assert.equal(resolveReleaseVersion("0.3.0", "major"), "1.0.0");
});

test("resolveReleaseVersion preserves explicit semver and normalizes current prerelease versions", async () => {
  const { resolveReleaseVersion } = await import("../scripts/cut-release-lib.mjs");

  assert.equal(resolveReleaseVersion("1.2.3-beta.1+build.7", "patch"), "1.2.4");
  assert.equal(resolveReleaseVersion("1.2.3", "v1.2.4"), "1.2.4");
});

test("isDirtyWorktree treats any porcelain output as dirty", async () => {
  const { isDirtyWorktree } = await import("../scripts/cut-release-lib.mjs");

  assert.equal(isDirtyWorktree(""), false);
  assert.equal(isDirtyWorktree(" M package.json\n"), true);
  assert.equal(isDirtyWorktree("?? icon.png\n"), true);
});
