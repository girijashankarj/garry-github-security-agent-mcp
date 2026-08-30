# Claude Integration

Claude is an optional reasoning layer. The deterministic security collector and repository safety controls remain usable without Anthropic access.

## Local

```bash
cp .env.example .env
# edit .env and add real credentials locally
npm run audit
```

For Claude Code:

```bash
claude
```

For non-interactive CI-style execution:

```bash
claude -p "Run the security audit workflow. Read the repository skill and baseline report. Follow operator-approved settings. Never merge PRs."
```

Do not put API keys in prompts, command-line history, committed files, reports or logs.

## GitHub Actions

Use GitHub **Secrets** for credentials:

- `ANTHROPIC_API_KEY`
- optionally `SECURITY_AUDIT_GITHUB_TOKEN` when the default `GITHUB_TOKEN` is insufficient

Use GitHub **Variables** for non-sensitive configuration:

- `GITHUB_OWNER`
- `ANTHROPIC_MODEL`
- `SECURITY_AUDIT_MAX_REPO_WORKERS`

The workflow reads secrets through `${{ secrets.NAME }}` and variables through `${{ vars.NAME }}`.

## Batch API

Batch API support should be implemented as an adapter rather than mixed into repository mutation code. A batch request should produce analysis/remediation plans, which are validated by the deterministic worker before changes are made.

```text
Claude Batch
    ↓
analysis / remediation plans
    ↓
validation
    ↓
repository workers (max 10)
    ↓
tests + security recheck
    ↓
commit / PR
```

The adapter must never put API keys into batch payload content.
