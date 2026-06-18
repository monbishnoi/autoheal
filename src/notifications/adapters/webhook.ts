import type { NotificationLevel } from "../../core/types.js";
import type { Notification } from "../types.js";

export class WebhookNotification implements Notification {
  constructor(private readonly url: string) {}

  async send(message: string, level: NotificationLevel = "info"): Promise<void> {
    const response = await fetch(this.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message, level })
    });
    if (!response.ok) throw new Error(`Webhook notification failed: ${response.status}`);
  }
}
