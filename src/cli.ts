#!/usr/bin/env node
const modulePath = import.meta.url.endsWith("/src/cli.ts") ? "../dist/index.js" : "./index.js";
const { AutoHeal } = await import(modulePath) as typeof import("./index.js");

const command = process.argv[2] ?? "status";
const arg = process.argv[3];

const heal = new AutoHeal({
  storagePath: process.env.AUTOHEAL_STORAGE ?? "./data/autoheal",
  errorLogPath: process.env.AUTOHEAL_ERROR_LOG,
  diagnosisEngine: process.env.AUTOHEAL_DIAGNOSIS_ENGINE === "claude-code" ? "claude-code" : undefined,
  projectRoot: process.env.AUTOHEAL_PROJECT_ROOT ?? process.cwd(),
  backup: (process.env.AUTOHEAL_BACKUP as "git" | "folder-copy" | undefined) ?? "folder-copy"
});

try {
  if (command === "init") {
    await heal.init();
    console.log("AutoHeal initialized.");
  } else if (command === "status") {
    const status = await heal.getStatus();
    if (!status.initialized) {
      console.log("AutoHeal not initialized.");
    } else {
      console.log(`Level: ${status.level} | Mode: ${status.mode} | Pending consent: ${status.pendingConsent || status.pendingRepairConsent} | Total errors: ${status.totalErrors}`);
    }
  } else if (command === "diagnose") {
    await heal.enableDiagnosis();
    const report = await heal.diagnose();
    console.log(report.conversationalSummary);
  } else if (command === "apply") {
    if (!arg) throw new Error("Usage: autoheal apply <fix-id>");
    const result = await heal.apply(arg);
    console.log(result.message);
    process.exitCode = result.success ? 0 : 1;
  } else if (command === "rollback") {
    const ok = await heal.rollback(arg ?? "latest");
    console.log(ok ? "Rollback complete." : "Rollback failed.");
    process.exitCode = ok ? 0 : 1;
  } else {
    console.log("Usage: autoheal <init|status|diagnose|apply|rollback> [id]");
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
