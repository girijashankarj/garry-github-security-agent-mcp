# Security Guide

This project is a privileged security automation and agentic AI tool. It can read GitHub security findings and, when explicitly enabled, modify repositories, push branches and create pull requests. Treat every deployment as a security-sensitive system.

## Security boundary

The safest operating model is:

```text
Read findings → plan → review → create PR → verify → re-audit
```

Direct default-branch mutation and unattended MCP mutation should only be enabled when explicitly approved by the repository owner or organisation.

## Assets to protect

- GitHub access tokens and authentication credentials
- Anthropic API keys
- Private source code and repository metadata
- Dependabot, code-scanning and secret-scanning findings
- Audit reports and CI artifacts
- Pull request contents
- Local `.env` files
- MCP endpoints and client credentials

Security reports can reveal vulnerability details and should be treated as confidential where appropriate.

## Threat model

| Risk | Example | Mitigation |
|---|---|---|
| Credential leakage | Token printed in a log | Environment variables/Secrets, never log credentials |
| Excessive permissions | Token can modify unrelated repositories | Least privilege + explicit repository scope |
| Prompt injection | Repository README tells agent to reveal secrets | Treat repository content as untrusted input |
| AI hallucination | Model invents a patched package version | GitHub advisory data + deterministic validation |
| Malicious dependency | `npm install` executes compromised lifecycle code | Review changes, trusted registries, isolated runners |
| Supply-chain attack | Compromised action/package/MCP dependency | Pin and review dependencies/actions |
| Unintended mutation | Agent changes too many repositories | Explicit scope + max 10 workers + fail-closed controls |
| MCP abuse | Remote client invokes mutation | Authentication + HTTPS + mutation disabled by default |
| Test bypass | Fix committed without validation | Post-change verification + failed-run handling |
| False remediation | Alert disappears but vulnerability remains | GitHub security re-audit |
| Report tampering | Evidence changed after execution | Controlled CI artifacts/storage |
| Resource exhaustion | Huge repo set or expensive tests | Worker ceiling + command timeouts + batches |

## GitHub permissions

Use the **least privilege** required for the selected mode.

Read-only auditing should use read access wherever possible. Remediation needs additional permissions to create branches, push commits and/or create pull requests. Do not grant organisation administration privileges simply because the tool can perform remediation.

For GitHub Actions, prefer the built-in `GITHUB_TOKEN` with narrowly scoped workflow permissions. Use `SECURITY_AUDIT_GITHUB_TOKEN` only when the default token cannot perform the required operation.

Review permissions before enabling direct writes to a default branch.

## Claude and AI agent security

Claude is an optional reasoning layer. Model output is **untrusted analysis**, not an authorization mechanism.

Never put GitHub tokens, API keys, private keys or unrelated secrets into prompts.

Repository files, manifests, lockfiles, issues, PR descriptions and dependency metadata are untrusted input. They may contain prompt injection such as instructions to disable security controls, print environment variables, upload source code or modify unrelated files.

The agent must not follow such instructions merely because they appear in repository content. Skills, operator configuration and deterministic execution policies remain authoritative.

## Claude Batch API

Batch processing must remain an analysis/planning layer:

```text
Repository data
      ↓
Claude Batch analysis
      ↓
Untrusted remediation plan
      ↓
Deterministic validation
      ↓
Explicit execution policy
      ↓
Repository mutation
```

Never allow a model-generated batch response to directly execute shell commands or Git operations.

## MCP security

MCP becomes a privileged interface when mutation tools are enabled.

### Safe defaults

- Prefer local stdio for local usage.
- Bind local HTTP to `127.0.0.1`.
- Keep `MCP_ALLOW_MUTATIONS=false` by default.
- Use discovery and planning before mutation.
- Require explicit `execute=true` for mutation.
- Prefer PR mode over direct branch writes.
- Never auto-merge.
- Never expose tokens or environment variables through tools.

