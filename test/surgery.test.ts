import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Fix } from "../src/core/types.js";
import { FolderCopyBackup } from "../src/repair/backup.js";
import { HealthCheck } from "../src/repair/health-check.js";
import { Surgery } from "../src/repair/surgery.js";
import { FilesystemStorage } from "../src/storage/filesystem.js";

describe("surgery", () => {
  it("rolls back when verification fails", async () => {
    const root = path.join(tmpdir(), `autoheal-test-${Date.now()}`);
    const project = path.join(root, "project");
    const storagePath = path.join(root, "autoheal");
    await mkdir(path.join(project, "src"), { recursive: true });
    await writeFile(path.join(project, "src", "app.txt"), "healthy", "utf8");

    const storage = new FilesystemStorage(storagePath);
    await storage.init();
    const fix: Fix = {
      id: "fix-001",
      created: new Date().toISOString(),
      rootCause: "rc-001",
      description: "break file for test",
      status: "approved",
      command: "node -e \"require('fs').writeFileSync('src/app.txt','broken')\""
    };
    await storage.saveFix(fix);

    const surgery = new Surgery({
      storage,
      backup: new FolderCopyBackup(project, path.join(storagePath, "backups"), ["src"]),
      projectRoot: project,
      healthCheck: new HealthCheck(async () => false),
      maxAttempts: 1,
      timeoutMs: 10_000
    });

    const result = await surgery.applyFix("fix-001");
    expect(result.success).toBe(false);
    expect(result.rolledBack).toBe(true);
    expect(await readFile(path.join(project, "src", "app.txt"), "utf8")).toBe("healthy");

    await rm(root, { recursive: true, force: true });
  });
});
