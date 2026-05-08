# AI Mesh Memory

## Project Snapshot
TAJ Pharmacy v4 is a Tauri 2 desktop pharmacy system with React, TypeScript, Rust, SQLite, and a Node/PostgreSQL cloud owner dashboard.

## Current Phase
AI Agent Mesh v0.7-v0.9 operational contract. Goal: make the unified AI Development Team Mesh operational by standardizing the DeepSeek Manager input/output contract, agent task packets, agent reports, manual n8n manager workflow design, and first real task run protocol.

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
- PR #6 merged: AI Development Team Mesh operating model.
- PR #7 merged: docs-only PR gate.
- OpenRouter works.
- Gemini works.
- n8n manual rules are documented.
- Branch `infra/ai-agent-mesh-operational-v0-7-to-v0-9` created.
- Purpose is to make DeepSeek Manager generate consistent packets for Cascade, Gemini, Copilot, and future GPT-5.5.

## Next Actions
- Use the operational contract for the first real task: Manual POS Regression Planning.
- Build the manual n8n Manager Router v0.8 only after human approval.
- Keep all workflow activation, publishing, GitHub commenting, and merging behind explicit human approval.

## Agent Policy
- Read this file and `.ai/MODEL_ROUTER.yaml` before major work.
- Respect `.ai/locks/active-locks.json` when present.
- Write reviews to `.ai/reviews/` or PR comments.
- Keep v0 outputs review-only unless a human explicitly approves changes.
