# Security Audit Skill

Follow the same execution contract as `.claude/`.

- Preflight environment and operator choices before mutations.
- Persist a before-action report first.
- Maximum 10 repository workers.
- Use one worker per repository.
- Use GitHub's first patched dependency version.
- Run post-change tests/build/lint.
- Verify security state after changes.
- Produce the after-action report.
- Never auto-merge.

Use scripts under `scripts/` for repeatable checks instead of embedding long shell commands in agent instructions.
