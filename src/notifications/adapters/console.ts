import type { NotificationLevel } from "../../core/types.js";
import type { Notification } from "../types.js";

export class ConsoleNotification implements Notification {
  async send(message: string, level: NotificationLevel = "info"): Promise<void> {
    const prefix = `[autoheal:${level}]`;
    if (level === "error") console.error(prefix, message);
    else console.log(prefix, message);
  }
}
