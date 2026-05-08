# AI Development Team Mesh Operating Model

## A. Purpose

The AI Development Team Mesh is a reusable AI development team system for TAJ Pharmacy v4 and future medical-field applications. It is not only a review checklist. It defines a coordinated team of AI agents with explicit roles, model routing, shared memory, review loops, and human approval gates.

The system exists to help Ammar convert product goals into safe implementation work while preserving pharmacy-domain correctness, medical workflow safety, source traceability, and human control. The mesh may draft prompts, route tasks, review outputs, and recommend merge readiness, but it does not replace human approval.

## B. Authority Hierarchy

When instructions conflict, use this order:

1. Ammar / human owner instructions.
2. Safety rules: no secrets, no `.env` edits, no live patient data, no auto-merge, and no workflow publish or activation without approval.
3. `AGENTS.md` as short repo-wide law.
4. `.ai/MODEL_ROUTER.yaml` as machine-readable routing policy.
5. `.ai/MEMORY.md` as current project state and handoff memory.
6. `docs/ai-agent-mesh-operating-model.md` as detailed team model.
7. Task-specific prompts.
8. Individual model or tool behavior.

## C. Agent Roles

### 1. OpenRouter DeepSeek v4 - Head Architect / Manager Agent

Responsibilities:

- Receive Ammar's goal.
- Break the goal into concrete tasks.
- Select which agent should do each task.
- Write prompts for Cascade, Gemini, Copilot, and GPT-5.5.
- Review agent outputs.
- Decide whether DeepSeek, Gemini, Copilot, or Cascade should be used for a task.
- Inspect UI/UX, Rust, Tauri, frontend, backend, database, security, and workflow risk.
- Produce a merge recommendation.
- Never auto-merge.
- Never expose secrets.

### 2. Windsurf Cascade - Implementation Agent

Responsibilities:

- Edit code and documentation within the approved task scope.
- Run local commands.
- Use the selected model according to routing policy.
- Follow `AGENTS.md`, `.windsurfrules`, and the manager prompt.
- Report changed files, risks, tests, and next steps.

### 3. Gemini Pro / Gemini 3.x - Architecture Reviewer

Responsibilities:

- Large-context system review.
- Architecture impact analysis.
- Cross-module risk review.
- Medical workflow safety review.
- Scalability and maintainability review.
- Second opinion for high-risk design decisions.

### 4. GitHub Copilot Pro - Inline Coding Assistant

Responsibilities:

- Autocomplete.
- Small refactors.
- Tests.
- PR and code assistance.
- Not project manager.
- Not final reviewer.

### 5. Future GPT-5.5 Pro - Optional Strategy / Orchestration Agent

Responsibilities:

- Complex planning.
- Prompt generation.
- Process design.
- Secondary manager role only if explicitly enabled later.

### 6. n8n - Coordination Layer

Responsibilities:

- Run manual workflows.
- Route review requests.
- Hold disabled and inactive workflows until approved.
- Coordinate future GitHub PR comments.
- Never auto-edit or auto-merge in v0.x.

### 7. GitHub Repo - Shared State Layer

Responsibilities:

- Commits.
- Pull requests.
- Source of truth.
- Merged documentation.
- Review traceability.

### 8. Ammar - Product Owner / QA Tester / Final Approver

Responsibilities:

- Describe the goal to the DeepSeek manager.
- Test the app like a real user.
- Approve merges.
- Approve workflow activation or publish.
- Approve production actions.

## D. Communication Flow

Standard flow:

1. Ammar gives a goal to the DeepSeek manager.
2. DeepSeek classifies the goal, identifies risk, and selects agents.
3. DeepSeek writes a task prompt for Cascade, Gemini, Copilot, or GPT-5.5.
4. The selected agent executes implementation or review.
5. The selected agent reports output, changed files, risks, tests, and next steps.
6. DeepSeek reviews the output and produces a recommendation.
7. Ammar manually tests or reviews the result.
8. GitHub PR and merge happen only after human approval.

Short form:

`Ammar -> DeepSeek Manager -> task prompt -> Cascade/Gemini/Copilot -> output -> DeepSeek review -> Ammar approval -> GitHub PR/merge`

## E. Model Selection Rules

- DeepSeek v4 Pro through OpenRouter is the manager, head architect, and reviewer.
- Cascade Sonnet 4.6 is the normal implementation model.
- Cascade Opus or GPT model is reserved for complex integration when available.
- Gemini 2.5 Flash is currently tested for smoke checks; Gemini Pro / Gemini 3.x is the later target for stronger architecture review.
- Copilot is inline and test support.
- GPT-5.5 Pro is future advanced planning and orchestration.

## F. Conflict Prevention

- Task prompts must not conflict with `AGENTS.md`.
- Any old rule file that conflicts must be updated or marked deprecated.
- Local JSON and docs are the source of truth for n8n workflow design.
- Do not sync or import over an existing n8n workflow.
- Browser n8n is the manual testing surface.
- n8n workflow JSON should not be modified unless there is a serious safety issue.
- Secrets, API keys, tokens, credentials, and private customer or patient data must not be copied into prompts, docs, workflow JSON, reports, or Git history.