### Remote MCP

For Streamable HTTP deployments:

1. Use HTTPS/TLS.
2. Require authentication and authorization.
3. Restrict network access.
4. Apply rate limits.
5. Log security actions without secrets.
6. Consider separate read-only and mutation deployments.
7. Keep mutation disabled unless the deployment is explicitly trusted.

**Never expose an unauthenticated mutation-enabled MCP server to the public internet.**

## Dependency remediation security

The project intentionally avoids blindly upgrading dependencies to `latest`.

Preferred decision order:

1. Identify the actual advisory.
2. Use GitHub's patched-version information where available.
3. Inspect manifests and lockfiles.
4. Select the smallest compatible patched version.
5. Avoid unrelated dependency churn.
6. Review package-manager behaviour and lifecycle scripts.
7. Run tests/build/lint.
8. Re-check GitHub security state.

A green test suite does **not** prove that a vulnerability is fixed.

## Script execution

Deterministic scripts are the execution boundary. They should:

- Use `spawn`/`execFile`, not shell interpolation.
- Validate repository names and branches.
- Apply execution timeouts.
- Never print environment variables.
- Use isolated temporary workspaces.
- Clean temporary workspaces.
- Fail closed when safety prerequisites are missing.
- Return structured results.

Never convert model-generated text directly into a shell command.

## Hooks and lifecycle

The intended lifecycle is:

```text
BEFORE report
     ↓
pre-change safety gate
     ↓
approved remediation
     ↓
post-change tests
     ↓
security re-audit
     ↓
AFTER report
```

The before report must exist before mutation. If a baseline cannot be established, remediation should stop.

## CI security

GitHub Actions workflows should:

- Use minimal `permissions`.
- Store credentials in GitHub **Secrets**, never Variables.
- Avoid printing commands containing credentials.
- Never upload `.env` files.
- Review and pin third-party actions according to organisational policy.
- Carefully restrict workflows triggered by untrusted fork pull requests.
- Require appropriate review for workflows capable of repository mutation.

Example:

```text
Secrets:
  ANTHROPIC_API_KEY
  SECURITY_AUDIT_GITHUB_TOKEN

Variables:
  GITHUB_OWNER
  ANTHROPIC_MODEL
  SECURITY_AUDIT_MAX_REPO_WORKERS
```

## Local development

```bash
cp .env.example .env
```

Never commit `.env`.

Before sharing logs or reports, check for tokens, API keys, private repository information, vulnerability details and internal infrastructure information.

## Incident response

If the tool makes an unintended repository change or credentials may have been exposed:

1. Stop further runs.
2. Disable the affected workflow or MCP mutation capability.
3. Revoke/rotate affected credentials if exposure is suspected.
4. Review GitHub audit logs and Actions logs.
5. Inspect commits, branches and PRs created by the tool.
6. Determine whether source code or secrets were exposed.
7. Preserve relevant reports/logs.
8. Revert unintended changes after assessing impact.

## Production checklist

- [ ] GitHub token uses least privilege.
- [ ] Repository scope is explicit.
- [ ] MCP mutation is disabled unless required.
- [ ] Remote MCP uses HTTPS and authentication.
- [ ] Claude API key is stored as a Secret.
- [ ] `.env` is ignored.
- [ ] CI permissions are minimal.
- [ ] Third-party dependencies/actions are reviewed.
- [ ] Reports are retained securely.
- [ ] Tests run after remediation.
- [ ] GitHub security state is rechecked.
- [ ] Auto-merge is disabled.
- [ ] Direct default-branch mutation requires explicit approval.

## Scope and disclaimer

This project provides security automation and controls but does not guarantee that a repository is secure. GitHub APIs, package registries, AI models, CI runners, dependencies and repository content can introduce additional risk.

Operators remain responsible for validating changes and configuring permissions, authentication, network controls and organisational security policies appropriate to their environment.
