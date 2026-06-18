import type { AutoHealState, ErrorEvent, Fix, Report, SurgeryState } from "../core/types.js";

export interface Storage {
  init(): Promise<void>;
  isInitialized(): Promise<boolean>;
  loadState(): Promise<AutoHealState>;
  saveState(state: AutoHealState): Promise<void>;
  appendError(error: ErrorEvent): Promise<void>;
  readErrors(): Promise<ErrorEvent[]>;
  readRawErrorLog(): Promise<string>;
  appendRun(entry: Record<string, unknown>): Promise<void>;
  saveReport(report: Report): Promise<string>;
  loadReport(id: string): Promise<Report | null>;
  listReports(limit?: number): Promise<Report[]>;
  saveFix(fix: Fix): Promise<string>;
  loadFix(id: string): Promise<Fix | null>;
  updateFix(id: string, updates: Partial<Fix>): Promise<Fix | null>;
  listFixes(statuses?: Fix["status"][]): Promise<Fix[]>;
  loadSurgeryState(): Promise<SurgeryState | null>;
  saveSurgeryState(state: SurgeryState): Promise<void>;
  clearSurgeryState(): Promise<void>;
}
