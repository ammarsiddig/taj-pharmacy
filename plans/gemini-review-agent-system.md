# TAJ Pharmacy v4 — Multi-Agent Shared Memory System Review

> **Purpose**: This document describes the multi-agent coordination system built for the TAJ Pharmacy SaaS project. Share this with an AI reviewer (Gemini) to get feedback on the system design, identify gaps, and suggest improvements.

---

## 1. Project Context

**TAJ Pharmacy v4** is a pharmacy management SaaS with:
- **Desktop app**: Tauri 2 + Rust + React 18 + TypeScript + Tailwind CSS v4 + SQLite
- **Cloud API**: Node.js/Express + PostgreSQL 16 on Hetzner VPS
- **Owner PWA**: React + Vite (for pharmacy owners to monitor their business remotely)
- **Admin Panel**: Same PWA, different route (for SaaS operators to manage tenants)

The project is at **Late Alpha / Early Beta** stage — Phase 1 (Desktop Production Hardening) is ~85% complete.

---

## 2. The Problem: Multiple AI Agents, One Codebase

We use **multiple AI coding assistants** on this project:
- **Windsurf Cascade** (primary, uses Claude/GPT models)
- **GitHub Copilot Pro** (in VS Code)
- **Google Gemini** (for review/planning)
- **Roo** (VS Code extension, architect/code modes)

Each agent starts with zero context. Without a shared memory system, agents:
- Redo work already completed by other agents
- Break conventions established by other agents
- Miss critical architectural rules (e.g., "never DROP columns")
- Overwrite each other's changes

---

## 3. The Shared Memory System — File Architecture

```
docs/
├── AGENT-HANDOFF.md          ← Single source of truth (1303 lines)
├── agents/
│   ├── _ACTIVE-LOCK.md       ← Concurrency control + task queue
│   ├── _WORK-LOG.md          ← Append-only session history
│   ├── PROJECT-LEAD.md       ← Architecture decisions, priorities, P0 issues
│   ├── RUST-DEVELOPER.md     ← Rust conventions, module map, active tasks
│   ├── FRONTEND-DEVELOPER.md ← React/TS conventions, module map, active tasks
│   ├── UI-UX-DESIGNER.md     ← Design system, color tokens, component specs
│   ├── CLOUD-ENGINEER.md     ← Infrastructure, API routes, deployment checklist
│   └── QA-ENGINEER.md        ← Test strategy, bug tracker, coverage matrix
│
.cursorrules                  ← Rules read by Cursor/Copilot
.windsurfrules                ← Rules read by Windsurf (includes cursorrules)
AGENTS.md                     ← Universal rules (read by all agents)
```

### 3.1 AGENT-HANDOFF.md — The Master Document (1303 lines)

This is the **single source of truth**. Every agent reads it at session start. It contains:

| Section | Content | Lines |
|---------|---------|-------|
| 1. Project Overview | Stack, key conventions (DO NOT change table) | ~30 |
| 2. What Is Built | Feature checklist with ✅/⬜ status | ~30 |
| 3. Cloud Deployment | VPS IP, SSH keys, admin tokens, Docker containers | ~35 |
| 4. Architecture | Code organization, sync model | ~25 |
| 5. Implementation Guide | Step-by-step for adding desktop/cloud features | ~20 |
| 6. Known Tech Debt | Table of issues with impact and status | ~25 |
| 7. Strategic Direction | 5-phase roadmap with detailed task lists | ~300 |
| 8. NEXT — Priority Queue | What the implementing agent should work on next | ~50 |
| 9. Agent Rules | Session protocol, NEVER list, code quality rules | ~25 |
| Archived Session Logs | Collapsible history of all completed sessions | ~750 |

**Key design decisions:**
- Credentials are stored in the handoff doc (security trade-off — agents need them to deploy/test)
- The "What Is Built" section uses ✅/⬜ markers that agents flip as they complete work
- The "NEXT" section is updated at the end of every session
- Session logs are collapsible `<details>` blocks to keep the active content scannable

### 3.2 _ACTIVE-LOCK.md — Concurrency Control

Prevents two agents from modifying the same files simultaneously.

