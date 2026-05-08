# AI Agent Mesh v0

## Purpose

This scaffold creates a safe local-first AI Agent Mesh for TAJ Pharmacy v4. Version 0 classifies changes, routes review work to the right model, and writes review-only output. It does not auto-edit, auto-commit, auto-merge, or deploy.

## v0.5 Operating Model

The unified AI Development Team Mesh operating model is defined in `docs/ai-agent-mesh-operating-model.md`. That document is the detailed team model for the current v0.5 phase.

This v0 document remains the manual n8n and review-runbook scaffold. If this file conflicts with the operating model, use `AGENTS.md`, `.ai/MODEL_ROUTER.yaml`, `.ai/MEMORY.md`, and `docs/ai-agent-mesh-operating-model.md` in that order.

## v0.6 Docs-Only PR Gate

Docs-only PR gate added to reduce AI credit usage. Docs-only and rule-only PRs that pass deterministic local checks do not need OpenRouter, Gemini, GPT-5.5, or Copilot review.

## v0.7-v0.9 Operational Mesh Contract

The operational contract is defined in `docs/ai-agent-mesh-operational-contract.md`. It covers the manager input/output contract, manual n8n manager workflow design, and first real task run protocol for making the AI Development Team Mesh operational.

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

Valid OpenRouter DeepSeek model IDs:

- `deepseek/deepseek-v4-pro` for review quality
- `deepseek/deepseek-v4-flash` for faster or cheaper review

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

## GitHub Manual Setup

GitHub trigger and PR commenting are v1 features. They are not active in the v0 workflow. Keep GitHub trigger/comment nodes absent or disabled until manual approval.

Manual setup steps:

1. Create a GitHub fine-grained personal access token manually.
2. Restrict repository access to only this repo.
3. Grant only the future permissions needed:
   - Contents: read
   - Pull requests: read/write
   - Issues: read/write
   - Metadata: read
4. In n8n, open Credentials.
5. Create a credential named exactly `GitHub API`.
6. Store the token only inside the n8n credential.
7. Save the credential in n8n only.

Do not store the GitHub token in repo files, workflow JSON, `.ai/`, `.env`, docs, screenshots, reports, or Git history. Do not enable GitHub triggers, PR comments, workflow publishing, or workflow activation until a human explicitly approves the next step.

## v0.1 OpenRouter Review Test Plan

This is a local-only manual test. Keep the workflow unpublished and inactive.

Manual test steps:

1. Keep the GitHub trigger disabled or absent.
2. Temporarily enable only the `OpenRouter Review Placeholder` node for manual testing.
3. Keep the `Gemini Architecture Review Placeholder` node disabled.
4. Use the existing fake payload in `Set Example GitHub Payload`.
5. Execute the workflow manually from n8n.
6. Confirm OpenRouter returns a concise markdown review.
7. Disable the OpenRouter node again after the test.

Safety limits:

- Do not commit API keys.
- Do not include real diffs yet.
- Do not allow auto-edit.
- Do not publish or activate the workflow.
- Do not enable GitHub trigger or comment nodes.

## v0.2 Manual n8n Review Workflow

This section documents the safe manual testing process for the n8n review workflow.

### Core Rules

- Do not use n8n-as-code sync for testing.
- Do not import over an existing workflow.
- If a workflow becomes duplicated/messy, archive it and recreate/import clean.
- Browser n8n is the manual testing surface.
- Local JSON is backup/documentation.
- Main workflow stays inactive/unpublished.
- External API nodes stay disabled by default.
- No auto-edit and no auto-commit.

### Manual Review Steps

To run a review manually:

1. Open **TAJ Agent Mesh - Commit QA v0** in n8n.
2. Confirm there is only one node chain (no duplicates).
3. Re-select **OpenRouter API** credential in the node if needed (credential shows placeholder ID in JSON).
4. Enable only **OpenRouter Review Placeholder** node (keep Gemini disabled).
5. Execute the workflow manually with the fake payload.
6. Confirm `choices[0].message.content` exists in the response.
7. Disable **OpenRouter Review Placeholder** node again after testing.

