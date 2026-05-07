# AI Mesh Memory

## Project Snapshot
TAJ Pharmacy v4 is a Tauri 2 desktop pharmacy system with React, TypeScript, Rust, SQLite, and a Node/PostgreSQL cloud owner dashboard.

## Current Phase
AI Agent Mesh v0 scaffold. Goal: classify changes, route reviews, and produce review-only reports before any automation edits code.

## Active Decisions
- GitHub is the source of truth.
- n8n orchestrates review workflows.
- Windsurf weekly quota default is 38%, so default quota mode is conservation.
- v0 is review-only: no automatic edits, commits, merges, or deployments.

## Current Risks
- Pharmacy, inventory, prescription, payment, auth, sync, Rust, and database changes are high-risk.
- Secrets must never be committed to Git.
- Multiple agents must not edit locked files.

## Recently Completed
- Local Git repository initialized.
- Branch `infra/ai-agent-mesh-v0` created for AI mesh setup.

## Next Actions
- Configure n8n-as-code manually in Windsurf.
- Create the first local workflow: `TAJ Agent Mesh - Commit QA v0`.
- Test with manual payloads before enabling GitHub triggers.

## Agent Policy
- Read this file and `.ai/MODEL_ROUTER.yaml` before major work.
- Respect `.ai/locks/active-locks.json` when present.
- Write reviews to `.ai/reviews/` or PR comments.
- Keep v0 outputs review-only unless a human explicitly approves changes.
