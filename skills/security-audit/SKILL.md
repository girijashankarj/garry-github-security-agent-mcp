# Security Audit Skill

Use this skill when operating the GitHub security audit project.

## Contract

1. Read `.claude/CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/WORKFLOW.md` and `config/defaults.yaml`.
2. Run `scripts/preflight.mjs` before any mutation.
3. Create the before-action report before modifying repositories.
4. Ask the operator the configured questions if choices are not supplied.
5. Process repositories in batches with a hard maximum of 10 active workers.
6. Use the repository worker for one repository only.
7. Run the post-change verification script after remediation.
8. Create the after-action report.
9. Never merge PRs automatically.

## Safe dependency policy

Use GitHub's first patched version when available. Do not invent a version from a CVE description. Avoid unrelated dependency upgrades.

## Failure handling

A worker failure is a repository-level result, not a run-level failure. Continue the current batch and then the next batch.
