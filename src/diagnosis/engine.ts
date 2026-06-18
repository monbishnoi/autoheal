import type { ErrorEvent, Report } from "../core/types.js";

export interface DiagnosisContext {
  prompt: string;
  rawErrorLog: string;
  errors: ErrorEvent[];
  projectRoot?: string;
  storagePath: string;
  timezone: string;
  previousReports?: Report[];
}

export interface DiagnosisEngine {
  diagnose(context: DiagnosisContext): Promise<Report>;
}

export function isDiagnosisEngine(value: unknown): value is DiagnosisEngine {
  return typeof value === "object" && value !== null && typeof (value as DiagnosisEngine).diagnose === "function";
}
