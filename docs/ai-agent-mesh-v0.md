# AI Agent Mesh v0

## Purpose

This scaffold creates a safe local-first AI Agent Mesh for TAJ Pharmacy v4. Version 0 classifies changes, routes review work to the right model, and writes review-only output. It does not auto-edit, auto-commit, auto-merge, or deploy.

## Local-First Development

Work starts in the local repository on a dedicated branch:

```bash
git checkout -b infra/ai-agent-mesh-v0
```

Agents create files locally. A human reviews `git diff` before committing. n8n workflows stay local until explicitly pushed or activated.

## GitHub As Source Of Truth

Git is the durable record for source, workflow definitions, review reports, and mesh configuration examples. Runtime state and secrets are excluded from Git:

- `.ai/USAGE_STATE.json`
- `.ai/locks/active-locks.json`
- `.env`
- `.env.*`
- `*.sqlite`
- `*.db`
- `logs/`

## n8n As Orchestrator

n8n coordinates workflow steps:

1. Receive a manual, webhook, push, or PR event.
2. Read changed files and metadata.
3. Classify risk.
4. Check quota mode.
5. Route review to the selected model.
6. Write a PR comment or markdown report.

For v0, n8n must not change application files.

## OpenRouter Manual Setup

OpenRouter integration is prepared as a disabled placeholder in `workflows/taj-agent-mesh-commit-qa-v0.json`. Keep the workflow inactive and keep the OpenRouter HTTP Request node deactivated until manual approval.

Manual setup steps:

1. Create an OpenRouter API key manually in your OpenRouter account.
2. In n8n, open Credentials.
3. Create a credential named exactly `OpenRouter API`.
4. Use an HTTP Header Auth credential.
5. Set the header name to `Authorization`.
6. Set the header value to `Bearer <your-openrouter-api-key>`.
7. Save the credential in n8n only.

Do not store the OpenRouter key in repo files, workflow JSON, `.ai/`, `.env`, docs, screenshots, reports, or Git history. Do not activate the OpenRouter node, publish the workflow, or enable GitHub triggers until a human explicitly approves the next step.

## Gemini Manual Setup

Gemini integration is prepared as a disabled architecture-review placeholder in `workflows/taj-agent-mesh-commit-qa-v0.json`. Keep the workflow inactive and keep the Gemini HTTP Request node deactivated until manual approval.

Manual setup steps:

1. Create a Gemini API key manually in your Google AI Studio or Google Cloud account.
2. In n8n, open Credentials.
3. Create a credential named exactly `Gemini API`.
4. Use an HTTP Header Auth credential unless the node is later replaced with a native Gemini credential type.
5. Store the key only inside the n8n credential.
6. Save the credential in n8n only.

Do not store the Gemini key in repo files, workflow JSON, `.ai/`, `.env`, docs, screenshots, reports, or Git history. Do not activate the Gemini node, publish the workflow, or enable GitHub triggers until a human explicitly approves the next step.

## Model Routing

Routing is defined in `.ai/MODEL_ROUTER.yaml`.

- Windsurf Cascade: focused implementation and workflow scaffold.
- GitHub Copilot: tests and small inline edits.
- Roo Code / DeepSeek: Rust, database, and pharmacy logic review.
- Gemini Ultra: architecture impact and daily summaries.
- GPT-5.5 / Opus: high-risk security, auth, sync, payment, and integration review.

## Quota Fallback

Default mode is `conservation` because Windsurf weekly quota is assumed to be 38%.

- `fast`: weekly >= 70
- `normal`: weekly >= 40 and < 70
- `conservation`: weekly >= 20 and < 40
- `emergency`: weekly < 20 or daily < 15

In conservation or emergency mode, avoid long Windsurf sessions and route deep analysis to specialist models.

## Lock-File Policy

Runtime locks live in `.ai/locks/active-locks.json`, which is ignored by Git. The committed `.ai/locks/active-locks.example.json` shows the format.

Agents must check active locks before editing. If a file is locked, write review notes instead of modifying it unless the lock explicitly allows fallback edits.

## Start Of Day

1. Pull latest Git changes.
2. Read `.ai/MEMORY.md` and `.ai/MODEL_ROUTER.yaml`.
3. Check `.ai/USAGE_STATE.json` if present.
4. Check `.ai/locks/active-locks.json` if present.
5. Choose the correct model route for the task.

## End Of Day

1. Update `.ai/MEMORY.md` with concise status.
2. Save any QA summaries in `.ai/reports/`.
3. Clear or expire finished runtime locks.
4. Review `git status` and `git diff`.
5. Commit only reviewed, non-secret files.

## V0 Boundaries

Build now:

- classify
- route
- review
- comment or report

Do not build yet:

- automatic file overwriting
- automatic merge to main
- automatic roadmap commits
- local file watcher on every save
- multi-agent parallel editing
- production deployment automation
