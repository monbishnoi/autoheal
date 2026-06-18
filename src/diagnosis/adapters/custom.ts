import type { Report } from "../../core/types.js";
import type { DiagnosisContext, DiagnosisEngine } from "../engine.js";

export type CustomDiagnosisFunction = (context: DiagnosisContext) => Promise<Report> | Report;

export class CustomDiagnosisAdapter implements DiagnosisEngine {
  constructor(private readonly fn: CustomDiagnosisFunction) {}

  async diagnose(context: DiagnosisContext): Promise<Report> {
    return this.fn(context);
  }
}
