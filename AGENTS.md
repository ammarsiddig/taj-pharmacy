# AI Agent Instructions - PMS Pharmacy v4

> This project uses multiple AI agents. Follow these rules regardless of which AI tool you are.

## Rule 1: Read Before Coding

At the start of every normal application work session, read `docs/AGENT-HANDOFF.md`. It contains:

- What is already built
- Architecture rules and coding conventions
- Credentials and deployment details
- What to work on next

## Rule 2: Document Your Work

At the end of every normal application work session, update `docs/AGENT-HANDOFF.md` with:

- What you built
- What broke or was discovered
- What the next agent should do

## Rule 3: No Scattered Files

Do not create plan or context files like `WORKING-CONTEXT.md`, `AI_HANDOFF_PLAN.md`, `progress.txt`, or `TODO.md`.

`docs/AGENT-HANDOFF.md` is the main application handoff file.

Exception: the approved AI Agent Mesh v0 scaffold may use `.ai/` and `docs/ai-agent-mesh-v0.md` for model routing, review reports, runtime lock examples, and n8n setup documentation.

## AI Agent Mesh v0

- Before major AI mesh work, read `.ai/MEMORY.md` and `.ai/MODEL_ROUTER.yaml`.
- Do not edit files listed in `.ai/locks/active-locks.json` unless the lock explicitly allows fallback edits.
- Use Cascade for scoped implementation and workflow scaffold work only.
- Use GitHub Copilot for tests and small inline edits.
- Use Roo Code / DeepSeek for Rust, database, and pharmacy logic review.
- Use Gemini Ultra for architecture impact review and daily summaries.
- Use GPT-5.5 / Opus for high-risk security, payment, auth, sync, and integration review.
- Do not expose secrets, API keys, tokens, credentials, or private customer data.
- High-risk pharmacy, inventory, prescription, payment, auth, sync, or database changes require review before merge.
- v0 AI outputs are review-only unless a human explicitly approves implementation.

## Quick Reference

- Stack: Tauri 2 + Rust + React + TypeScript + SQLite desktop, Node.js + PostgreSQL cloud
- DB migrations: additive only; never drop columns or tables
- Money: integer piasters, display via `api.formatMoney()`
- RTL-first: use `ms-*` and `me-*`, not `ml-*` and `mr-*`
- Max file: 800 lines
- Max function: 50 lines
- No `any` in TypeScript
- Full rules are in `.cursorrules` and `.windsurfrules`
