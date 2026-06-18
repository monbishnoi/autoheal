import path from "node:path";
import { AutoHeal, type ErrorEvent } from "../../src/index.js";

export function createCalGatewayAutoHeal(options: {
  dataDir: string;
  logsDir: string;
  gatewayDir: string;
  timezone: string;
  notify: (message: string) => Promise<void> | void;
  healthUrl: string;
}): AutoHeal {
  return new AutoHeal({
    storagePath: path.join(options.dataDir, "autoheal"),
    errorLogPath: path.join(options.logsDir, "gateway-error.log"),
    errorParser: parseCalGatewayJsonl,
    diagnosisEngine: "claude-code",
    notify: options.notify,
    healthCheck: async () => {
      const response = await fetch(options.healthUrl);
      return response.ok;
    },
    backup: "git",
    projectRoot: options.gatewayDir,
    timezone: options.timezone
  });
}

function parseCalGatewayJsonl(raw: string): ErrorEvent[] {
  return raw.split("\n").flatMap((line) => {
    if (!line.trim()) return [];
    const parsed = JSON.parse(line) as Record<string, unknown>;
    return [{
      ts: parsed.ts as string | undefined,
      type: parsed.event as string | undefined,
      tool: parsed.tool as string | undefined,
      message: parsed.message as string | undefined,
      error: String(parsed.error ?? parsed.message ?? "unknown"),
      session: parsed.session as string | undefined,
      recovery: parsed.recovery as string | undefined
    }];
  });
}