## G. Standard Task Lifecycle

1. Ammar describes the goal.
2. DeepSeek Manager classifies the task.
3. Manager selects agent and model.
4. Manager writes the prompt.
5. Implementation or review agent executes.
6. Agent reports.
7. Manager reviews the result.
8. Ammar tests the app manually.
9. PR is created.
10. Human approval is required before merge.

## H. Risk Routing

| Risk area | Required route |
| --- | --- |
| UI, copy, docs | Cascade / Sonnet |
| Frontend app logic | Cascade plus optional Copilot |
| Rust, Tauri, database, pharmacy logic | DeepSeek required |
| Architecture or cross-module changes | Gemini required |
| Auth, security, payments, sync | DeepSeek plus Gemini required |
| Releases | Release gatekeeper checklist required |

## I. Non-Goals for v0.x

- No autonomous code edits by manager.
- No auto-merge.
- No live patient data in prompts.
- No workflow publish or activation.
- No automatic GitHub commenting.
- No production deployment automation.

## J. Docs-Only PR Gate

Docs-only and rule-only PRs do not require OpenRouter, Gemini, GPT-5.5, or Copilot review when they pass local deterministic checks. AI review is reserved for changes that affect code, security, database state, workflow JSON, app behavior, medical or business logic, auth, sync, payment, prescription handling, inventory, releases, or architecture risk.

Use local checks instead of AI credits for docs-only/rule-only branches:

```bash
git status
git diff master..BRANCH --name-only
git diff master..BRANCH --stat
git diff master..BRANCH --check
git ls-files | findstr /i "\.env .db .sqlite"
```

Pass criteria:

- Changed files are only documentation or rule files.
- No app source files changed.
- No workflow JSON changed.
- No `.env`, `.db`, or `.sqlite` files are tracked.
- `git diff --check` is clean.
- Manual inspection finds no API keys, tokens, credentials, or secrets in the diff.
- Branch merges cleanly on GitHub.

If all criteria pass, create the PR and merge manually without AI safety review. If any criterion fails, stop and escalate to the DeepSeek Manager or human review.

## K. Next Implementation Phases

- v0.5 operating model and rule audit.
- v0.6 docs-only PR gate and structured manager input/output contract.
- v0.7 manual n8n workflow combining DeepSeek manager and Gemini review.
- v0.8 PR comment draft generation only.
- v1 approved GitHub trigger and PR comment workflow.

## Rule Conflict Audit

| File or area | Status | Notes |
| --- | --- | --- |
| `AGENTS.md` | Needs update | Repo-wide rules existed but described v0 as review-only. Add a short AI Development Team Mesh section and link to this operating model. |
| `.ai/MEMORY.md` | Needs update | Current phase described v0 review-only scaffold. Update to v0.5 operating model state. |
| `.ai/MODEL_ROUTER.yaml` | Needs update | Router listed Roo / DeepSeek mainly as reviewer. Align OpenRouter DeepSeek v4 as manager/head architect while preserving Cascade, Gemini, and Copilot roles. |
| `docs/ai-agent-mesh-v0.md` | Needs update | Useful v0 manual review and n8n runbook. Mark v0.5 as the unified development-team operating model and link here. |
| `docs/AGENT-HANDOFF.md` | Aligned | Canonical project handoff. Must be updated at session end with this documentation work. |
| Root `AGENT-HANDOFF.md` | Not found | No root duplicate exists; `docs/AGENT-HANDOFF.md` remains canonical. |
| `.windsurfrules` | Aligned | Existing implementation, handoff, safety, and code-quality rules align with Cascade as implementation agent. No edit needed. |
| `.cursorrules` | Aligned | Existing universal AI rules align with the hierarchy and handoff requirement. No edit needed. |
| `.agents/` | Aligned | Contains local n8n skills only. No mesh conflict found. |
| `README.md` | Aligned | Points readers to `docs/AGENT-HANDOFF.md`; no conflicting mesh policy. |
| `docs/agents/*.md` | Duplicate / legacy role layer | Older role-file system for project lead, frontend, Rust, cloud, QA, and UI/UX remains useful as role-specific memory, but the unified mesh authority is now this operating model plus `AGENTS.md` and `.ai/MODEL_ROUTER.yaml`. |
| `docs/agents/_ACTIVE-LOCK.md` | Duplicate / legacy lock layer | Human-readable lock file remains useful, but `.ai/locks/active-locks.json` is the AI Mesh runtime lock path when present. |
| `docs/agents/_WORK-LOG.md` | Duplicate / legacy session log | Keep as historical role-system log; do not treat it as higher authority than `docs/AGENT-HANDOFF.md`. |
| `workflows/taj-agent-mesh-commit-qa-v0.json` | Aligned | Workflow is inactive/manual v0 scaffold. No JSON change needed. |
| `plans/gemini-review-agent-system.md` | Duplicate / legacy design note | Historical Gemini/shared-memory review note. Superseded by this operating model for current mesh authority. |
| Content search hits in package, app, and cloud files | Aligned / irrelevant | Search terms matched package metadata and application strings such as user-agent or unrelated terms. No rule conflict found and no app source was modified. |
