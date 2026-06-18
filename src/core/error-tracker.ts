import type { AutoHealConfig, AutoHealState, ErrorEvent } from "./types.js";

export const DEFAULT_SIGNIFICANT_ERRORS = [
  "tool_timeout",
  "max_iterations",
  "context_exhausted",
  "api_error",
  "session_corruption",
  "job_failed"
];

export interface ErrorTrackerResult {
  significant: boolean;
  thresholdReached: boolean;
  state: AutoHealState;
}

export class ErrorTracker {
  private threshold: number;
  private significantErrors: Set<string>;

  constructor(config: Pick<AutoHealConfig, "consentThreshold" | "significantErrors"> = {}) {
    this.threshold = config.consentThreshold ?? 5;
    this.significantErrors = new Set(config.significantErrors ?? DEFAULT_SIGNIFICANT_ERRORS);
  }

  record(error: ErrorEvent, state: AutoHealState, now = new Date()): ErrorTrackerResult {
    const eventType = error.type ?? error.event ?? "unknown";
    const significant = this.significantErrors.has(eventType);
    const next = { ...state, updatedAt: now.toISOString() };

    next.totalErrors += 1;
    next.lastErrorAt = error.ts ?? now.toISOString();

    if (!significant || next.level >= 2 || next.consentAsked) {
      return { significant, thresholdReached: false, state: next };
    }

    next.errorCountSinceLastAsk += 1;
    const thresholdReached = next.errorCountSinceLastAsk >= this.threshold;
    if (thresholdReached) next.pendingConsentPrompt = true;

    return { significant, thresholdReached, state: next };
  }

  detectPatterns(errors: ErrorEvent[]): Record<string, number> {
    return errors.reduce<Record<string, number>>((counts, error) => {
      const key = error.type ?? error.event ?? "unknown";
      counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    }, {});
  }
}
