import { AutoHeal } from "../../src/index.js";

const heal = new AutoHeal({
  storagePath: "./data/autoheal",
  projectRoot: ".",
  backup: "folder-copy"
});

await heal.init();
await heal.recordError({ type: "tool_timeout", tool: "example", error: "Timeout after 30s" });
console.log(await heal.getStatus());
