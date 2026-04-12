import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.resolve(__dirname, "..");
const entryPoint = path.join(frontendRoot, "ui-src", "main.ts");
const tempOutfile = path.join(frontendRoot, "dist", "frontend-mcp-app.js");
const htmlOutfile = path.join(frontendRoot, "dist", "frontend-mcp", "src", "apps", "jupyter-mcp-app.html");

await fs.mkdir(path.dirname(tempOutfile), { recursive: true });
await fs.mkdir(path.dirname(htmlOutfile), { recursive: true });

await build({
  entryPoints: [entryPoint],
  outfile: tempOutfile,
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
});

const script = await fs.readFile(tempOutfile, "utf8");
await fs.writeFile(
  htmlOutfile,
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Jupyter Agentic Bridge</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family: ui-sans-serif, system-ui, sans-serif;
      }
      body {
        margin: 0;
        background: var(--mcp-background, #f6f7fb);
        color: var(--mcp-foreground, #111827);
      }
      #app {
        padding: 16px;
      }
      .panel {
        display: grid;
        gap: 16px;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      button {
        border: 1px solid rgba(100, 116, 139, 0.35);
        background: rgba(255, 255, 255, 0.7);
        color: inherit;
        border-radius: 10px;
        padding: 10px 12px;
        text-align: left;
        cursor: pointer;
      }
      button.primary {
        background: #dbeafe;
      }
      .list {
        display: grid;
        gap: 10px;
      }
      .list-item {
        display: grid;
        gap: 4px;
      }
      .grid.two {
        display: grid;
        gap: 16px;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      }
      .stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        gap: 12px;
      }
      .stat {
        border: 1px solid rgba(100, 116, 139, 0.25);
        border-radius: 12px;
        padding: 12px;
        display: grid;
        gap: 4px;
      }
      .muted {
        opacity: 0.72;
      }
      .pill {
        display: inline-block;
        width: fit-content;
        border-radius: 999px;
        padding: 2px 8px;
        background: rgba(59, 130, 246, 0.12);
      }
      .banner {
        border-radius: 10px;
        padding: 10px 12px;
      }
      .banner.info {
        background: rgba(59, 130, 246, 0.12);
      }
      .banner.error {
        background: rgba(239, 68, 68, 0.12);
      }
      pre, code {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      }
      pre {
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        border: 1px solid rgba(100, 116, 139, 0.2);
        border-radius: 10px;
        padding: 12px;
        background: rgba(15, 23, 42, 0.04);
      }
      img {
        max-width: 100%;
        border-radius: 10px;
      }
      section {
        display: grid;
        gap: 8px;
      }
      h1, h2, p {
        margin: 0;
      }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script>${script}</script>
  </body>
</html>
`,
  "utf8",
);