**Current Session table:**
| Field | Value |
|-------|-------|
| Agent Role | _None_ |
| Model / IDE | _None_ |
| Started | _None_ |
| Working On | _None_ |
| Files Being Modified | _None_ |

**Task Queue (24 items):**
| # | Role | Task | Priority | Blocked By | Status |
|---|------|------|----------|-----------|--------|
| 1 | Rust Developer | Create errors.rs with typed AppError enum | 🔴 Critical | None | ⬜ |
| 2 | Rust Developer | Fix CHECK constraints | 🔴 Critical | None | ⬜ |
| ... | ... | ... | ... | ... | ... |

**Lock Rules:**
1. Only ONE agent active at a time (unless working on independent files)
2. Before starting: Update "Current Session"
3. During work: If you need files another agent owns, STOP and add a "Blocked By" entry
4. After finishing: Clear "Current Session", update queue, append to work log
5. If interrupted: Stale sessions >2 hours old are assumed ended

**Cross-Role Request Protocol:**
When an agent needs a change in another agent's territory, they add a task to the queue with the appropriate role and a "Blocked By" noting who requested it.

### 3.3 _WORK-LOG.md — Append-Only Session History

Every session ends with an entry here. Never edit past entries.

**Current entries:** 2 sessions (both Project Lead, both 2026-05-06)

**Template:**
```
## Session XXX — YYYY-MM-DD
- **Agent**: [Role] ([Model], [IDE/Platform])
- **Task**: [Brief description]
- **Changes**: [Specific changes]
- **Status**: ✅ Complete / ⚠️ Partial / ❌ Blocked
- **Handoff Notes**: [What the next agent needs to know]
```

### 3.4 Role-Specific Files (6 files)

Each role file follows the same structure:
1. **Role definition** — What you own, what you touch, what you NEVER do
2. **Session protocol** — Step-by-step for starting/ending a session
3. **Architecture** — Layer-specific design rules
4. **Module map** — Every file in your domain with line counts and status
5. **Active tasks** — Prioritized list with ⬜/✅ status
6. **Cross-role requests** — Pending requests from/to other roles
7. **Known issues** — Domain-specific problems

**Role ownership matrix:**

| Role | Owns | Touches | Never |
|------|------|---------|-------|
| Rust Developer | `src-tauri/src/` | `src/types/` | Frontend UI, cloud code |
| Frontend Developer | `src/` (except lib/) | `src/types/`, `src/i18n/` | Rust code, cloud code |
| UI/UX Designer | Design decisions | `src/index.css`, `src/components/ui/` | Business logic, API calls |
| Cloud Engineer | `pms-cloud/` | `cloud_sync.rs` | Desktop frontend, Rust commands |
| QA Engineer | `pms-testing/`, test files | Test files in any layer | Production business logic |
| Project Lead | Handoff doc, lock file | Nothing directly | Production source code |

### 3.5 Rule Files (3 files)

| File | Read By | Purpose |
|------|---------|---------|
| `AGENTS.md` | All agents | 3 universal rules: Read before coding, Document your work, No scattered files |
| `.cursorrules` | Cursor, Copilot | Full coding conventions + architecture rules |
| `.windsurfrules` | Windsurf | Same as cursorrules + ECC token efficiency + DDD architecture |

---

## 4. How It Works In Practice

### Session Flow (Typical)

```
1. Agent starts session
   ├── Reads AGENT-HANDOFF.md (full project context)
   ├── Reads _ACTIVE-LOCK.md (check if another agent is active)
   ├── Reads their role file (domain-specific context)
   └── Reads last 3 entries in _WORK-LOG.md (recent history)

2. Agent does work
   ├── Updates _ACTIVE-LOCK.md "Current Session" table
   ├── Follows conventions from their role file
   └── Checks task queue for next priority

3. Agent ends session
   ├── Updates AGENT-HANDOFF.md (flip ⬜→✅, update NEXT)
   ├── Updates their role file (flip ⬜→✅, update tasks)
   ├── Appends to _WORK-LOG.md
   ├── Clears _ACTIVE-LOCK.md "Current Session"
   └── Updates task queue status
```

### Current Prompt Engineering Workflow

