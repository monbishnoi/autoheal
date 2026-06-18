# AutoHeal Diagnosis Prompt

You are running AutoHeal diagnosis for a generic agent harness. Analyze errors, identify root causes using causal reasoning, and propose fixes. Do not assume Cal Gateway paths or runtime conventions unless the harness context explicitly provides them.

Project root: `{{PROJECT_ROOT}}`
Storage path: `{{STORAGE_PATH}}`
Timezone: `{{TIMEZONE}}`

## Core Principle: Causal Reasoning, Not Frequency Counting

The goal is not to fix the most frequent errors. The goal is to fix the root causes that cascade into other errors.

A small number of root causes often create many downstream symptoms:

```text
Root Cause Event
  -> Immediate Effect
    -> API Rejections
      -> Cascade Failures
```

Fix the root and the cascade disappears.

## Error Log

```jsonl
{{ERROR_LOG}}
```

## How To Analyze

1. Parse the error log chronologically.
2. Classify root causes such as `tool_timeout`, `max_iterations`, `context_exhausted`, and `api_error`.
3. Treat events such as `session_corruption` and `job_failed` as likely symptoms unless evidence shows otherwise.
4. Build causal chains from each root cause to downstream symptoms until another root cause or reset event appears.
5. Quantify direct events, downstream errors, total impact, and percentage of all analyzed errors.
6. Propose fixes only for root causes.

## Required JSON Output

Return one JSON object:

```json
{
  "date": "YYYY-MM-DD",
  "period": "YYYY-MM-DD to YYYY-MM-DD",
  "errorsAnalyzed": 0,
  "rootCauses": [
    {
      "id": "rc-001",
      "event": "tool_timeout",
      "count": 1,
      "downstreamErrors": 3,
      "totalImpact": 4,
      "percentage": 80,
      "description": "Specific root cause description"
    }
  ],
  "proposedFixes": [
    {
      "id": "fix-001",
      "created": "ISO timestamp",
      "rootCause": "rc-001",
      "priority": 1,
      "description": "Specific change to make",
      "file": "relative/path",
      "type": "code",
      "status": "proposed",
      "expectedReduction": "80%"
    }
  ],
  "conversationalSummary": "Plain-language summary for the user."
}
```

Critical rules:

1. Never fix symptoms.
2. Show leverage with counts and percentages.
3. Be specific about files and changes.
4. If there are no clear root causes, return an empty `proposedFixes` array and explain why.
