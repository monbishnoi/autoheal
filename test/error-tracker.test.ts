import { describe, expect, it } from "vitest";
import { createDefaultState } from "../src/core/state.js";
import { ErrorTracker } from "../src/core/error-tracker.js";

describe("error tracker", () => {
  it("counts significant errors and raises consent at threshold", () => {
    const tracker = new ErrorTracker({ consentThreshold: 2 });
    const first = tracker.record({ type: "tool_timeout", error: "slow" }, createDefaultState());
    expect(first.thresholdReached).toBe(false);
    expect(first.state.errorCountSinceLastAsk).toBe(1);

    const second = tracker.record({ type: "tool_timeout", error: "slow again" }, first.state);
    expect(second.thresholdReached).toBe(true);
    expect(second.state.pendingConsentPrompt).toBe(true);
  });

  it("detects event patterns", () => {
    const tracker = new ErrorTracker();
    expect(tracker.detectPatterns([
      { type: "tool_timeout", error: "a" },
      { event: "api_error", error: "b" },
      { type: "tool_timeout", error: "c" }
    ])).toEqual({ tool_timeout: 2, api_error: 1 });
  });
});