We're also using a **prompt engineering layer** on top of this system:
- A "Prompt Engineer" agent (Roo in architect mode) designs detailed prompts
- The user copies prompts into Windsurf Cascade with specific model selection
- Results are verified by the prompt engineer before moving to the next task
- Model selection: Claude Sonnet 4 for design judgment, GPT-4o for mechanical tasks, Gemini Flash for i18n

---

## 5. What's Been Accomplished With This System

### UI/UX Polish Sprint (Current, using prompt engineering)

| Phase | Task | Model Used | Status |
|-------|------|-----------|--------|
| A1 | CSS animation keyframes + utility classes | Claude Sonnet 4 | ✅ Verified |
| A2 | Skeleton + SkeletonCard components | GPT-4o | ✅ Verified |
| B1 | Button component upgrade (tokens, loading, transitions) | Claude Sonnet 4 | ✅ Verified |
| B2 | Modal component upgrade (blur, animation, sizes, i18n) | Claude Sonnet 4 | ✅ Verified |
| B3 | Input component upgrade (icons, helper text, error states) | Claude Sonnet 4 | ✅ Verified |
| B4 | Toast animation + SuccessBurst component | Claude Sonnet 4 | ✅ Verified |
| B5 | EmptyState component | Claude Sonnet 4 | ✅ Verified |

### Previous Work (Using direct agent sessions)

- Full POS system with FEFO, prescription gates, split payments, void sales
- Purchase workflow with payment schedules, returns, accounting
- Cloud sync (table-snapshot model)
- Owner PWA + Admin Panel
- Permission guard system
- Audit logging
- Production build pipeline

---

## 6. Known Weaknesses & Open Questions

### What We're Unsure About

1. **Security**: Credentials (SSH keys, admin tokens) are in AGENT-HANDOFF.md. This is convenient but risky. Should we move to .env files? But then agents can't read them easily.

2. **Concurrency**: The lock file is advisory — nothing enforces it. If two agents run simultaneously, they can still conflict. Is this sufficient for a solo developer using multiple tools?

3. **Staleness**: AGENT-HANDOFF.md is 1303 lines. Agents must read the whole thing every session. As the project grows, this becomes expensive (token cost). Should we split it?

4. **Role file sync**: The 6 role files can drift out of sync with AGENT-HANDOFF.md. If an agent updates the handoff doc but forgets their role file, the next agent using that role gets stale info.

5. **Task queue vs reality**: The 24-item task queue in _ACTIVE-LOCK.md was created by one agent (Project Lead). It hasn't been updated by any implementing agent yet. Will it stay current?

6. **No automated verification**: There's no CI check that agents followed the rules (e.g., "no `any` type", "max 800 lines"). It's purely honor-system.

7. **Work log completeness**: Only 2 entries so far. Will agents actually maintain this, or will it become stale?

8. **Prompt engineering layer**: The current workflow (prompt engineer → user copies to Windsurf → results verified) adds a human in the loop. Is this the right balance of automation vs. quality control?

9. **Cross-role requests**: The protocol exists but hasn't been tested. Will agents actually follow it?

10. **Scalability**: This system was designed for 1 human + multiple AI agents. What happens when we have multiple human developers?

---

## 7. Review Request

**Dear Gemini, please review this multi-agent shared memory system and provide feedback on:**

1. **Architecture**: Is the file structure logical? Are there missing files or redundant ones?

2. **Concurrency model**: Is the advisory lock sufficient? Should we implement something stronger?

3. **Token efficiency**: AGENT-HANDOFF.md is 1303 lines. How can we reduce the token cost while preserving context?

4. **Staleness prevention**: How do we ensure the documents stay current and don't drift?

5. **Security**: What's the right balance between agent accessibility and credential safety?

6. **Scalability**: How would this system need to change for a team of 3-5 human developers?

7. **Automation opportunities**: What parts of the session protocol could be automated (e.g., git hooks, CI checks)?

8. **Prompt engineering workflow**: Is the human-in-the-loop approach optimal, or should we automate more?

9. **Missing patterns**: Are there established patterns from other multi-agent systems that we should adopt?

10. **Overall grade**: On a scale of 1-10, how well does this system solve the multi-agent coordination problem for a solo developer using multiple AI tools?
