# AI Development Team Mesh Operational Contract v0.7-v0.9

## A. Purpose

This document turns the AI Development Team Mesh from documented roles into an operational process for daily development. It defines the exact inputs, outputs, task packets, reports, n8n manual workflow design, first real task protocol, approval gates, and stop conditions used to coordinate OpenRouter DeepSeek Manager, Windsurf Cascade, Gemini, GitHub Copilot, future GPT-5.5, n8n, GitHub, and Ammar.

The goal is consistent execution: Ammar describes a goal once, DeepSeek Manager converts it into structured work packets, implementation and review agents return comparable reports, and Ammar keeps final approval over code, workflows, PRs, production, and sensitive data.

## B. v0.7 Manager Input Contract

Ammar gives OpenRouter DeepSeek Manager a structured request with these fields:

- `goal`: The outcome Ammar wants.
- `app_area`: The affected area, such as POS, inventory, reports, cloud dashboard, auth, docs, or n8n.
- `user_visible_behavior`: What a real user should see or do.
- `suspected_files`: Known or suspected files, modules, docs, or workflows.
- `risk_level_if_known`: Low, medium, high, or critical if Ammar already knows the risk.
- `constraints`: Requirements that must be followed.
- `forbidden_actions`: Actions agents must not perform.
- `available_agents`: Agents and tools available for this task.
- `desired_output`: What DeepSeek Manager should produce.
- `manual_test_context`: App state, account type, test path, or user scenario Ammar can manually validate.

Example:

```json
{
  "goal": "Plan a manual POS regression test for first-customer readiness",
  "app_area": "POS",
  "user_visible_behavior": "Cashier can open a session, sell items, split payment, print receipt, void a sale, and close session safely",
  "suspected_files": [
    "src/pages/POS.tsx",
    "src-tauri/src/commands/pos.rs",
    "docs/AGENT-HANDOFF.md"
  ],
  "risk_level_if_known": "low because this is planning only",
  "constraints": [
    "no code edits",
    "no workflow activation",
    "no secrets",
    "manual testing only"
  ],
  "forbidden_actions": [
    "do not edit app source",
    "do not modify workflow JSON",
    "do not push or merge"
  ],
  "available_agents": [
    "DeepSeek Manager",
    "Cascade",
    "Gemini",
    "Copilot"
  ],
  "desired_output": "Cascade task packet for producing a manual POS regression test plan",
  "manual_test_context": "Ammar can run the desktop app locally and test as owner/cashier"
}
```

## C. v0.7 Manager Output Contract

DeepSeek Manager must produce a structured output with these fields:

- `task_summary`: A concise description of the requested outcome.
- `risk_classification`: Low, medium, high, or critical, with rationale.
- `selected_agents`: Which agents are needed and why.
- `model_choices`: Which model or tool each selected agent should use.
- `task_packets`: One or more packets using the formats in section D.
- `required_reviews`: Required review agents and review reasons, or `none`.
- `files_likely_involved`: Files or modules likely to be read or edited.
- `commands_allowed`: Safe commands for the task.
- `commands_forbidden`: Commands that must not be run.
- `test_plan`: Checks or manual tests to verify the outcome.
- `merge_gate`: Conditions required before PR merge.
- `human_approval_questions`: Specific questions Ammar must answer before risky actions.

Output skeleton:

```json
{
  "task_summary": "",
  "risk_classification": {
    "level": "low|medium|high|critical",
    "rationale": ""
  },
  "selected_agents": [],
  "model_choices": {},
  "task_packets": [],
  "required_reviews": [],
  "files_likely_involved": [],
  "commands_allowed": [],
  "commands_forbidden": [],
  "test_plan": [],
  "merge_gate": [],
  "human_approval_questions": []
}
```

## D. Agent Task Packet Format

### 1. Cascade Implementation Packet

Use this packet when Cascade should inspect, edit, scaffold, or run local commands.

```json
{
  "agent": "Windsurf Cascade",
  "objective": "",
  "files_allowed": [],
  "files_forbidden": [],
  "commands_allowed": [],
  "checks_to_run": [],
  "expected_report": [
    "what changed",
    "files changed",
    "commands run",
    "checks run",
    "risks",
    "next recommendation"
  ],
  "stop_conditions": []
}
```

### 2. Gemini Architecture Review Packet

Use this packet when architecture, cross-module risk, medical workflow safety, scalability, maintainability, or second-opinion review is required.

```json
{
  "agent": "Gemini Pro / Gemini 3.x",
  "architecture_question": "",
  "context": "",
  "files_or_modules": [],
  "risks_to_inspect": [],
  "expected_markdown_sections": [
    "summary",
    "architecture impact",
    "medical workflow safety",
    "cross-module risks",
    "testing gaps",
    "recommendation"
  ],
  "rules": [
    "no edits",
    "no commits",
    "no secrets",
    "review only"
  ]
}
```

### 3. Copilot Support Packet

Use this packet for narrow inline coding help, small refactors, tests, or PR/code assistance.

```json
{
  "agent": "GitHub Copilot Pro",
  "narrow_code_assist_task": "",
  "function_or_file_scope": [],
  "rules": [
    "no project management",
    "no final review",
    "stay within scope"
  ],
  "expected_output": ""
}
```

