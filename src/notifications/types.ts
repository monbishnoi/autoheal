import type { NotificationLevel } from "../core/types.js";

export interface Notification {
  send(message: string, level?: NotificationLevel): Promise<void>;
}
