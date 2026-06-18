import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ErrorEvent, Fix, Report, RootCause } from "../core/types.js";
import type { DiagnosisContext, DiagnosisEngine } from "./engine.js";

const ROOT_CAUSES = new Set(["tool_timeout", "max_iterations", "context_exhausted", "api_error"]);

export class CausalReasoningEngine implements DiagnosisEngine {
  async diagnose(context: DiagnosisContext): Promise<Report> {
    const errors = context.errors.length ? context.errors : parseJsonl(context.rawErrorLog);
    const chains = buildCausalChains(errors);
    const total = errors.length;
    const rootCauses: RootCause[] = chains.map((chain, index) => ({
      id: `rc-${String(index + 1).padStart(3, "0")}`,
      event: chain.event,
      count: chain.direct,
      downstreamErrors: chain.downstream,
      totalImpact: chain.direct + chain.downstream,
      percentage: total === 0 ? 0 : Math.round(((chain.direct + chain.downstream) / total) * 100),
      description: describeRootCause(chain.event, chain.examples)
    }));

    const proposedFixes: Fix[] = rootCauses.map((cause, index) => ({
      id: `fix-${String(index + 1).padStart(3, "0")}`,
      created: new Date().toISOString(),
      rootCause: `${cause.id} ${cause.event}`,
      priority: index + 1,
      description: standardFix(cause.event),
      file: suggestedFile(cause.event),
      type: cause.event === "max_iterations" ? "config" : "code",
      status: "proposed",
      userResponse: null,
      expectedReduction: `${cause.percentage}%`
    } as Fix));

    return {
      id: dateInTimezone(context.timezone),
      date: dateInTimezone(context.timezone),
      period: inferPeriod(errors, context.timezone),
      errorsAnalyzed: total,
      rootCauses,
      proposedFixes,
      conversationalSummary: summarize(total, rootCauses)
    };
  }
}

export async function loadDefaultPrompt(): Promise<string> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const promptPath = path.resolve(here, "../../prompts/diagnosis.md");
  return readFile(promptPath, "utf8");
}

export function renderDiagnosisPrompt(template: string, context: DiagnosisContext): string {
  return template
    .replaceAll("{{ERROR_LOG}}", context.rawErrorLog)
    .replaceAll("{{PROJECT_ROOT}}", context.projectRoot ?? process.cwd())
    .replaceAll("{{STORAGE_PATH}}", context.storagePath)
    .replaceAll("{{TIMEZONE}}", context.timezone);
}

interface Chain {
  event: string;
  direct: number;
  downstream: number;
  examples: ErrorEvent[];
}

function buildCausalChains(errors: ErrorEvent[]): Chain[] {
  const chains = new Map<string, Chain>();
  let activeRoot: string | null = null;

  for (const error of errors) {
    const event = error.type ?? error.event ?? "unknown";
    if (ROOT_CAUSES.has(event)) {
      activeRoot = event;
      const chain = chains.get(event) ?? { event, direct: 0, downstream: 0, examples: [] };
      chain.direct += 1;
      chain.examples.push(error);
      chains.set(event, chain);
      continue;
    }

    if (activeRoot) {
      const chain = chains.get(activeRoot);
      if (chain) chain.downstream += 1;
    }
  }

  return [...chains.values()].sort((a, b) => (b.direct + b.downstream) - (a.direct + a.downstream));
}

function parseJsonl(raw: string): ErrorEvent[] {
  return raw.split("\n").flatMap((line) => {
    if (!line.trim()) return [];
    try {
      return [JSON.parse(line) as ErrorEvent];
    } catch {
      return [];
    }
  });
}

function describeRootCause(event: string, examples: ErrorEvent[]): string {
  const tool = examples.find((error) => error.tool)?.tool;
  const suffix = tool ? ` affecting ${tool}` : "";
  return `${event}${suffix} appears to be a root cause with downstream failures.`;
}

function standardFix(event: string): string {
  const fixes: Record<string, string> = {
    tool_timeout: "Add explicit timeout handling, cancellation, and clearer retry behavior for the affected tool.",
    max_iterations: "Increase or tune iteration limits for the affected workflow and add earlier stopping criteria.",
    context_exhausted: "Reduce prompt/context size and add checkpointing before context pressure becomes fatal.",
    api_error: "Add retry and rate-limit handling around the failing API call."
  };
  return fixes[event] ?? "Investigate the root cause and add targeted error handling.";
}

function suggestedFile(event: string): string {
  const files: Record<string, string> = {
    tool_timeout: "src/tools",
    max_iterations: "config",
    context_exhausted: "src/session",
    api_error: "src/api"
  };
  return files[event] ?? "src";
}

function dateInTimezone(timezone: string): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: timezone });
}

function inferPeriod(errors: ErrorEvent[], timezone: string): string {
  if (!errors.length) return dateInTimezone(timezone);
  const dates = errors
    .map((error) => error.ts)
    .filter((ts): ts is string => Boolean(ts))
    .sort();
  if (!dates.length) return dateInTimezone(timezone);
  return `${dates[0].slice(0, 10)} to ${dates[dates.length - 1].slice(0, 10)}`;
}

function summarize(total: number, rootCauses: RootCause[]): string {
  if (total === 0) return "No errors found. No fixes recommended.";
  if (rootCauses.length === 0) return `Analyzed ${total} errors, but found no clear root-cause chain. No automated fixes recommended.`;
  const top = rootCauses[0];
  return `${top.event} accounts for ${top.percentage}% of ${total} analyzed errors when downstream symptoms are included. ${rootCauses.length} root cause(s) produced ${rootCauses.reduce((sum, cause) => sum + cause.totalImpact, 0)} total impacted events.`;
}
