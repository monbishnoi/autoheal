import { readFile } from "node:fs/promises";
import path from "node:path";
import { handleConsentResponse, getConsentPrompt } from "./core/consent.js";
import { ErrorTracker } from "./core/error-tracker.js";
import { transitionState } from "./core/state.js";
import type { AutoHealConfig, AutoHealState, AutoHealStatus, ErrorEvent, Fix, Report } from "./core/types.js";
import { CausalReasoningEngine, loadDefaultPrompt } from "./diagnosis/causal-reasoning.js";
import { ClaudeApiAdapter } from "./diagnosis/adapters/claude-api.js";
import { ClaudeCodeAdapter } from "./diagnosis/adapters/claude-code.js";
import { CustomDiagnosisAdapter } from "./diagnosis/adapters/custom.js";
import { isDiagnosisEngine, type DiagnosisEngine } from "./diagnosis/engine.js";
import { ConsoleNotification } from "./notifications/adapters/console.js";
import { CallbackNotification } from "./notifications/adapters/callback.js";
import { WebhookNotification } from "./notifications/adapters/webhook.js";
import type { Notification } from "./notifications/types.js";
import { createBackupProvider } from "./repair/backup.js";
import { HealthCheck } from "./repair/health-check.js";
import { Surgery } from "./repair/surgery.js";
import { FilesystemStorage, parseJsonl } from "./storage/filesystem.js";
import type { Storage } from "./storage/types.js";

export * from "./core/types.js";
export * from "./core/state.js";
export * from "./core/error-tracker.js";
export * from "./core/consent.js";
export * from "./storage/types.js";
export * from "./storage/filesystem.js";
export * from "./diagnosis/engine.js";
export * from "./diagnosis/causal-reasoning.js";
export * from "./diagnosis/adapters/claude-code.js";
export * from "./diagnosis/adapters/claude-api.js";
export * from "./diagnosis/adapters/custom.js";
export * from "./repair/backup.js";
export * from "./repair/health-check.js";
export * from "./repair/surgery.js";
export * from "./notifications/types.js";
export * from "./notifications/adapters/console.js";
export * from "./notifications/adapters/callback.js";
export * from "./notifications/adapters/webhook.js";

export class AutoHeal {
  readonly storage: Storage;
  private readonly config: Required<Pick<AutoHealConfig, "storagePath" | "timezone" | "consentThreshold" | "maxSurgeryAttempts" | "surgeryTimeout">> & AutoHealConfig;
  private readonly tracker: ErrorTracker;
  private readonly notification: Notification;
  private diagnosisEngine?: DiagnosisEngine;

  constructor(config: AutoHealConfig) {
    this.config = {
      timezone: "UTC",
      consentThreshold: 5,
      maxSurgeryAttempts: 3,
      surgeryTimeout: 600_000,
      ...config
    };
    this.storage = new FilesystemStorage(this.config.storagePath);
    this.tracker = new ErrorTracker(this.config);
    this.notification = this.createNotification();
  }

  async init(): Promise<void> {
    await this.storage.init();
  }

  async recordError(error: ErrorEvent): Promise<{ thresholdReached: boolean; significant: boolean }> {
    await this.storage.init();
    const state = await this.storage.loadState();
    const result = this.tracker.record(error, state);
    await this.storage.appendError(error);
    await this.storage.saveState(result.state);
    if (result.thresholdReached) await this.notification.send(getConsentPrompt(error.type ?? error.event), "warning");
    return { thresholdReached: result.thresholdReached, significant: result.significant };
  }

  async diagnose(): Promise<Report> {
    await this.storage.init();
    const state = transitionState(await this.storage.loadState(), "start-diagnosis");
    await this.storage.saveState(state);

    try {
      const rawErrorLog = await this.loadRawErrorLog();
      const errors = await this.parseErrors(rawErrorLog);
      const prompt = this.config.diagnosisPrompt ?? await loadDefaultPrompt();
      const engine = this.resolveDiagnosisEngine();
      const report = await engine.diagnose({
        prompt,
        rawErrorLog,
        errors,
        projectRoot: this.config.projectRoot,
        storagePath: this.config.storagePath,
        timezone: this.config.timezone,
        previousReports: await this.storage.listReports(4)
      });

      await this.storage.saveReport(report);
      for (const fix of report.proposedFixes) await this.storage.saveFix(fix);

      const next = transitionState(await this.storage.loadState(), "finish-diagnosis");
      next.lastReportId = report.id ?? report.date;
      if (report.proposedFixes.length) next.pendingRepairConsent = next.level < 3;
      await this.storage.saveState(next);
      await this.notification.send(report.conversationalSummary, report.proposedFixes.length ? "warning" : "success");
      return report;
    } catch (error) {
      const next = transitionState(await this.storage.loadState(), "finish-diagnosis");
      await this.storage.saveState(next);
      throw error;
    }
  }

