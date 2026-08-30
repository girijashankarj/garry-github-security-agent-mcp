# Future Plan

This roadmap describes the planned evolution of the GitHub Security Agent MCP project.

## AI-assisted security evaluation pipeline

The next phase is to extend the existing deterministic security workflow with a structured AI analysis and evaluation layer.

```text
Security finding
      ↓
LLM analysis
      ↓
Remediation plan
      ↓
Deterministic execution
      ↓
Verification
      ↓
LLM-as-Judge / evaluation
      ↓
Quality + safety score
```

### Planned capabilities

- **LLM analysis**: Interpret security findings and provide contextual analysis.
- **Remediation planning**: Generate a structured, reviewable remediation plan before changes are executed.
- **Deterministic execution**: Keep repository mutations in the existing controlled execution layer rather than allowing the LLM to directly modify repositories.
- **Verification**: Run tests, builds, linting and security re-checks after remediation.
- **LLM-as-Judge / evaluation**: Evaluate the quality, correctness and safety of the analysis and remediation outcome against defined criteria.
- **Quality + safety score**: Produce a structured score that captures remediation quality, verification evidence and safety characteristics.

## Design principle

AI reasoning should remain separated from deterministic execution and verification. The LLM can analyse, recommend and evaluate, while controlled tooling remains responsible for repository changes and objective checks.

This roadmap is intentionally incremental. Each stage should preserve the project's existing fail-closed mutation model, auditable reports and verification-first approach.

## Status

**Planned**. The capabilities described here are future work and are not represented as fully implemented functionality in the current release.
