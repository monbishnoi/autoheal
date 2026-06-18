import { execFile } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { BackupStrategy } from "../core/types.js";

const execFileAsync = promisify(execFile);

export interface Backup {
  id: string;
  strategy: BackupStrategy;
  path?: string;
  timestamp: string;
  reason: string;
  stashRef?: string;
  commitRef?: string;
}

export interface BackupProvider {
  create(reason?: string): Promise<Backup>;
  restore(id?: string): Promise<boolean>;
  list(): Promise<Backup[]>;
}

export class FolderCopyBackup implements BackupProvider {
  constructor(
    private readonly projectRoot: string,
    private readonly backupRoot: string,
    private readonly pathsToCopy = ["src", "config", "package.json", "tsconfig.json"]
  ) {}

  async create(reason = "manual"): Promise<Backup> {
    const id = `${timestampId()}_${safeId(reason)}`;
    const target = path.join(this.backupRoot, id);
    await mkdir(target, { recursive: true });

    for (const relative of this.pathsToCopy) {
      const source = path.join(this.projectRoot, relative);
      if (!existsSync(source)) continue;
      await cp(source, path.join(target, relative), { recursive: true, force: true });
    }

    const backup: Backup = { id, strategy: "folder-copy", path: target, timestamp: new Date().toISOString(), reason };
    await writeFile(path.join(target, "metadata.json"), `${JSON.stringify(backup, null, 2)}\n`, "utf8");
    return backup;
  }

  async restore(id = "latest"): Promise<boolean> {
    const backup = id === "latest" ? (await this.list())[0] : (await this.list()).find((item) => item.id === id);
    if (!backup?.path) return false;

    const entries = await readdir(backup.path, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === "metadata.json") continue;
      const source = path.join(backup.path, entry.name);
      const target = path.join(this.projectRoot, entry.name);
      await rm(target, { recursive: true, force: true });
      await cp(source, target, { recursive: true, force: true });
    }
    return true;
  }

  async list(): Promise<Backup[]> {
    if (!existsSync(this.backupRoot)) return [];
    const dirs = await readdir(this.backupRoot, { withFileTypes: true });
    const backups = await Promise.all(dirs.filter((dir) => dir.isDirectory()).map(async (dir) => {
      const metaPath = path.join(this.backupRoot, dir.name, "metadata.json");
      if (!existsSync(metaPath)) return null;
      return JSON.parse(await readFile(metaPath, "utf8")) as Backup;
    }));
    return backups.filter((backup): backup is Backup => backup !== null)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }
}

export class GitBackup implements BackupProvider {
  constructor(private readonly projectRoot: string, private readonly backupRoot: string) {}

  async create(reason = "manual"): Promise<Backup> {
    await mkdir(this.backupRoot, { recursive: true });
    const id = `${timestampId()}_${safeId(reason)}`;
    const { stdout: head } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: this.projectRoot });
    const { stdout: status } = await execFileAsync("git", ["status", "--porcelain"], { cwd: this.projectRoot });
    let stashRef: string | undefined;

    if (status.trim()) {
      await execFileAsync("git", ["stash", "push", "-u", "-m", `autoheal:${id}`], { cwd: this.projectRoot });
      const { stdout } = await execFileAsync("git", ["stash", "list", "--format=%gd %s"], { cwd: this.projectRoot });
      const line = stdout.split("\n").find((row) => row.includes(`autoheal:${id}`));
      stashRef = line?.split(" ")[0];
      if (!stashRef) throw new Error("Git backup failed: stash reference was not created.");
    }

    const backup: Backup = { id, strategy: "git", timestamp: new Date().toISOString(), reason, stashRef, commitRef: head.trim() };
    await writeFile(path.join(this.backupRoot, `${id}.json`), `${JSON.stringify(backup, null, 2)}\n`, "utf8");
    return backup;
  }

  async restore(id = "latest"): Promise<boolean> {
    const backup = id === "latest" ? (await this.list())[0] : (await this.list()).find((item) => item.id === id);
    if (!backup) return false;
    await execFileAsync("git", ["reset", "--hard", backup.commitRef ?? "HEAD"], { cwd: this.projectRoot });
    await execFileAsync("git", ["clean", "-fd"], { cwd: this.projectRoot });
    if (backup.stashRef) await execFileAsync("git", ["stash", "apply", backup.stashRef], { cwd: this.projectRoot });
    return true;
  }

  async list(): Promise<Backup[]> {
    if (!existsSync(this.backupRoot)) return [];
    const files = (await readdir(this.backupRoot)).filter((file) => file.endsWith(".json"));
    const backups = await Promise.all(files.map(async (file) => JSON.parse(await readFile(path.join(this.backupRoot, file), "utf8")) as Backup));
    return backups.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }
}

export function createBackupProvider(strategy: BackupStrategy, projectRoot: string, storagePath: string, backupPaths?: string[]): BackupProvider {
  const backupRoot = path.join(storagePath, "backups");
  return strategy === "git"
    ? new GitBackup(projectRoot, backupRoot)
    : new FolderCopyBackup(projectRoot, backupRoot, backupPaths);
}

function timestampId(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-");
}
