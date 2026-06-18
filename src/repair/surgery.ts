import { exec } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { Fix, SurgeryState } from "../core/types.js";
import type { Storage } from "../storage/types.js";
import { HealthCheck } from "./health-check.js";
import type { BackupProvider } from "./backup.js";

const execAsync = promisify(exec);

export interface SurgeryOptions {
  storage: Storage;
  backup: BackupProvider;
  projectRoot: string;
  healthCheck: HealthCheck;
  maxAttempts: number;
  timeoutMs: number;
  serviceRestart?: () => void | Promise<void>;
}

export interface SurgeryResult {
  success: boolean;
  message: string;
  fixId: string;
  backupId?: string;
  rolledBack?: boolean;
}

export class Surgery {
  constructor(private readonly options: SurgeryOptions) {}

  async applyFix(fixId: string, attempt = 1, previousError?: string | null): Promise<SurgeryResult> {
    const fix = await this.options.storage.loadFix(fixId);
    if (!fix) return { success: false, message: `Fix not found: ${fixId}`, fixId };
    if (fix.status === "applied") return { success: false, message: `Fix already applied: ${fixId}`, fixId };

    const backup = await this.options.backup.create(fixId);
    const surgeryState: SurgeryState = {
      inProgress: true,
      fixId,
      backupId: backup.id,
      originalBackupId: backup.id,
      attempt,
      maxAttempts: this.options.maxAttempts,
      startedAt: new Date().toISOString(),
      previousError,
      history: [{ attempt, startedAt: new Date().toISOString(), status: "started" }]
    };
    await this.options.storage.saveSurgeryState(surgeryState);
    await this.options.storage.updateFix(fixId, { status: "applying", backupId: backup.id, attempt });

    try {
      await this.applyChange(fix);
      if (this.options.serviceRestart) await this.options.serviceRestart();
      const health = await this.options.healthCheck.run();
      if (!health.ok) throw new Error(health.error ?? "Health check failed.");

      await this.options.storage.updateFix(fixId, { status: "applied", appliedAt: new Date().toISOString(), backupId: backup.id, attempt });
      await this.options.storage.clearSurgeryState();
      return { success: true, message: `Fix ${fixId} applied and verified.`, fixId, backupId: backup.id };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await this.options.backup.restore(backup.id);
      await this.options.storage.updateFix(fixId, {
        status: attempt >= this.options.maxAttempts ? "needs_human" : "failed",
        failedAt: new Date().toISOString(),
        error: reason,
        attempts: attempt
      });
      await this.options.storage.clearSurgeryState();
      return { success: false, message: `Fix ${fixId} failed and was rolled back: ${reason}`, fixId, backupId: backup.id, rolledBack: true };
    }
  }

  async rollback(id = "latest"): Promise<boolean> {
    return this.options.backup.restore(id);
  }

  private async applyChange(fix: Fix): Promise<void> {
    if (fix.patch) {
      const tempDir = await mkdtemp(path.join(tmpdir(), "autoheal-patch-"));
      const patchPath = path.join(tempDir, "fix.patch");
      try {
        await writeFile(patchPath, fix.patch, "utf8");
        await execAsync(`git apply --whitespace=fix "${patchPath}"`, {
          cwd: this.options.projectRoot,
          timeout: this.options.timeoutMs
        });
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
      return;
    }

    if (fix.command) {
      await execAsync(fix.command, { cwd: this.options.projectRoot, timeout: this.options.timeoutMs });
      return;
    }

    throw new Error("Fix does not include a patch or command to apply.");
  }
}
