import { transitionState } from "./state.js";
import type { AutoHealState } from "./types.js";

export function getConsentPrompt(triggerEvent?: string): string {
  const descriptions: Record<string, string> = {
    tool_timeout: "a tool took too long to respond",
    max_iterations: "the agent hit its tool or iteration limit",
    context_exhausted: "the agent ran out of context space",
    api_error: "there was an API error",
    session_corruption: "a session needed repair",
    job_failed: "a scheduled job failed"
  };
  const trigger = triggerEvent ? descriptions[triggerEvent] ?? "there was an error" : "there were recurring errors";

  return `I've noticed recurring issues lately (${trigger} being the latest).

I can analyze error patterns and propose fixes for your review. This runs locally, traces likely root causes, and waits for approval before any changes.

Want to enable AutoHeal diagnosis? (yes/no)`;
}

export function isConsentResponse(message: string, state: AutoHealState): boolean {
  const normalized = message.toLowerCase().trim();
  return (state.pendingConsentPrompt || state.pendingRepairConsent) && ["yes", "no", "y", "n"].includes(normalized);
}

export function handleConsentResponse(message: string, state: AutoHealState, now = new Date()): { state: AutoHealState; message: string } {
  const normalized = message.toLowerCase().trim();
  const approved = normalized === "yes" || normalized === "y";

  if (state.pendingRepairConsent) {
    if (approved) {
      return {
        state: transitionState({ ...state, pendingRepairConsent: false }, "enable-repair", now),
        message: "AutoHeal repair enabled. Approved fixes can now be applied with rollback and verification."
      };
    }
    return {
      state: { ...state, pendingRepairConsent: false, updatedAt: now.toISOString() },
      message: "No problem. AutoHeal will keep proposing fixes for manual review."
    };
  }

  const next = {
    ...state,
    consentAsked: true,
    consentResponse: approved ? "yes" as const : "no" as const,
    pendingConsentPrompt: false,
    errorCountSinceLastAsk: 0,
    updatedAt: now.toISOString()
  };

  if (approved) {
    return {
      state: transitionState(next, "enable-diagnosis", now),
      message: "AutoHeal diagnosis enabled. Reports will be generated when you run diagnosis or schedule it."
    };
  }

  return {
    state: next,
    message: "No problem. AutoHeal will remain off unless you enable diagnosis later."
  };
}
