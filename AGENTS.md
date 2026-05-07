# AI Agent Instructions — PMS Pharmacy v4

> **This project uses MULTIPLE AI agents.** Follow these rules regardless of which AI tool you are.

## Rule 1: Read Before Coding
At the **start of every session**, read `docs/AGENT-HANDOFF.md`. It contains:
- What is already built (don't redo it)
- Architecture rules and coding conventions
- Credentials and deployment details
- What to work on next

## Rule 2: Document Your Work
At the **end of every session**, update `docs/AGENT-HANDOFF.md` with:
- What you built (flip ⬜ to ✅)
- What broke or was discovered (add to "Known Tech Debt")
- What the next agent should do (update "NEXT" section)

## Rule 3: No Scattered Files
**NEVER** create plan/context files like `WORKING-CONTEXT.md`, `AI_HANDOFF_PLAN.md`, `progress.txt`, `TODO.md`, etc.
`docs/AGENT-HANDOFF.md` is the **only** documentation file.

## Quick Reference
- **Stack**: Tauri 2 + Rust + React + TypeScript + SQLite (desktop), Node.js + PostgreSQL (cloud)
- **DB migrations**: Additive only — never DROP columns/tables
- **Money**: Integer piasters (×100), display via `api.formatMoney()`
- **RTL-first**: Use `ms-*/me-*` not `ml-*/mr-*`
- **Max file**: 800 lines. **Max function**: 50 lines. No `any` in TypeScript.
- Full rules in `.cursorrules` and `.windsurfrules`
