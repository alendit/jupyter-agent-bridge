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
    version: "0.0.5",
    pushRemote: "github",
  });
});

test("parseCutReleaseArgs rejects unknown flags and extra args", async () => {
  const { parseCutReleaseArgs } = await import("../scripts/cut-release-lib.mjs");

  assert.throws(() => parseCutReleaseArgs(["0.0.5", "--nope"]), /unknown option/i);
  assert.throws(() => parseCutReleaseArgs(["0.0.5", "extra"]), /unexpected extra argument/i);
});

test("isDirtyWorktree treats any porcelain output as dirty", async () => {
  const { isDirtyWorktree } = await import("../scripts/cut-release-lib.mjs");

  assert.equal(isDirtyWorktree(""), false);
  assert.equal(isDirtyWorktree(" M package.json\n"), true);
  assert.equal(isDirtyWorktree("?? icon.png\n"), true);
});
