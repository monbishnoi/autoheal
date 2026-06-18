export type AutoHealLevel = 0 | 2 | 3;
export type AutoHealMode = "off" | "monitoring" | "diagnosing" | "repairing";
export type ConsentResponse = "yes" | "no" | "disabled" | null;
export type BackupStrategy = "git" | "folder-copy";
export type DiagnosisEngineName = "claude-code" | "claude-api";
export type NotificationLevel = "info" | "warning" | "error" | "success";

export interface ErrorEvent {
  ts?: string;
  event?: string;
  type?: string;
  tool?: string;
  message?: string;
  error: string;
  session?: string;
  recovery?: string;
  metadata?: Record<string, unknown>;
}

export interface RootCause {
  id: string;
  event: string;
  count: number;
  downstreamErrors: number;
  totalImpact: number;
  percentage: number;
  description: string;
}

export interface Fix {
  id: string;
  created: string;
  rootCause: string;
  description: string;
  file?: string;
  type?: "code" | "config" | "docs" | "command" | string;
  status: "proposed" | "approved" | "applying" | "applied" | "failed" | "rolled_back" | "needs_human";
  userResponse?: string | null;
  expectedReduction?: string;
  patch?: string;
  command?: string;
  backupId?: string;
  appliedAt?: string;
  failedAt?: string;
  error?: string;
  attempt?: number;
  attempts?: number;
  history?: unknown[];
}

export interface Report {
  id?: string;
  date: string;
  period?: string;
  errorsAnalyzed: number;
  rootCauses: RootCause[];
  proposedFixes: Fix[];
  conversationalSummary: string;
  rawOutput?: string;
}

export interface AutoHealState {
  level: AutoHealLevel;
  mode: AutoHealMode;
  consentAsked: boolean;
  consentResponse: ConsentResponse;
  enabledAt: string | null;
  errorCountSinceLastAsk: number;
  totalErrors: number;
  lastErrorAt: string | null;
  pendingConsentPrompt: boolean;
  pendingRepairConsent: boolean;
  repairEnabledAt: string | null;
  lastReportId: string | null;
  lastFixId: string | null;
  lastBackupId: string | null;
  updatedAt: string;
}

export interface AutoHealStatus {
  initialized: boolean;
  level: AutoHealLevel;
  mode: AutoHealMode;
  pendingConsent: boolean;
  pendingRepairConsent: boolean;
  totalErrors: number;
  errorCountSinceLastAsk: number;
  lastErrorAt: string | null;
  lastReportId: string | null;
  lastFixId: string | null;
  lastBackupId: string | null;
}

export type ErrorParser = (rawLog: string) => ErrorEvent[] | Promise<ErrorEvent[]>;
export type NotifyFunction = (message: string, level?: NotificationLevel) => void | Promise<void>;
export type HealthCheckFunction = () => boolean | Promise<boolean>;

export interface SurgeryState {
  inProgress: boolean;
  fixId: string;
  backupId: string;
  originalBackupId: string;
  attempt: number;
  maxAttempts: number;
  startedAt: string;
  previousError?: string | null;
  history: Array<Record<string, unknown>>;
}

export interface AutoHealConfig {
  storagePath: string;
  errorLogPath?: string;
  errorParser?: "jsonl" | ErrorParser;
  diagnosisEngine?: DiagnosisEngineName | import("../diagnosis/engine.js").DiagnosisEngine | import("../diagnosis/adapters/custom.js").CustomDiagnosisFunction;
  diagnosisPrompt?: string;
  anthropicApiKey?: string;
  claudeCodeCommand?: string;
  notify?: NotifyFunction;
  healthCheck?: HealthCheckFunction;
  backup?: BackupStrategy;
  projectRoot?: string;
  timezone?: string;
  consentThreshold?: number;
  significantErrors?: string[];
  maxSurgeryAttempts?: number;
  surgeryTimeout?: number;
  serviceRestart?: () => void | Promise<void>;
  backupPaths?: string[];
  webhookUrl?: string;
}
