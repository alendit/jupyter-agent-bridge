#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";

import {
  isDirtyWorktree,
  parseCutReleaseArgs,
  usage,
} from "./cut-release-lib.mjs";

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: options.stdio ?? "pipe",
  });
}

function main() {
  const { showHelp, version, pushRemote } = parseCutReleaseArgs(process.argv.slice(2));

  if (showHelp) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  const porcelainStatus = run("git", ["status", "--porcelain"]);
  if (isDirtyWorktree(porcelainStatus)) {
    throw new Error("Worktree must be clean before cutting a release.");
  }

  const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  if (packageJson.version === version) {
    throw new Error(`package.json is already at version ${version}.`);
  }

  const existingTag = run("git", ["tag", "--list", `v${version}`]);
  if (existingTag.trim().length > 0) {
    throw new Error(`Tag v${version} already exists.`);
  }

  execFileSync("npm", ["version", version, "-m", "Cut release %s"], {
    stdio: "inherit",
  });

  if (pushRemote) {
    execFileSync("git", ["push", pushRemote, "HEAD", "--follow-tags"], {
      stdio: "inherit",
    });
  }
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.stderr.write(`${usage()}\n`);
  process.exitCode = 1;
}

