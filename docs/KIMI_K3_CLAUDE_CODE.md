# Kimi K3 with Claude Code — Project Usage Notes

This file is about using Kimi as the model behind Claude Code. It is not an EMBERLENS runtime dependency. Verify the exact endpoint and model ID in the account/API product that issued your key; Kimi Code and Moonshot Platform have different endpoint/model conventions.

## 1. Recommended model choice

For major EMBERLENS work (repository audit, scientific-method design, cross-file architecture changes, large documentation tasks), use the highest-context K3 option your account and endpoint actually support. For routine coding, use a lower-cost/smaller-context option only if the project context fits and it performs adequately on your own test tasks.

Kimi's current documentation distinguishes:

| API product | Anthropic-compatible base URL (overseas) | Model ID convention |
|---|---|---|
| Kimi Code API | `https://api.kimi.ai/coding/` | `k3`, `k3-256k` |
| Moonshot Platform API | `https://api.moonshot.ai/anthropic` (confirm current exact path in the official Claude Code guide) | `kimi-k3` |

For Kimi Code, `k3` is the full-context K3 option and `k3-256k` is the 256K option. Kimi documentation says the full-context option consumes more quota; use the smaller context for normal work when it is sufficient. Model IDs are not interchangeable across API products.

## 2. Configuration safety

- Store API keys in the user's Claude Code settings or environment, never in the EMBERLENS repository.
- Do not paste a real key into `CLAUDE.md`, `.env.example`, prompts, screenshots, commits, or logs.
- Do not copy configuration from a tutorial until its endpoint matches the product that issued the key.
- Do not add a Kimi API key to the app's `.env`; the Kimi key is only for the coding agent. NASA FIRMS credentials are separate runtime secrets.
- Avoid changing client identity headers or disguising the client. Follow Kimi's current integration terms.

## 3. Verify the model before important work

In Claude Code, use `/status` and inspect the model and base URL. Send a small harmless request. Confirm the response is successful and the configured model matches the intended API product. A model label in a CLI menu alone is not enough if a custom endpoint is being used.

Kimi's current docs provide a dedicated Claude Code setup guide; use it for exact environment variable names and model aliases:
- https://www.kimi.com/code/docs/en/third-party-tools/claude-code.html
- https://www.kimi.ai/help/kimi-code/models
- https://www.kimi.ai/academy/use-kimi-api-in-codex-and-claude-code

## 4. Effort level

Kimi Code documentation lists supported K3 effort levels as `low`, `high`, and `max` (confirm current values for the exact model/API). The Claude Code interface may map effort labels differently. Use a high-effort setting for scientific-method decisions and large refactors when your account supports it; use a normal setting for small edits to conserve latency/quota. Do not blindly copy context-window or max-token environment overrides from a guide: they must match the endpoint's actual limits.

## 5. Best working pattern for this repository

Use Kimi as a disciplined engineer, not as a one-prompt app generator:

1. Audit the repository and data first.
2. Ask for one milestone or vertical slice at a time.
3. Require a plan and identify files before broad changes.
4. Require source references and data evidence for scientific decisions.
5. Require tests and exact command output.
6. Ask it to inspect its own diff and update the status/decision log.
7. Keep optional features deferred until the calendar works end to end.

## 6. Prompt for continuing work in the current repository

```text
Read CLAUDE.md, docs/DECISIONS.md ADR-012, docs/STATUS.md, DATA_SOURCE_REGISTER.md §11, and docs/SOURCE_DATA_COVERAGE_REPORT.md first. Treat earlier 24-month/Sundarbans plans and pasted handoffs as historical when they conflict with ADR-012.

The accepted data scope is already downloaded, validated, and loaded: Bangladesh task-specified bbox (`bangladesh-bd`), MODIS_SP plus VIIRS_SNPP_SP, 2010-01-01 through 2026-07-31. Do not re-download, re-load, alter the source register, or change products/window unless the user explicitly changes the scope. Never print, log, or commit NASA keys.

Continue the existing project toward release. Recheck current files and runtime before relying on status notes. The API listening on port 8000 is known to be stale; do not disrupt it or access the national DB for writes. Verify source changes with the isolated container/scratch DB. Focus on remaining measurable gaps in docs/STATUS.md: public deployment with persistent storage/TLS, scientific limitations and validation, full export traceability, and a controlled runtime cutover. Make reversible improvements directly, run the relevant tests, and update status only from verified evidence.

Do not claim the project is complete while public deployment or required validation remains open. If a task truly requires a provider account, domain, or a user-controlled runtime action, finish all local preparation first and state the exact remaining external step.
```

## 7. Practical rule

A long context window helps with repository understanding, but it does not replace tests, source verification, or careful task boundaries. Keep project facts in the repository docs and update them when the implementation changes.
