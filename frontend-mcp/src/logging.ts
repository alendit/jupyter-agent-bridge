import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export interface FrontendLogger {
  logPath: string;
  info(message: string): void;
  error(message: string): void;
}

export function createFrontendLogger(): FrontendLogger {
  const baseDir = process.env.JUPYTER_AGENT_BRIDGE_LOG_DIR || path.join(os.tmpdir(), "jupyter-agent-bridge");
  fs.mkdirSync(baseDir, { recursive: true });
  const logPath = path.join(baseDir, `frontend-mcp-${process.pid}.log`);

  const write = (level: "INFO" | "ERROR", message: string): void => {
    const line = `${new Date().toISOString()} ${level} ${message}\n`;
    fs.appendFileSync(logPath, line, "utf8");
    process.stderr.write(line);
  };

  return {
    logPath,
    info(message: string): void {
      write("INFO", message);
    },
    error(message: string): void {
      write("ERROR", message);
    },
  };
}
