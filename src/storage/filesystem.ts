import { mkdir, readFile, readdir, stat, unlink, writeFile, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { createDefaultState, normalizeState } from "../core/state.js";
import type { AutoHealState, ErrorEvent, Fix, Report, SurgeryState } from "../core/types.js";
import type { Storage } from "./types.js";

export class FilesystemStorage implements Storage {
  readonly root: string;
  readonly stateFile: string;
  readonly errorsFile: string;
  readonly runsFile: string;
  readonly reportsDir: string;
  readonly fixesDir: string;
  readonly surgeryStateFile: string;

  constructor(root: string) {
    this.root = path.resolve(root);
    this.stateFile = path.join(this.root, "state.json");
    this.errorsFile = path.join(this.root, "errors.jsonl");
    this.runsFile = path.join(this.root, "runs.jsonl");
    this.reportsDir = path.join(this.root, "reports");
    this.fixesDir = path.join(this.root, "fixes");
    this.surgeryStateFile = path.join(this.root, "surgery-state.json");
  }

  async init(): Promise<void> {
    await mkdir(this.reportsDir, { recursive: true });
    await mkdir(this.fixesDir, { recursive: true });
    if (!existsSync(this.stateFile)) await this.saveState(createDefaultState());
    if (!existsSync(this.errorsFile)) await writeFile(this.errorsFile, "", "utf8");
    if (!existsSync(this.runsFile)) await writeFile(this.runsFile, "", "utf8");
  }

  async isInitialized(): Promise<boolean> {
    try {
      await stat(this.stateFile);
      return true;
    } catch {
      return false;
    }
  }

  async loadState(): Promise<AutoHealState> {
    try {
      const raw = await readFile(this.stateFile, "utf8");
      return normalizeState(JSON.parse(raw) as Partial<AutoHealState>);
    } catch {
      return createDefaultState();
    }
  }

  async saveState(state: AutoHealState): Promise<void> {
    await mkdir(this.root, { recursive: true });
    await writeFile(this.stateFile, `${JSON.stringify(normalizeState(state), null, 2)}\n`, "utf8");
  }

  async appendError(error: ErrorEvent): Promise<void> {
    await mkdir(this.root, { recursive: true });
    const entry = { ts: error.ts ?? new Date().toISOString(), ...error };
    await appendFile(this.errorsFile, `${JSON.stringify(entry)}\n`, "utf8");
  }

  async readErrors(): Promise<ErrorEvent[]> {
    const raw = await this.readRawErrorLog();
    return parseJsonl(raw);
  }

  async readRawErrorLog(): Promise<string> {
    try {
      return await readFile(this.errorsFile, "utf8");
    } catch {
      return "";
    }
  }

  async appendRun(entry: Record<string, unknown>): Promise<void> {
    await mkdir(this.root, { recursive: true });
    await appendFile(this.runsFile, `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`, "utf8");
  }

  async saveReport(report: Report): Promise<string> {
    await mkdir(this.reportsDir, { recursive: true });
    const id = report.id ?? report.date;
    const file = path.join(this.reportsDir, `${safeId(id)}.json`);
    await writeFile(file, `${JSON.stringify({ ...report, id }, null, 2)}\n`, "utf8");
    return file;
  }

  async loadReport(id: string): Promise<Report | null> {
    return this.readJson<Report>(path.join(this.reportsDir, `${safeId(id)}.json`));
  }

  async listReports(limit = 20): Promise<Report[]> {
    return this.listJson<Report>(this.reportsDir, limit);
  }

  async saveFix(fix: Fix): Promise<string> {
    await mkdir(this.fixesDir, { recursive: true });
    const file = path.join(this.fixesDir, `${safeId(fix.id)}.json`);
    await writeFile(file, `${JSON.stringify(fix, null, 2)}\n`, "utf8");
    return file;
  }

  async loadFix(id: string): Promise<Fix | null> {
    return this.readJson<Fix>(path.join(this.fixesDir, `${safeId(id)}.json`));
  }

  async updateFix(id: string, updates: Partial<Fix>): Promise<Fix | null> {
    const fix = await this.loadFix(id);
    if (!fix) return null;
    const updated = { ...fix, ...updates };
    await this.saveFix(updated);
    return updated;
  }

  async listFixes(statuses?: Fix["status"][]): Promise<Fix[]> {
    const fixes = await this.listJson<Fix>(this.fixesDir, 1000);
    return statuses?.length ? fixes.filter((fix) => statuses.includes(fix.status)) : fixes;
  }

  async loadSurgeryState(): Promise<SurgeryState | null> {
    return this.readJson<SurgeryState>(this.surgeryStateFile);
  }

  async saveSurgeryState(state: SurgeryState): Promise<void> {
    await mkdir(this.root, { recursive: true });
    await writeFile(this.surgeryStateFile, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  }

  async clearSurgeryState(): Promise<void> {
    if (existsSync(this.surgeryStateFile)) await unlink(this.surgeryStateFile);
  }

  private async readJson<T>(file: string): Promise<T | null> {
    try {
      return JSON.parse(await readFile(file, "utf8")) as T;
    } catch {
      return null;
    }
  }

  private async listJson<T>(dir: string, limit: number): Promise<T[]> {
    try {
      const files = (await readdir(dir))
        .filter((file) => file.endsWith(".json"))
        .sort()
        .reverse()
        .slice(0, limit);
      const rows: Array<T | null> = await Promise.all(files.map((file) => this.readJson<T>(path.join(dir, file))));
      return rows.filter((row): row is T => row !== null);
    } catch {
      return [];
    }
  }
}

export function parseJsonl(raw: string): ErrorEvent[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as ErrorEvent;
      } catch {
        return null;
      }
    })
    .filter((event): event is ErrorEvent => event !== null && typeof event.error === "string");
}

function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]/g, "-");
}
