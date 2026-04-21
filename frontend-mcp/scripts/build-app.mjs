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
        color-scheme: dark;
        font-family: "SF Pro Display", "Segoe UI", ui-sans-serif, system-ui, sans-serif;
        --app-bg: color-mix(in srgb, var(--mcp-background, #0f1115) 88%, #05070a 12%);
        --app-surface: color-mix(in srgb, var(--mcp-background, #0f1115) 78%, #1b1f27 22%);
        --app-surface-strong: color-mix(in srgb, var(--mcp-background, #0f1115) 70%, #20252e 30%);
        --app-border: color-mix(in srgb, var(--mcp-foreground, #eef2f7) 14%, transparent);
        --app-border-strong: color-mix(in srgb, var(--mcp-foreground, #eef2f7) 22%, transparent);
        --app-foreground: var(--mcp-foreground, #eef2f7);
        --app-muted: color-mix(in srgb, var(--mcp-foreground, #eef2f7) 66%, transparent);
        --app-subtle: color-mix(in srgb, var(--mcp-foreground, #eef2f7) 48%, transparent);
        --app-accent: #7ee787;
        --app-accent-soft: rgba(126, 231, 135, 0.14);
        --app-blue: #7cc7ff;
        --app-blue-soft: rgba(124, 199, 255, 0.14);
        --app-danger: #ff7b72;
        --app-danger-soft: rgba(255, 123, 114, 0.14);
        --app-warning: #f2cc60;
        --app-warning-soft: rgba(242, 204, 96, 0.14);
        --code-bg: #161b22;
        --code-line: rgba(255, 255, 255, 0.04);
      }
      body {
        margin: 0;
        min-height: 100vh;
        background:
          radial-gradient(circle at top left, rgba(124, 199, 255, 0.12), transparent 28%),
          radial-gradient(circle at top right, rgba(126, 231, 135, 0.09), transparent 24%),
          linear-gradient(180deg, color-mix(in srgb, var(--app-bg) 80%, #11161d 20%), var(--app-bg));
        color: var(--app-foreground);
      }
      #app {
        padding: 20px;
      }
      .shell {
        display: grid;
        gap: 18px;
        max-width: 1280px;
        margin: 0 auto;
      }
      .hero {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
        padding: 22px 24px;
        border: 1px solid var(--app-border);
        border-radius: 24px;
        background:
          linear-gradient(135deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.01)),
          linear-gradient(180deg, rgba(22, 27, 34, 0.92), rgba(17, 21, 27, 0.92));
        box-shadow: 0 18px 48px rgba(0, 0, 0, 0.22);
      }
      .hero-copy {
        display: grid;
        gap: 8px;
        min-width: 0;
      }
      .eyebrow {
        color: var(--app-accent);
        text-transform: uppercase;
        letter-spacing: 0.12em;
        font-size: 11px;
        font-weight: 700;
      }
      .hero-subtitle {
        color: var(--app-muted);
      }
      .stack {
        display: grid;
        gap: 16px;
      }
      .stack--lg {
        gap: 20px;
      }
      .surface {
        display: grid;
        gap: 16px;
        padding: 18px;
        border: 1px solid var(--app-border);
        border-radius: 20px;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.025), rgba(255, 255, 255, 0.01)),
          var(--app-surface);
        box-shadow: 0 14px 34px rgba(0, 0, 0, 0.18);
      }
      .surface--empty {
        min-height: 180px;
        place-items: center;
      }
      .surface-header {
        display: grid;
        gap: 6px;
      }
      .button-row {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      .metric-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
      }
      .metric {
        min-width: 132px;
        flex: 1 1 132px;
        display: grid;
        gap: 6px;
        padding: 14px 16px;
        border: 1px solid var(--app-border);
        border-radius: 16px;
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.035), rgba(255, 255, 255, 0.01));
      }
      .metric-label {
        color: var(--app-subtle);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .metric-value {
        font-size: 15px;
      }
      .card-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 14px;
      }
      .card {
        display: grid;
        gap: 12px;
        padding: 16px;
        border: 1px solid var(--app-border);
        border-radius: 18px;
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0.01));
      }
      .card--interactive {
        transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
      }
      .card--interactive:hover {
        transform: translateY(-1px);
        border-color: var(--app-border-strong);
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.015));
      }
      .card-topline,
      .insight-card__header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
      }
      .card-title {
        font-weight: 700;
      }
      .card-meta {
        display: grid;
        gap: 6px;
        color: var(--app-muted);
      }
      .split-layout {
        display: grid;
        gap: 16px;
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      }
      .insight-card {
        display: grid;
        gap: 14px;
        padding: 16px;
        border: 1px solid var(--app-border);
        border-radius: 18px;
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0.01));
      }
      .mini-snippet {
        display: grid;
        gap: 10px;
        padding: 12px;
        border: 1px solid var(--app-border);
        border-radius: 14px;
        background: rgba(7, 10, 14, 0.42);
      }
      .mini-snippet__label {
        color: var(--app-subtle);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .button {
        border: 1px solid var(--app-border);
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02));
        color: inherit;
        border-radius: 14px;
        padding: 10px 14px;
        text-align: left;
        cursor: pointer;
        transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
      }
      .button:hover {
        transform: translateY(-1px);
        border-color: var(--app-border-strong);
      }
      .button--primary {
        border-color: rgba(126, 231, 135, 0.36);
        background: linear-gradient(180deg, rgba(126, 231, 135, 0.2), rgba(126, 231, 135, 0.09));
      }
      .button--ghost {
        background: rgba(255, 255, 255, 0.02);
      }
      .chip-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        border-radius: 999px;
        padding: 4px 10px;
        border: 1px solid var(--app-border);
        background: rgba(255, 255, 255, 0.04);
        color: var(--app-muted);
        font-size: 12px;
      }
      .chip--accent {
        border-color: rgba(124, 199, 255, 0.28);
        background: var(--app-blue-soft);
        color: var(--app-blue);
      }
      .chip--danger {
        border-color: rgba(255, 123, 114, 0.28);
        background: var(--app-danger-soft);
        color: var(--app-danger);
      }
      .chip--warning {
        border-color: rgba(242, 204, 96, 0.28);
        background: var(--app-warning-soft);
        color: var(--app-warning);
      }
      .banner {
        border-radius: 16px;
        padding: 12px 14px;
        border: 1px solid var(--app-border);
      }
      .banner--info {
        background: var(--app-blue-soft);
        color: var(--app-blue);
      }
      .banner--error {
        background: var(--app-danger-soft);
        color: var(--app-danger);
      }
      .muted {
        color: var(--app-muted);
      }
      .code-frame {
        border: 1px solid var(--app-border);
        border-radius: 18px;
        overflow: hidden;
        background: linear-gradient(180deg, rgba(22, 27, 34, 0.98), rgba(16, 20, 26, 0.98));
      }
      .code-frame__header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        padding: 12px 14px;
        border-bottom: 1px solid var(--app-border);
        background: rgba(255, 255, 255, 0.02);
      }
      .code-frame__meta {
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--app-muted);
        font-size: 12px;
      }
      .code-table {
        width: 100%;
        border-collapse: collapse;
      }
      pre, code {
        font-family: "SFMono-Regular", "SF Mono", ui-monospace, Menlo, monospace;
      }
      .code-table td {
        vertical-align: top;
      }
      .code-table__line {
        width: 1%;
        padding: 0 14px 0 16px;
        color: rgba(240, 246, 252, 0.38);
        text-align: right;
        user-select: none;
        border-right: 1px solid rgba(255, 255, 255, 0.04);
        background: rgba(255, 255, 255, 0.02);
      }
      .code-table__code {
        width: 100%;
        padding: 0;
      }
      .code-table__code pre {
        margin: 0;
        padding: 0 16px;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        line-height: 1.65;
        min-height: 24px;
      }
      .code-table tbody tr {
        background: transparent;
      }
      .code-table tbody tr:hover {
        background: var(--code-line);
      }
      .code-table--diff tr.is-add {
        background: rgba(46, 160, 67, 0.16);
      }
      .code-table--diff tr.is-remove {
        background: rgba(248, 81, 73, 0.16);
      }
      .code-table--diff tr.is-hunk {
        background: rgba(56, 139, 253, 0.16);
      }
      .image-frame {
        padding: 12px;
        border: 1px solid var(--app-border);
        border-radius: 16px;
        background: rgba(7, 10, 14, 0.42);
      }
      img {
        max-width: 100%;
        display: block;
        border-radius: 12px;
      }
      h1, h2, h3, p {
        margin: 0;
      }
      h1 {
        font-size: clamp(24px, 4vw, 32px);
        line-height: 1.1;
      }
      h2 {
        font-size: 16px;
      }
      h3 {
        font-size: 15px;
      }
      @media (max-width: 720px) {
        #app {
          padding: 14px;
        }
        .hero {
          padding: 18px;
          border-radius: 20px;
        }
        .surface {
          padding: 16px;
        }
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
