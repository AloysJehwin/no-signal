# Contributing

## Branch Naming

- `feat/<short-description>` — new feature or capability
- `fix/<short-description>` — bug fix
- `docs/<short-description>` — docs / comments / README changes
- Optional trailing issue number: `feat/handoff-report-schema-#42`

## PR Flow

1. Branch off `main` — **never commit to `main` directly**
2. Keep PRs focused; separate refactors from behavior changes
3. Green CI required before merge (see `.github/workflows/ci.yml`):
   - `cloud-tests` — pytest under `cloud/tests`
   - `fault-tree-validate` — JSON Schema check on every `fault_trees/*.json`
   - `mobile-lint` — eslint + `tsc --noEmit`
4. Merge with **squash and merge** — PR title becomes the commit
5. Delete the branch after merge

## Adding a Fault Tree

1. New file in `fault_trees/`, name = `fault_id.json` (snake_case)
2. `equipment_type` must be one of the enum values in `fault_trees/schema.json`
3. Run `python scripts/seed_local_rag.py` locally to confirm validation + emit the payload
4. CI re-validates on every push — a failing schema check blocks the PR
5. Mention any new fault_id in the PR description so reviewers can smoke-test it

## Style

| Area | Rule | Enforcement |
|---|---|---|
| React Native / TS | ESLint + Prettier defaults from RN 0.75 template | `npm run lint` |
| Python | `ruff` (formatter + linter) — 4-space indent, line length 100 | `ruff check .` (add to CI as you land it) |
| Commits | Conventional Commits: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:` | PR review |
| Files | Under 500 lines; if you're approaching that, split before merging | PR review |

Examples of good commit messages:
- `feat(mobile): add DEFER trigger on 3 failed hypotheses`
- `fix(cloud): validation agent must return None on source contradiction`
- `docs: clarify airplane-mode fallback in DEMO.md`

## Never

- Commit secrets, `.env`, API keys, or model weights
- Push directly to `main` — the branch is protected; open a PR
- Skip CI locally when you know the change touches schema or the reasoning loop
- Rewrite `docs/ARCHITECTURE.md` — it is the single source of truth; propose changes in a PR with rationale

## Getting Help

- Setup issues → `docs/DEVELOPMENT.md`
- Demo runbook → `docs/DEMO.md`
- Cloud pipeline → `docs/AGENT_PIPELINE.md`
- Native Gemma bridge → `docs/NATIVE_BRIDGE.md`
