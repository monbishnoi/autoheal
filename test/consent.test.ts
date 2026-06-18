import { describe, expect, it } from "vitest";
import { handleConsentResponse, isConsentResponse } from "../src/core/consent.js";
import { createDefaultState } from "../src/core/state.js";

describe("consent", () => {
  it("enables diagnosis only after yes", () => {
    const state = { ...createDefaultState(), pendingConsentPrompt: true };
    expect(isConsentResponse("yes", state)).toBe(true);
    const result = handleConsentResponse("yes", state);
    expect(result.state.level).toBe(2);
    expect(result.state.consentResponse).toBe("yes");
  });

  it("stores no without activation", () => {
    const state = { ...createDefaultState(), pendingConsentPrompt: true };
    const result = handleConsentResponse("no", state);
    expect(result.state.level).toBe(0);
    expect(result.state.consentAsked).toBe(true);
    expect(result.state.consentResponse).toBe("no");
  });
});
