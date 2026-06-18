import { spawn } from "node:child_process";
import type { Report } from "../../core/types.js";
import { renderDiagnosisPrompt } from "../causal-reasoning.js";
import type { DiagnosisContext, DiagnosisEngine } from "../engine.js";

export class ClaudeCodeAdapter implements DiagnosisEngine {
  constructor(private readonly command = "claude", private readonly timeoutMs = 600_000) {}

  async diagnose(context: DiagnosisContext): Promise<Report> {
    const prompt = renderDiagnosisPrompt(context.prompt, context);
    const output = await runCommand(this.command, [prompt], {
      cwd: context.projectRoot ?? process.cwd(),
      timeoutMs: this.timeoutMs
    });

    const parsed = extractJson<Report>(output.stdout);
    if (parsed) return { ...parsed, rawOutput: output.stdout };

    return {
      id: new Date().toISOString().slice(0, 10),
      date: new Date().toISOString().slice(0, 10),
      errorsAnalyzed: context.errors.length,
      rootCauses: [],
      proposedFixes: [],
      conversationalSummary: output.stdout.trim() || "Claude Code diagnosis completed without a structured report.",
      rawOutput: output.stdout
    };
  }
}

function runCommand(command: string, args: string[], options: { cwd: string; timeoutMs: number }): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Claude Code diagnosis timed out after ${options.timeoutMs}ms`));
    }, options.timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr || `Claude Code exited with code ${code}`));
    });
  });
}

function extractJson<T>(text: string): T | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