### 4. Future GPT-5.5 Strategy Packet

Use this packet only if GPT-5.5 Pro is explicitly enabled later for complex planning or process design.

```json
{
  "agent": "Future GPT-5.5 Pro",
  "planning_question": "",
  "constraints": [],
  "expected_plan": [],
  "rules": [
    "no direct repo change unless approved",
    "no secrets",
    "strategy only unless explicitly enabled"
  ]
}
```

## E. Agent Report Contract

Every agent must report:

- What was done.
- Files changed.
- Commands run.
- Tests or checks run.
- Risks found.
- Blockers.
- Next recommendation.
- Whether human approval is needed.

Report skeleton:

```json
{
  "agent": "",
  "what_was_done": "",
  "files_changed": [],
  "commands_run": [],
  "tests_or_checks_run": [],
  "risks_found": [],
  "blockers": [],
  "next_recommendation": "",
  "human_approval_needed": true
}
```

## F. v0.8 Manual n8n Manager Workflow Design

Workflow name:

`TAJ Agent Mesh - Manager Router v0.8`

Nodes:

1. Manual Trigger.
2. Set Manager Input.
3. DeepSeek Manager Review.
4. Build Agent Task Packets.
5. Output Manual Instructions.

Rules:

- Workflow stays inactive and unpublished.
- Manual only.
- No GitHub trigger.
- No PR comment.
- No auto-edit.
- No auto-merge.
- No credentials in workflow JSON.
- OpenRouter credential is stored only in n8n as `OpenRouter API`.
- Browser n8n is the manual testing surface.
- Do not use n8n-as-code sync or import over existing workflows.

Expected DeepSeek Manager output:

- Selected agents.
- Prompts for Cascade, Gemini, and Copilot.
- Risk gate.
- Test checklist.
- Next human decision.

This section is a design contract only. It does not create, import, activate, publish, or modify any n8n workflow.

## G. v0.9 First Real Task Run Protocol

Recommended first real task:

`Manual POS Regression Planning`

Reason:

- Validates the process without code edits.
- Directly supports late-alpha readiness.
- Low implementation risk.
- Tests the team handoff loop.

Steps:

1. Ammar gives the goal to DeepSeek Manager.
2. Manager classifies risk.
3. Manager generates a Cascade test-planning prompt.
4. Cascade inspects POS docs/code and returns a manual test plan.
5. Ammar runs the app as a user.
6. Results are recorded.
7. Manager decides the next task.

## H. Human Approval Gates

These actions require Ammar approval:

- Code edit.
- Database migration.
- Workflow publish or activation.
- GitHub push.
- PR merge.
- Production or deployment action.
- Use of secrets or API keys.
- Patient or live data use.

## I. Stop Conditions

Agents must stop if:

- Secrets are requested or exposed.
- `.env`, `.db`, or `.sqlite` appears in the diff.
- A workflow becomes active or published unexpectedly.
- Git is dirty with unrelated files.
- The task conflicts with `AGENTS.md` or the operating model.
- Model output instructs an unsafe action.
- App source change is outside approved scope.

## J. Example End-to-End Run

Ammar asks:

> Plan POS regression test.

DeepSeek Manager outputs:

```json
{
  "task_summary": "Create a manual POS regression test plan without code edits",
  "risk_classification": {
    "level": "low",
    "rationale": "Planning-only task; no app source, database, workflow, or production changes"
  },
  "selected_agents": [
    "Windsurf Cascade"
  ],
  "model_choices": {
    "Windsurf Cascade": "Sonnet 4.6"
  },
  "task_packets": [
    {
      "agent": "Windsurf Cascade",
      "objective": "Inspect POS docs/code and produce a manual regression checklist for cashier workflows",
      "files_allowed": [
        "docs/AGENT-HANDOFF.md",
        "src/pages/POS.tsx",
        "src/pages/pos/",
        "src-tauri/src/commands/pos.rs"
      ],
      "files_forbidden": [
        ".env",
        "workflow JSON",
        "database files"
      ],
      "commands_allowed": [
        "git status",
        "rg",
        "Get-Content"
      ],
      "checks_to_run": [
        "no file edits",
        "manual plan covers open session, sale, split payment, receipt, void, close session"
      ],
      "expected_report": [
        "manual POS regression plan",
        "risks",
        "recommended next task"
      ],
      "stop_conditions": [
        "source edit needed",
        "secret encountered",
        "unrelated dirty files"
      ]
    }
  ],
  "required_reviews": [],
  "files_likely_involved": [
    "docs/AGENT-HANDOFF.md",
    "src/pages/POS.tsx",
    "src-tauri/src/commands/pos.rs"
  ],
  "commands_allowed": [
    "git status",
    "rg",
    "Get-Content"
  ],
  "commands_forbidden": [
    "git push",
    "n8n workflow activate",
    "n8nac sync/import/push",
    "database mutation commands"
  ],
  "test_plan": [
    "Ammar runs the app manually using the returned checklist"
  ],
  "merge_gate": [
    "No code changes",
    "Only docs/report changes if Ammar asks to save the plan"
  ],
  "human_approval_questions": [
    "Should the resulting POS regression checklist be committed as documentation?"
  ]
}
```