### Version Boundaries

- **Gemini** remains disabled until v0.3.
- **GitHub trigger** remains absent/disabled until v1.
- **Auto-edit** and **auto-commit** are never enabled in v0.x.

## Troubleshooting

### Credentials not found
**Symptom:** OpenRouter node fails with credential error.
**Fix:** Manually re-select the **OpenRouter API** credential in the node dropdown. The JSON stores a placeholder ID that n8n may not resolve until manually re-selected.

### Duplicate nodes
**Symptom:** Workflow shows multiple node chains or broken connections.
**Fix:** Archive the browser workflow (rename to "ARCHIVED-..."), then import clean from `workflows/taj-agent-mesh-commit-qa-v0.json`. Do not sync or import over the existing messy workflow.

### Invalid model ID
**Symptom:** OpenRouter returns model not found error.
**Fix:** Use `deepseek/deepseek-v4-pro` (for quality) or `deepseek/deepseek-v4-flash` (for speed). Check OpenRouter documentation for current valid model IDs.

### Workflow accidentally published
**Symptom:** Workflow shows as active/published in n8n.
**Fix:** Unpublish/deactivate immediately. v0 workflows must stay inactive. Check the workflow settings and set `active: false`.

## v0.3 Gemini Architecture Review Smoke Test

This section documents the safe manual test for Gemini architecture review capability.

### Purpose

Test Gemini Ultra for architecture impact review only — no file editing, no patch generation, no commits, no GitHub calls.

### Safety Rules

- Use a **tiny standalone manual n8n workflow** first.
- Do not modify the main **TAJ Agent Mesh** workflow yet.
- Do not publish or activate the test workflow.
- Do not use n8n-as-code sync.
- Do not import over an existing workflow.
- Gemini must not edit files, generate patches, commit, or call GitHub.

### Manual Test Setup

1. In n8n, create a new workflow (do not import over existing).
2. Add a **Manual Trigger** node.
3. Add a **Set** node with this fake payload:
   ```json
   {
     "project": "TAJ Pharmacy v4",
     "change": "FEFO stock policy design review",
     "files": ["inventory.rs", "stock_batches.sql", "POS.tsx"],
     "question": "Identify architecture impact, risks, and required guardrails"
   }
   ```
4. Add an **HTTP Request** node:
   - Method: POST
   - URL: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`
   - Note: `gemini-2.5-flash` tested and working. `gemini-1.5-flash` may be unavailable. `gemini-3.5-flash-preview` may return 503 (high demand). Verify availability with `GET /v1beta/models` if needed.
   - Credential: Select existing **Gemini API** credential
   - Body:
     ```json
     {
       "contents": [{
         "parts": [{
           "text": "Architecture review: {{ $json.project }}\nChange: {{ $json.change }}\nFiles: {{ $json.files.join(', ') }}\n\n{{ $json.question }}"
         }]
       }]
     }
     ```
5. Keep the workflow **inactive/unpublished**.

### Execution Steps

1. Open the standalone test workflow.
2. Confirm only one node chain exists.
3. Re-select **Gemini API** credential if needed.
4. Execute manually.
5. Confirm response contains `candidates[0].content.parts[0].text`.
6. Verify output is a markdown architecture review (not code patches).
7. Document result in `.ai/reports/gemini-smoke-test-v0-3.md`.

### Expected Output

Markdown architecture review covering:
- Cross-system impact (desktop + cloud + sync)
- Database migration risks
- API contract changes
- Testing gaps
- Rollback considerations

### Success Criteria

- Gemini responds without errors.
- Response is review-only (no code generation).
- No file modifications triggered.
- Credential stays in n8n only.

### Troubleshooting

#### Gemini credential error
**Symptom:** 401/403 authentication error.
**Fix:** Reselect **Gemini API** credential manually in the node.

#### 400 bad request / 503 unavailable
**Symptom:** Malformed request or model unavailable/high demand.
**Fix:** Check URL format and body JSON structure. Verify model name. Working model: `gemini-2.5-flash`. `gemini-3.5-flash-preview` or `gemini-3.0-pro` can be tested later for higher-quality architecture review. Use `GET /v1beta/models` to check availability.

#### No output
**Symptom:** Empty response or no visible result.
**Fix:** Check response path — confirmed working output: `candidates[0].content.parts[0].text`.

#### Workflow messy/duplicated
**Symptom:** Multiple node chains or broken workflow.
**Fix:** Archive and recreate. Never sync or import over an existing workflow.

## v0.4 Manual Review Runbook

This runbook defines the manual review checklist to use before high-risk code changes. It keeps AI Agent Mesh work review-only and keeps local n8n workflows inactive.

### A. Daily Start

1. `git checkout master`
2. `git pull origin master`
3. Confirm `git status` is clean.
4. Confirm no `.env`, `.db`, or `.sqlite` files are tracked.
5. Confirm local n8n is reachable at `http://localhost:5678`.
6. Do not publish or activate any n8n workflow.

