# Jeremy's fork runbook (insecurejezza/actual)

This fork carries Jeremy's personal UI features for the Actual instance on his Umbrel. Design agreed 2026-08-14 (memory: `actual-budget-fork-workflow`). Jeremy's interface is two commands — **"add a feature that does X"** and **"update Actual"** — everything below is the agent's job, never his.

Upstream's own agent docs still apply to all code work: `AGENTS.md` (conventions, commands, testing) and `.github/agents/pr-and-commit-rules.md` (commit messages and PR titles must be prefixed `[AI]`; never skip hooks). This file only adds the fork-specific workflow.

## Ground rules

- **GitHub (`insecurejezza/actual`) is the source of truth.** The local clone at `~/Development/active/actual` is disposable — push every branch you touched at the end of every session, no exceptions. Re-clone with `gh repo clone insecurejezza/actual ~/Development/active/actual`.
- **Upstream-aspiring discipline.** Every feature is written as if it were a PR to upstream: their code style, minimal diff surface, behind an experimental feature flag, with loot-core unit tests where logic changes.
- **Never modify upstream-tracked files on `master`.** This runbook lives in its own file, in a single meta commit on top of upstream master, precisely so it can never conflict. Feature branches are cut from release tags and stay PR-clean — this file is not merged into them; read it from a feature branch via `git show master:FORK-RUNBOOK.md`.
- Keep it simple. No custom Docker images, no CI, no scheduled automation. Anything that adds chore for Jeremy is wrong.

## Branch model

- `master` — upstream master + the meta commit adding this file. Rebase onto upstream/master occasionally; it never conflicts.
- `feature/<name>` — one branch per feature, cut from the **upstream release tag** currently deployed (e.g. `v26.8.1`). Each feature adds its own experimental flag.
- `build/<tag>` — disposable assembly branch: release tag + all feature branches merged. Regenerated per release/deploy, force-pushed, never treated as history.

## Feature flags (3-file pattern, per upstream docs)

1. Add the flag name to the `FeatureFlag` union in `packages/loot-core/src/types/prefs.ts`.
2. Add its default (`false`) to `DEFAULT_FEATURE_FLAG_STATE` in `packages/desktop-client/src/hooks/useFeatureFlag.ts`.
3. Add a `<FeatureToggle flag="...">` in `packages/desktop-client/src/components/settings/Experimental.tsx`.

Gate ALL feature behavior behind `useFeatureFlag('<flag>')` so a disabled flag = stock Actual.

## Dev loop (Mac)

- Node ≥ 22 (`.nvmrc` pins the version), Yarn 4 via corepack. All yarn commands from repo root (see upstream AGENTS.md).
- `yarn install`, then `yarn start` for the browser dev server; test against a **copy** of the real budget file, never the live one.
- Before calling a feature done: `yarn typecheck`, `yarn lint:fix`, relevant loot-core tests.

## Deploy to the Umbrel

**Status: server-side not yet migrated.** Actual currently runs as the Umbrel app-store app (Tailscale Serve 8443 → 5006). The agreed target — not yet built — is a Dockge stack at `/opt/stacks/actual/` running the **stock** `actualbudget/actual-server` image pinned to a release tag, with `ACTUAL_WEB_ROOT` pointing at a bind-mounted folder holding our compiled web bundle. Do not deploy custom bundles until that migration is done (it includes data migration off the app-store app and nightly backups). Umbrel neighbors that must not be touched: Pi-hole on 8082, Buzz relay on 3010/8444, Dockge on 5005.

Once the stack exists, a deploy is:

1. Assemble `build/<tag>` = release tag + feature branches. **The web bundle and the server image must come from the same release tag** — client-side loot-core migrates the budget file format, so a mismatched pair is the dangerous failure mode.
2. Build the web bundle (`packages/desktop-client`, aka `@actual-app/web`); use the translations skip option if the translations clone is a problem.
3. Smoke-test the build locally against a throwaway copy of the budget file (agent does this with browser tools — budget screen renders, transactions load, each custom flag toggles on and works).
4. Back up the sync-server data dir on the Umbrel (mandatory, scripted, pre-deploy).
5. rsync the bundle to the Umbrel web-root folder; verify at the production URL.
6. **Rollback** = restore the pre-deploy backup + unset `ACTUAL_WEB_ROOT` (falls back to the image's stock UI).

## Agent skills

_(This block would normally live in `CLAUDE.md`/`AGENTS.md`, but those are upstream-tracked; the runbook is the fork-owned equivalent.)_

### Issue tracker

Issues and specs live as GitHub Issues on `insecurejezza/actual` (via `gh`). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.

## "Update Actual" (manual trigger only)

1. `git fetch upstream --tags`; identify the new release tag.
2. Rebase each `feature/*` branch onto the new tag, one at a time — each feature's own tests passing is the proof it survived. A feature that conflicts badly can be skipped (deploy the rest, fix it later).
3. Assemble the new build branch, then follow the deploy runbook, bumping the server image tag to the same release in the same deploy.
4. Push all rebased branches.
