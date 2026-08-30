# Security Policy

This tool can modify repositories, so safety is a first-class requirement.

## Credentials

Use environment variables, GitHub CLI authentication, or another secure credential provider. Never store tokens in configuration, reports, logs or source files.

## Dependency remediation

A newer package is not automatically a security fix. The agent should select the smallest stable patched version that resolves the alert and preserve compatibility where practical.

## Repository changes

The operator explicitly chooses direct default-branch changes or PRs. PRs are draft by default. Auto-merge is disabled by policy.

## Verification

A successful commit is not proof that a vulnerability is fixed. The agent should re-check available security data after the change and record unresolved alerts.

## Scope

The agent audits only repositories selected by the operator and accessible through the authenticated GitHub identity. It must not attempt privilege escalation or modify repositories outside the selected scope.
