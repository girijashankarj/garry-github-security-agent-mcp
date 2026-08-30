# Garry GitHub Security Audit

A community-friendly, agentic GitHub security audit and remediation tool for auditing and safely fixing vulnerabilities across repositories.

## Why this project?

GitHub security alerts tell you that a problem exists. This project is designed to take the next step: **understand the finding, choose a conservative stable fix, verify it, and leave an auditable result**.

It is designed for individual developers, teams, organisations and the wider developer community. It is **not tied to Garry's personal GitHub account**.

## What it does

The agent creates a **before-action security report**, asks the operator for approval and execution preferences, then processes repositories in batches of **maximum 10 parallel repository agents**. It waits for the current batch to finish before starting the next batch, and isolates failures so one repository does not stop the complete run.

### End-to-end workflow

```text
START
  │
  ├─ 0. Create BEFORE-action report
  │     temp/security-count/<date>/report-<date>-<time>-<sec>.json
  │
  ├─ 1. Interactive preflight
  │     ├─ all repos or selected repos?
  │     ├─ default branch or PR?
  │     ├─ draft PR or ready PR?
  │     ├─ commit message format?
  │     ├─ PR before/after table?
  │     └─ test/build/lint policy?
  │
  ├─ 2. Fetch security counts by category
  │
  ├─ 3. Spawn repository agents
  │     └─ MAX 10 concurrent
  │          ↓ wait for batch
  │        next 10
  │          ↓
  │        repeat until complete
  │
  ├─ 4. Per repository
  │     ├─ inspect alerts
  │     ├─ inspect manifests + lockfiles
  │     ├─ identify minimal stable patched versions
  │     ├─ apply approved security changes
  │     ├─ run tests/build/lint
  │     ├─ verify security state
  │     └─ commit or create PR
  │
  └─ 5. Create AFTER-action report
        temp/security-count/<date>/report-<date>-<time>-<sec>.json
```

## Agentic architecture

The project deliberately separates **reasoning, deterministic execution and safety controls**.

```text
                 Claude / Cursor / MCP Client
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
           Skills      Agents      MCP
              │          │          │
              └──────────┼──────────┘
                         ▼
                  TS Orchestrator
                   sequencing only
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
       Audit script   Remediation      Verify
          │              │              │
          └──────────────┼──────────────┘
                         ▼
                     GitHub API
                         │
                         ▼
                  Commit / Pull Request
                         │
                         ▼
                    Re-audit / Report
```

### Source-of-truth rule

The TypeScript orchestrator is **not** the source of truth for security operations. It only coordinates workflow sequencing.

- **Skills** define agent behaviour and workflow knowledge.
- **Agents** define repository-specific responsibilities.
- **Scripts** perform deterministic security collection, remediation and verification.
- **Hooks** enforce safety and lifecycle gates.
- **MCP** exposes the deterministic capabilities to compatible AI clients.
- **Claude/Cursor** provide reasoning where human-like analysis is useful.
- **GitHub API** is the authoritative source for GitHub security state.

This allows the same workflow to be used from a terminal, Claude Code, Cursor, an MCP-compatible client or GitHub Actions without duplicating security logic.

## MCP server

The repository can also run as a **Model Context Protocol (MCP) server**. This lets an MCP-compatible client such as Claude Code, Cursor, VS Code or another application consume the security-audit capabilities as tools instead of invoking the CLI directly.

The MCP implementation uses the current split MCP TypeScript SDK v2 packages and supports both **local stdio** and **Streamable HTTP**. citeturn1search0turn1search4

### MCP tools

| Tool | Purpose | Mutates repo? |
|---|---|---:|
| `list_repositories` | List accessible active repositories | No |
| `security_summary` | Current open security counts | No |
| `dependabot_alerts` | List open Dependabot findings and patched versions | No |
| `remediation_plan` | Build conservative npm remediation plans | No |
| `remediate_repository` | Execute the existing deterministic remediation runner | Only with explicit opt-in |

Mutation is **fail-closed**. The server requires both:

1. `execute=true` in the tool call.
2. `MCP_ALLOW_MUTATIONS=true` in the server environment.

PR mode is the recommended execution mode. The MCP layer does not auto-merge anything.

### Local MCP / stdio

Clone and install the repository:

```bash
git clone https://github.com/girijashankarj/garry-github-security-audit.git
cd garry-github-security-audit
npm install
cp .env.example .env
```

Set the GitHub credentials in `.env`, then run:

```bash
npm run mcp
```

The process communicates over stdin/stdout. Logs go to stderr so the JSON-RPC protocol channel remains clean, as required by the MCP stdio transport. citeturn2search6turn2search7

For example, an MCP client configuration can launch the local server with:

```json
{
  "mcpServers": {
    "garry-github-security-audit": {
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "/path/to/garry-github-security-audit",
      "env": {
        "GITHUB_OWNER": "your-github-owner",
        "GITHUB_TOKEN": "your-github-token"
      }
    }
  }
}
```