### B. Before Coding

1. Classify the task as low, medium, or high risk.
2. Low risk: UI copy, docs, or simple tests can use Sonnet only.
3. Medium risk: app logic, state, and notifications require Sonnet plus the manual checklist.
4. High risk: Rust, SQL, inventory, prescription, payment, auth, and sync changes require DeepSeek/OpenRouter review.
5. Architecture-impacting changes require Gemini review.

### C. Model Routing

- Sonnet 4.6: primary coding and planning in Windsurf.
- OpenRouter DeepSeek `deepseek/deepseek-v4-pro`: Rust, SQL, and pharmacy logic review.
- Gemini `gemini-2.5-flash`: architecture impact review smoke and fast review.
- GPT-5.5: orchestration, prompts, and GitHub/process support when credits are available.

### D. Manual n8n Review Steps

1. Open n8n locally.
2. Use only manual test/review workflows.
3. Confirm exactly one node chain exists.
4. Re-select credentials if needed.
5. Run OpenRouter review for high-risk logic changes.
6. Run Gemini review for architecture impact.
7. Copy the review output into PR notes manually.
8. Disable or revert any temporary node enablement.
9. Never publish or activate the workflow.

### E. Merge Gate Checklist

Before merging any high-risk PR:

- `git status` is clean.
- No `.env`, `.db`, or `.sqlite` files are tracked.
- Tests/build pass, or failure is documented.
- OpenRouter review is completed if Rust, SQL, or pharmacy logic was touched.
- Gemini review is completed if architecture was affected.
- No API keys or secrets appear in the diff.
- No n8n workflow is published or activated.
- A human approves the final merge.

### F. Failure Handling

- Credentials not found: re-select the credential manually.
- Duplicate n8n nodes: archive the workflow, recreate it clean, and do not sync or import over it.
- Model unavailable: list available models or use the documented fallback.
- Git dirty with generated n8n files: restore unrelated files before committing.
- Secret exposure: stop, scrub history, and rotate secrets.

### G. Daily End

1. Commit or discard all intentional changes.
2. Leave `master` or the active feature branch clean.
3. Do not leave workflows active.
4. Record what was tested and what remains.

## Model Routing

Routing is defined in `.ai/MODEL_ROUTER.yaml`.

- OpenRouter DeepSeek v4: head architect / manager agent, task router, prompt writer, reviewer, and merge recommender.
- Windsurf Cascade: focused implementation and workflow scaffold.
- GitHub Copilot: tests and small inline edits.
- Gemini Pro / Gemini 3.x: architecture impact, large-context review, and medical workflow safety review.
- GPT-5.5 Pro: future strategy and orchestration agent if explicitly enabled.

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
