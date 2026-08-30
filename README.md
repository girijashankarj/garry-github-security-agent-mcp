# Garry GitHub Security Audit

A community-friendly, agentic GitHub security remediation tool for auditing and safely fixing vulnerabilities across repositories.

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
  │     ├─ PR before/after table?
  │     └─ test policy?
  │
  ├─ 2. Fetch security counts by category
  │
  ├─ 3. Spawn repository agents
  │     └─ max 10 in parallel
  │          ↓ first 10 finish
  │        next 10
  │          ↓
  │        repeat until complete
  │
  ├─ 4. Per repository agent
  │     ├─ inspect alerts/manifests/lockfiles
  │     ├─ identify stable patched versions
  │     ├─ apply minimal security fix
  │     ├─ run post-change verification
  │     └─ commit or create PR
  │
  └─ 5. Re-audit and create after-action report
```

## Agentic design

This project treats AI instructions, repeatable scripts and lifecycle hooks as separate concerns:

```text
Claude / Cursor agent
        │
        ├── Skills → workflow knowledge
        ├── Agents → repository-specific roles
        ├── Hooks → safety + verification gates
        └── Scripts → deterministic execution
                         │
                         ▼
                    GitHub API
```

See `skills/`, `.claude/`, `.cursor/` and `scripts/`.

## Environment setup

Create your local environment from the safe template:

```bash
cp .env.example .env
```

Then replace the mock values in `.env`. **Never commit `.env`**. It is already ignored by `.gitignore`.

`GITHUB_TOKEN` must be a token with the permissions required to read security alerts and, when remediation is enabled, modify/create branches and pull requests in the selected repositories.

## Supported security categories

- Dependabot alerts
- Code scanning / CodeQL alerts
- Secret scanning alerts
- Repository security configuration and coverage where available through the GitHub API

The audit distinguishes **known vulnerabilities** from packages that are merely old. It does not blindly upgrade everything to latest.

## Operator questions

Every interactive run asks:

1. Audit all repositories or selected repositories?
2. Fix directly on the default branch or create a PR?
3. If using PRs, should they be **draft** or **ready for review**?
4. What commit-message format should be used?
5. Should every PR description include a before/after table?
6. Which tests/builds should run after changes?

Defaults are documented in `config/defaults.yaml`.

## Reports

Reports are intentionally stored outside source control:

```text
temp/
└── security-count/
    └── 2026-08-31/
        ├── report-2026-08-31-221530-012.json   # before action
        └── report-2026-08-31-224210-041.json   # after action
```

`temp/` is gitignored. Reports contain repository-level counts, findings, remediation decisions, changes, tests, commits/PRs and unresolved alerts.

## Development

```bash
npm install
npm run build
npm test
npm run audit
```

For local development, run the preflight before an audit:

```bash
node scripts/preflight.mjs
```

After repository changes, the verification script can run the detected npm test/build/lint lifecycle:

```bash
node scripts/post-change-verify.mjs /path/to/repository
```

## Security principles

- Never print or commit GitHub tokens.
- Never modify secrets or security settings without explicit operator approval.
- Prefer the smallest stable patched dependency version that resolves the vulnerability.
- Do not perform major-version migrations solely because a newer version exists.
- Never auto-merge a PR.
- Never dismiss alerts merely to reduce counts.
- Never claim a vulnerability is fixed without post-change verification.
- Capture failures per repository and continue remaining batches.

## License

MIT
