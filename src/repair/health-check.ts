import type { HealthCheckFunction } from "../core/types.js";

export class HealthCheck {
  constructor(private readonly check: HealthCheckFunction = async () => true) {}

  async run(): Promise<{ ok: boolean; error?: string }> {
    try {
      return { ok: await this.check() };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}
