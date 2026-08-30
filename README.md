# Garry GitHub Security Audit

A community-friendly security remediation agent for GitHub repositories.

## What it does

The agent creates a **before-action audit report**, asks the operator a small set of questions, then audits repositories in batches of **10 parallel workers**. Each repository is handled independently so one failure does not stop the whole run.

### Workflow

```text
START
  │
  ├─ 0. Create before-action report
  │     temp/security-count/<date>/report-<date>-<time>-<sec>.json
  │
  ├─ 1. Ask operator questions
  │     ├─ all repos or selected repos?
  │     ├─ direct default branch or PR?
  │     ├─ draft PR or ready PR?
  │     ├─ commit message format?
  │     ├─ PR description format?
  │     └─ test policy?
  │
  ├─ 2. Fetch security counts by category
  │
  ├─ 3. Spawn repository workers
  │     └─ max 10 in parallel
  │          ↓ first 10 finish
  │        next batch of 10
  │          ↓
  │        repeat until complete
  │
  ├─ 4. Per repository
  │     ├─ inspect alerts
  │     ├─ identify stable patched versions
  │     ├─ apply safe fix
  │     ├─ run detected test/build suite
  │     └─ commit or create PR
  │
  └─ 5. Create after-action report
        temp/security-count/<date>/report-<date>-<time>-<sec>.json
```

## Supported security categories

The architecture is designed for GitHub security data including:

- Dependabot alerts
- Code scanning / CodeQL alerts
- Secret scanning alerts
- Repository security configuration and coverage

The audit distinguishes **known vulnerabilities** from packages that are merely old. It does not blindly upgrade everything to latest.

## Operator questions

Every run asks:

1. Audit all repositories or selected repositories?
2. Fix directly on the default branch or create a PR?
3. If using PRs, should they be **draft** or **ready for review**?
4. What commit-message format should be used?
5. Should every PR description include a before/after table?
6. Which tests/builds should run after changes?

Defaults are documented in `config/defaults.yaml` and can be overridden by the operator.

## Reports

Reports are intentionally stored outside source control:

```text
temp/
└── security-count/
    └── 2026-08-31/
        ├── report-2026-08-31-221530-12.json   # before action
        └── report-2026-08-31-224210-41.json   # after action
```

`temp/` is gitignored. Reports contain repository-level counts, findings, actions, commits/PRs, test results and failures.

## Claude / Cursor support

This repository includes AI-agent configuration under `.claude/` and `.cursor/` so the project can be used from Claude Code, Cursor, or a normal terminal workflow.

Agent instructions are deliberately provider-neutral. The source of truth is `docs/ARCHITECTURE.md` and `config/defaults.yaml`.

## Security principles

- Never print or commit GitHub tokens.
- Never modify secrets or security settings without explicit operator approval.
- Prefer the smallest stable patched dependency version that resolves the alert.
- Do not perform major-version migrations solely because a newer version exists.
- Never merge a PR automatically.
- Never claim a vulnerability is fixed unless post-change security data confirms it.
- Capture failures per repository and continue the batch.

## Development

```bash
npm install
npm run build
npm test
npm run audit
```

See `docs/` for architecture, security policy, agent workflow and report schema.

## License

MIT