Never put a real GitHub token in source control or a committed configuration file.

### MCP over HTTP

For a local or separately hosted MCP service:

```bash
MCP_HOST=127.0.0.1 MCP_PORT=3000 npm run mcp:http
```

The MCP endpoint is:

```text
http://127.0.0.1:3000/mcp
```

The HTTP implementation uses the MCP SDK's `createMcpHandler` and Node adapter with localhost Host/Origin validation. The modern MCP SDK recommends Streamable HTTP for HTTP servers rather than the older SSE transport. citeturn2search5turn1search4

For a remotely hosted deployment, put the service behind HTTPS and add proper authentication/authorisation. Do not expose a mutation-enabled server directly to the public internet.

### MCP Inspector

For local testing, the MCP Inspector can launch the stdio server and expose its tools for manual verification:

```bash
npx @modelcontextprotocol/inspector npm run mcp
```

This is useful for verifying tool schemas and responses before connecting Claude Code, Cursor or another MCP client. citeturn2search6

## Claude integration

Claude is an **optional reasoning layer**. The deterministic audit can operate without Anthropic access.

### Claude Code interactive

```bash
claude
```

Use the repository Skill and let Claude guide the operator through the workflow.

### Claude Code non-interactive / CI

```bash
claude -p "Run the security audit workflow defined by this repository. Follow the approved configuration and never auto-merge."
```

The non-interactive mode is suitable for controlled CI workflows where the required permissions and approvals have already been configured.

### Claude Batch API

Batch execution is designed as an adapter for large-scale asynchronous analysis:

```text
100 repositories
      │
      ▼
Claude Batch API
      │
      ▼
analysis / remediation plans
      │
      ▼
validate plans
      │
      ▼
repository workers (max 10)
      │
      ▼
tests + security recheck
      │
      ▼
commit / PR
```

The Batch API should produce analysis/remediation plans. It must **not directly mutate repositories**. Deterministic workers validate and execute approved plans.

## Local environment

Create your local environment from the safe template:

```bash
cp .env.example .env
```

Replace the mock values with your credentials. **Never commit `.env`**. It is already covered by `.gitignore`.

Example variables include:

```env
GITHUB_OWNER=example-owner
GITHUB_TOKEN=github_pat_REPLACE_WITH_YOUR_TOKEN
ANTHROPIC_API_KEY=sk-ant-REPLACE_WITH_YOUR_KEY
ANTHROPIC_MODEL=claude-sonnet-4-5
SECURITY_AUDIT_MAX_REPO_WORKERS=10
SECURITY_AUDIT_RUN_TESTS=true
SECURITY_AUDIT_FIX_MODE=pr
SECURITY_AUDIT_PR_MODE=draft
```

These are **mock values only**. Do not copy real credentials into source-controlled files.

For MCP, the server also supports:

```env
MCP_ALLOW_MUTATIONS=false
MCP_HOST=127.0.0.1
MCP_PORT=3000
```

Keep `MCP_ALLOW_MUTATIONS=false` unless an operator deliberately wants MCP to be able to execute approved remediation.

## GitHub Actions configuration

For CI, sensitive values belong in **GitHub Actions Secrets**:

| Secret | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API authentication |
| `SECURITY_AUDIT_GITHUB_TOKEN` | Optional elevated GitHub token when `GITHUB_TOKEN` is insufficient |

Non-sensitive configuration belongs in **GitHub Actions Variables**:

| Variable | Purpose |
|---|---|
| `GITHUB_OWNER` | GitHub account/organisation to audit |
| `ANTHROPIC_MODEL` | Claude model selection |
| `SECURITY_AUDIT_MAX_REPO_WORKERS` | Repository worker limit, capped at 10 |

**Never put API keys or GitHub tokens in Variables. Use Secrets.**

The example workflow is available at `.github/workflows/claude-security-audit.yml`.

## Security categories

The architecture supports:

- **Dependabot alerts**
- **Code scanning / CodeQL alerts**
- **Secret scanning alerts**
- Repository security configuration and coverage where the GitHub API provides the required information

The project distinguishes **known vulnerabilities** from dependencies that are merely old. An old package is not automatically replaced just because a newer version exists.

## Stable remediation strategy

The default remediation principle is:

> **Use the smallest stable patched version that resolves the security finding.**

The agent should:

1. Use GitHub's security advisory information and first patched version where available.
2. Inspect the repository's dependency manifest and lockfile.
3. Avoid unrelated dependency churn.
4. Avoid unnecessary major-version migrations.
5. Run the repository's relevant verification suite.
6. Re-check the security state after remediation.
7. Report unresolved vulnerabilities honestly.

A security fix is **not considered complete merely because a commit succeeded**.

## Operator controls

Every interactive run asks:

1. Audit **all repositories** or **selected repositories**?
2. Fix directly on the **default branch** or create a **PR**?
3. If using a PR, make it **draft** or **ready for review**?
4. What **commit message format** should be used?
5. Should the PR contain a **before/after table**?
6. Which **test/build/lint suites** should run after changes?

The choices are recorded in the audit report.

## Pull request format

When PR mode is selected, the description should include an auditable before/after table:

| Package | Before | After | Reason | Verification |
|---|---:|---:|---|---|
| example-package | 1.2.0 | 1.2.7 | Security patch | npm test |

The agent must never auto-merge a remediation PR.

## Reports

Reports are intentionally kept outside source control:

```text
temp/
└── security-count/
    └── YYYY-MM-DD/
        ├── report-YYYY-MM-DD-HHmmss-sss.json   # BEFORE
        └── report-YYYY-MM-DD-HHmmss-sss.json   # AFTER
```

`temp/` is gitignored.

Reports should capture:

- Run metadata
- Operator choices
- Repository scope
- Security counts by category
- Severity counts
- Individual findings
- Dependency/version changes
- Test/build/lint results
- Commit references
- Pull request references
- Failed repositories
- Unresolved findings

## Repository agents

Each repository worker has an isolated responsibility:

### Security Repository Agent

Inspects the selected repository, analyses security findings, prepares and applies approved remediation, and returns an auditable result.

### Test Agent

Determines and executes the repository's relevant test/build/lint commands and records the outcome.

### Review Agent

Checks that changes address the security finding, avoid unnecessary dependency churn, contain verification results and follow the selected PR policy.

The maximum active repository workers is **10**.

## Skills, hooks and scripts

```text
.claude/
├── CLAUDE.md
├── settings.json
├── agents/
│   ├── security-repository-agent.md
│   ├── test-agent.md
│   └── review-agent.md
├── hooks/
│   └── pre-change-audit.sh
└── skills/
    └── security-audit/
        └── SKILL.md

.cursor/
└── rules/
    └── security-audit.mdc

scripts/
├── audit-security.mjs
├── remediate-repo.mjs
├── verify-repo.mjs
├── post-change-verify.mjs
├── finalize-report.mjs
└── consistency-check.mjs

src/
├── mcp-server.ts
├── orchestrator.ts
├── github.ts
├── runtime.ts
├── report.ts
├── remediation.ts
├── pr.ts
├── types.ts
└── worker.ts
```

Scripts are intentionally reusable outside Claude. This means a community contributor can run the deterministic workflow directly, while Claude Code, Cursor and MCP clients can add agentic reasoning around it.

## Safety model

```text
Agent / MCP client decides
          ↓
Deterministic script executes
          ↓
Hook checks lifecycle invariant
          ↓
Tests verify repository
          ↓
GitHub security state rechecked
          ↓
Report records evidence
```

Safety rules:

- Never print or commit credentials.
- Never modify secrets without explicit approval.
- Never dismiss alerts just to reduce the count.
- Never auto-merge.
- Never silently expand repository scope.
- Never claim a vulnerability is fixed without verification.
- Isolate repository failures and continue remaining batches.
- Keep generated reports out of Git.
- Keep MCP mutation mode disabled unless explicitly required.
- Prefer MCP dry-run/planning tools before mutation tools.

## Development

Requirements:

- Node.js 20+
- Git
- GitHub token with permissions appropriate for the selected audit/remediation scope
- Optional Anthropic API access for Claude features

Install:

```bash
npm install
```

Build/type-check:

```bash
npm run build
```

Tests:

```bash
npm test
```

Run the audit CLI:

```bash
npm run audit
```

Run the MCP server over stdio:

```bash
npm run mcp
```

Run the MCP server over HTTP:

```bash
npm run mcp:http
```

Run deterministic security collection directly:

```bash
node scripts/audit-security.mjs
```

Run repository verification:

```bash
node scripts/verify-repo.mjs
```

Run repository consistency checks:

```bash
node scripts/consistency-check.mjs
```

## GitHub Actions

The repository contains an example manually triggered Claude security workflow:

```text
.github/workflows/claude-security-audit.yml
```

It supports the documented execution modes:

- `claude-code`
- `deterministic`
- `batch` adapter boundary

The workflow intentionally fails rather than installing an unpinned Claude CLI. CI should use an organisation-approved, pinned Claude Code installation.

## Community use

This project is intended to be reusable with any GitHub account or organisation.

Do not assume the repository owner is the target of the audit. Configure the target through environment variables or GitHub Actions configuration.

For community contributions:

1. Keep security operations deterministic where possible.
2. Add tests for new remediation logic.
3. Do not introduce credential handling into source files.
4. Preserve the 10-worker safety ceiling unless the architecture is deliberately revised.
5. Update documentation when adding a new execution mode, MCP tool or security category.
6. Keep MCP mutation capabilities fail-closed.

## License

MIT
