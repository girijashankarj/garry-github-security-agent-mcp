# Security Audit Skill

Use this skill for repository-wide GitHub security auditing and remediation.

## Scripts

Prefer deterministic scripts for API calls, repository selection, batching, report generation, test execution and Git operations. Use Claude for analysis and decisions, not for replacing deterministic checks.

Recommended script responsibilities:

- `scripts/audit-security.mjs`: collect baseline counts and findings.
- `scripts/remediate-repo.mjs`: apply an approved remediation plan.
- `scripts/verify-repo.mjs`: run tests/build/lint and collect results.
- `scripts/finalize-report.mjs`: collect post-change security state.

## Agent workflow

1. Ask operator preflight questions.
2. Run baseline audit.
3. Persist before report before any mutation.
4. Partition repositories into batches of 10.
5. Spawn one repository agent per repository.
6. Use deterministic scripts for repository operations.
7. Use Claude to inspect compatibility and recommend a safe remediation when needed.
8. Run post-change verification hooks.
9. Create commit or PR according to operator choice.
10. Re-audit and write the final report.

## Claude Code modes

Interactive:

```bash
claude
```

Non-interactive CI:

```bash
claude -p "Run the security audit workflow defined by this repository. Follow the operator-approved configuration and do not merge PRs."
```

For unattended execution, all destructive actions must remain constrained by the configured approval policy.
