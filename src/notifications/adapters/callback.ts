import type { NotificationLevel, NotifyFunction } from "../../core/types.js";
import type { Notification } from "../types.js";

export class CallbackNotification implements Notification {
  constructor(private readonly callback: NotifyFunction) {}

  async send(message: string, level?: NotificationLevel): Promise<void> {
    await this.callback(message, level);
  }
}
