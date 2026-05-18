const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");
const packagedRuntimeRoots = ["extension/src", "frontend-mcp/src"];
const localRuntimePackages = ["@jupyter-agent-bridge/notebook-domain"];

function collectTypeScriptFiles(root) {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTypeScriptFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      files.push(entryPath);
    }
  }

  return files;
}

test("packaged runtime sources avoid bare imports of local workspace packages", () => {
  const offenders = [];

  for (const runtimeRoot of packagedRuntimeRoots) {
    for (const filePath of collectTypeScriptFiles(path.join(repoRoot, runtimeRoot))) {
      const source = fs.readFileSync(filePath, "utf8");
      for (const packageName of localRuntimePackages) {
        const escapedPackageName = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const runtimeImportPattern = new RegExp(
          `(?:import\\s+(?!type\\b)[\\s\\S]*?from\\s*|require\\(\\s*)["']${escapedPackageName}["']`,
          "u",
        );

        if (runtimeImportPattern.test(source)) {
          offenders.push(`${path.relative(repoRoot, filePath)} imports ${packageName}`);
        }
      }
    }
  }

  assert.deepEqual(offenders, []);
});
