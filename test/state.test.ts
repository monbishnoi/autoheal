import { describe, expect, it } from "vitest";
import { createDefaultState, transitionState } from "../src/core/state.js";

describe("state machine", () => {
  it("starts off", () => {
    const state = createDefaultState();
    expect(state.level).toBe(0);
    expect(state.mode).toBe("off");
  });

  it("enables diagnosis and repair in order", () => {
    const diagnosis = transitionState(createDefaultState(), "enable-diagnosis");
    expect(diagnosis.level).toBe(2);
    expect(diagnosis.mode).toBe("monitoring");

    const repair = transitionState(diagnosis, "enable-repair");
    expect(repair.level).toBe(3);
    expect(repair.mode).toBe("repairing");
  });

  it("blocks repair before diagnosis consent", () => {
    expect(() => transitionState(createDefaultState(), "enable-repair")).toThrow("Diagnosis must be enabled");
  });
});
