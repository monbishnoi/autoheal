import type { Report } from "../../core/types.js";
import { renderDiagnosisPrompt } from "../causal-reasoning.js";
import type { DiagnosisContext, DiagnosisEngine } from "../engine.js";

export class ClaudeApiAdapter implements DiagnosisEngine {
  constructor(private readonly apiKey: string, private readonly model = "claude-sonnet-4-20250514") {}

  async diagnose(context: DiagnosisContext): Promise<Report> {
    if (!this.apiKey) throw new Error("Claude API diagnosis requires an Anthropic API key.");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 4000,
        messages: [{ role: "user", content: renderDiagnosisPrompt(context.prompt, context) }]
      })
    });

    if (!response.ok) throw new Error(`Claude API diagnosis failed: ${response.status} ${await response.text()}`);
    const payload = await response.json() as { content?: Array<{ type: string; text?: string }> };
    const text = payload.content?.map((part) => part.text ?? "").join("\n") ?? "";
    const parsed = extractJson<Report>(text);
    if (!parsed) throw new Error("Claude API response did not contain a JSON diagnosis report.");
    return { ...parsed, rawOutput: text };
  }
}

function extractJson<T>(text: string): T | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
