import type { AutoHealLevel, AutoHealMode, AutoHealState } from "./types.js";

export function createDefaultState(now = new Date()): AutoHealState {
  return {
    level: 0,
    mode: "off",
    consentAsked: false,
    consentResponse: null,
    enabledAt: null,
    errorCountSinceLastAsk: 0,
    totalErrors: 0,
    lastErrorAt: null,
    pendingConsentPrompt: false,
    pendingRepairConsent: false,
    repairEnabledAt: null,
    lastReportId: null,
    lastFixId: null,
    lastBackupId: null,
    updatedAt: now.toISOString()
  };
}

export function normalizeState(raw: Partial<AutoHealState> | null | undefined): AutoHealState {
  const state = { ...createDefaultState(), ...(raw ?? {}) };
  if (Number(state.level) > 3) state.level = 3;
  if (state.level !== 0 && state.level !== 2 && state.level !== 3) {
    state.level = Number(state.level) >= 1 ? 2 : 0;
  }
  state.mode = modeForLevel(state.level);
  return state;
}

export function modeForLevel(level: AutoHealLevel): AutoHealMode {
  if (level >= 3) return "repairing";
  if (level >= 2) return "monitoring";
  return "off";
}

export function transitionState(
  state: AutoHealState,
  action: "enable-diagnosis" | "disable-diagnosis" | "enable-repair" | "disable-repair" | "start-diagnosis" | "finish-diagnosis" | "start-repair" | "finish-repair",
  now = new Date()
): AutoHealState {
  const next = { ...state, updatedAt: now.toISOString() };

  switch (action) {
    case "enable-diagnosis":
      next.level = 2;
      next.mode = "monitoring";
      next.consentAsked = true;
      next.consentResponse = "yes";
      next.enabledAt ??= now.toISOString();
      next.pendingConsentPrompt = false;
      next.errorCountSinceLastAsk = 0;
      return next;
    case "disable-diagnosis":
      next.level = 0;
      next.mode = "off";
      next.consentResponse = "disabled";
      next.pendingConsentPrompt = false;
      next.pendingRepairConsent = false;
      return next;
    case "enable-repair":
      if (next.level < 2) throw new Error("Diagnosis must be enabled before repair.");
      next.level = 3;
      next.mode = "repairing";
      next.pendingRepairConsent = false;
      next.repairEnabledAt ??= now.toISOString();
      return next;
    case "disable-repair":
      next.level = next.level >= 2 ? 2 : 0;
      next.mode = modeForLevel(next.level);
      next.pendingRepairConsent = false;
      return next;
    case "start-diagnosis":
      if (next.level < 2) throw new Error("Cannot diagnose while AutoHeal is off.");
      next.mode = "diagnosing";
      return next;
    case "finish-diagnosis":
      next.mode = modeForLevel(next.level);
      return next;
    case "start-repair":
      if (next.level < 3) throw new Error("Repair requires Level 3 consent.");
      next.mode = "repairing";
      return next;
    case "finish-repair":
      next.mode = modeForLevel(next.level);
      return next;
  }
}