  async handleConsent(response: string): Promise<string> {
    await this.storage.init();
    const result = handleConsentResponse(response, await this.storage.loadState());
    await this.storage.saveState(result.state);
    await this.notification.send(result.message, result.state.level > 0 ? "success" : "info");
    return result.message;
  }

  async hasPendingConsent(): Promise<boolean> {
    const state = await this.storage.loadState();
    return state.pendingConsentPrompt || state.pendingRepairConsent;
  }

  async getConsentPrompt(triggerEvent?: string): Promise<string> {
    const state = await this.storage.loadState();
    if (state.pendingRepairConsent) return "AutoHeal found proposed fixes. Enable repair so approved fixes can be applied with backup, verification, and rollback? (yes/no)";
    return getConsentPrompt(triggerEvent);
  }

  async getStatus(): Promise<AutoHealStatus> {
    const initialized = await this.storage.isInitialized();
    const state = await this.storage.loadState();
    return {
      initialized,
      level: state.level,
      mode: state.mode,
      pendingConsent: state.pendingConsentPrompt,
      pendingRepairConsent: state.pendingRepairConsent,
      totalErrors: state.totalErrors,
      errorCountSinceLastAsk: state.errorCountSinceLastAsk,
      lastErrorAt: state.lastErrorAt,
      lastReportId: state.lastReportId,
      lastFixId: state.lastFixId,
      lastBackupId: state.lastBackupId
    };
  }

  async approveFix(fixId: string): Promise<Fix | null> {
    return this.storage.updateFix(fixId, { status: "approved", userResponse: "yes" });
  }

  async apply(fixId: string): Promise<import("./repair/surgery.js").SurgeryResult> {
    await this.storage.init();
    const state = await this.storage.loadState();
    if (state.level < 3) throw new Error("AutoHeal repair is not enabled. Handle repair consent before applying fixes.");
    const surgery = this.createSurgery();
    const result = await surgery.applyFix(fixId);
    const next = await this.storage.loadState();
    next.lastFixId = fixId;
    if (result.backupId) next.lastBackupId = result.backupId;
    await this.storage.saveState(next);
    await this.notification.send(result.message, result.success ? "success" : "error");
    return result;
  }

  async rollback(backupId = "latest"): Promise<boolean> {
    const result = await this.createSurgery().rollback(backupId);
    await this.notification.send(result ? `Rolled back ${backupId}.` : `Rollback failed for ${backupId}.`, result ? "success" : "error");
    return result;
  }

  async enableDiagnosis(): Promise<void> {
    await this.storage.saveState(transitionState(await this.storage.loadState(), "enable-diagnosis"));
  }

  async enableRepair(): Promise<void> {
    await this.storage.saveState(transitionState(await this.storage.loadState(), "enable-repair"));
  }

  private createNotification(): Notification {
    if (this.config.notify) return new CallbackNotification(this.config.notify);
    if (this.config.webhookUrl) return new WebhookNotification(this.config.webhookUrl);
    return new ConsoleNotification();
  }

  private resolveDiagnosisEngine(): DiagnosisEngine {
    if (this.diagnosisEngine) return this.diagnosisEngine;
    const configured = this.config.diagnosisEngine;
    if (!configured) return (this.diagnosisEngine = new CausalReasoningEngine());
    if (configured === "claude-code") return (this.diagnosisEngine = new ClaudeCodeAdapter(this.config.claudeCodeCommand, this.config.surgeryTimeout));
    if (configured === "claude-api") return (this.diagnosisEngine = new ClaudeApiAdapter(this.config.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY ?? ""));
    if (isDiagnosisEngine(configured)) return (this.diagnosisEngine = configured);
    if (typeof configured === "function") return (this.diagnosisEngine = new CustomDiagnosisAdapter(configured));
    return (this.diagnosisEngine = new CausalReasoningEngine());
  }

  private async loadRawErrorLog(): Promise<string> {
    if (this.config.errorLogPath) {
      try {
        return await readFile(path.resolve(this.config.errorLogPath), "utf8");
      } catch {
        return "";
      }
    }
    return this.storage.readRawErrorLog();
  }

  private async parseErrors(raw: string): Promise<ErrorEvent[]> {
    if (typeof this.config.errorParser === "function") return this.config.errorParser(raw);
    return parseJsonl(raw);
  }

  private createSurgery(): Surgery {
    if (!this.config.projectRoot) throw new Error("projectRoot is required for repair.");
    const backup = createBackupProvider(this.config.backup ?? "git", this.config.projectRoot, this.config.storagePath, this.config.backupPaths);
    return new Surgery({
      storage: this.storage,
      backup,
      projectRoot: this.config.projectRoot,
      healthCheck: new HealthCheck(this.config.healthCheck),
      maxAttempts: this.config.maxSurgeryAttempts,
      timeoutMs: this.config.surgeryTimeout,
      serviceRestart: this.config.serviceRestart
    });
  }
}
