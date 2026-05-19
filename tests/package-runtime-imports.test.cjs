const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");
const packagedRuntimeRoots = ["extension/src", "frontend-mcp/src"];
const packagedRuntimeEntrypoints = [
  "extension/dist/extension/src/extension.js",
  "frontend-mcp/dist/frontend-mcp/src/main.js",
];
const localRuntimePackages = ["@jupyter-agent-bridge/notebook-domain"];
const allowedBareRuntimeImports = new Set([
  "vscode",
  ...require("node:module").builtinModules,
  ...require("node:module").builtinModules.map((moduleName) => `node:${moduleName}`),
]);

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

test("packaged runtime build avoids bare imports that are not shipped in the VSIX", () => {
  const offenders = [];

  for (const entrypoint of packagedRuntimeEntrypoints) {
    for (const filePath of collectReachableJavaScriptFiles(path.join(repoRoot, entrypoint))) {
      for (const importPath of collectRuntimeRequires(filePath)) {
        if (!importPath.startsWith(".") && !allowedBareRuntimeImports.has(importPath)) {
          offenders.push(`${path.relative(repoRoot, filePath)} imports ${importPath}`);
        }
      }
    }
  }

  assert.deepEqual(offenders, []);
});

function collectReachableJavaScriptFiles(entrypoint) {
  const files = new Set();
  const pending = [entrypoint];

  while (pending.length > 0) {
    const filePath = pending.pop();
    if (files.has(filePath)) {
      continue;
    }

    files.add(filePath);

    for (const importPath of collectRuntimeRequires(filePath)) {
      if (!importPath.startsWith(".")) {
        continue;
      }

      const resolvedPath = resolveRelativeJavaScriptImport(filePath, importPath);
      if (resolvedPath && !files.has(resolvedPath)) {
        pending.push(resolvedPath);
      }
    }
  }

  return files;
}

function collectRuntimeRequires(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const runtimeImportPattern = /(?:^|[^"'`])require\(\s*["']([^"']+)["']\s*\)/gmu;
  return [...source.matchAll(runtimeImportPattern)].map((match) => match[1]);
}

function resolveRelativeJavaScriptImport(fromFilePath, importPath) {
  const basePath = path.resolve(path.dirname(fromFilePath), importPath);
  const candidates = [`${basePath}.js`, path.join(basePath, "index.js")];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}
