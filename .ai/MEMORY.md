# AI Mesh Memory

## Project Snapshot
TAJ Pharmacy v4 is a Tauri 2 desktop pharmacy system with React, TypeScript, Rust, SQLite, and a Node/PostgreSQL cloud owner dashboard.

## Current Phase
AI Agent Mesh v0.5 operating model. Goal: define the unified AI Development Team Mesh where OpenRouter DeepSeek acts as head architect / manager, routes implementation and review work, and keeps all merge, workflow activation, and production actions behind human approval.

## Active Decisions
- GitHub is the source of truth.
- OpenRouter DeepSeek v4 is the manager and head architect for task routing, prompts, reviews, and merge recommendations.
- Windsurf Cascade is the implementation agent.
- Gemini is the architecture reviewer.
- GitHub Copilot is the inline/test assistant.
- n8n is the manual coordination layer.
- Windsurf weekly quota default is 38%, so default quota mode is conservation.
- v0.x has no auto-merge, no workflow activation/publish, no production deployment automation, and no live patient data in prompts.

## Current Risks
- Pharmacy, inventory, prescription, payment, auth, sync, Rust, and database changes are high-risk.
- Secrets must never be committed to Git.
- Multiple agents must not edit locked files.

## Recently Completed
- PR #1-#5 merged.
- OpenRouter works.
- Gemini works.
- n8n manual rules are documented.
- Branch `infra/ai-agent-mesh-v0-5-operating-model` created for the operating-model alignment.

## Next Actions
- Define v0.6 structured manager input/output contract.
- Build v0.7 manual n8n workflow combining DeepSeek manager and Gemini review.
- Keep all workflow activation, publishing, GitHub commenting, and merging behind explicit human approval.

## Agent Policy
- Read this file and `.ai/MODEL_ROUTER.yaml` before major work.
- Respect `.ai/locks/active-locks.json` when present.
- Write reviews to `.ai/reviews/` or PR comments.
- Keep v0 outputs review-only unless a human explicitly approves changes.
