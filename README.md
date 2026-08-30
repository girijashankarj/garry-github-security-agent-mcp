# GitHub Security Agent MCP

A community-friendly, agentic GitHub security auditing and remediation platform with **CLI, Claude Code, Cursor, GitHub Actions and MCP** interfaces.

The project can run locally as a CLI or MCP server, or be hosted as an MCP service and consumed by an MCP-compatible AI client or application.

## What it does

GitHub security alerts tell you that a problem exists. This project takes the next step: **understand the finding, choose a conservative stable fix, verify it, and leave an auditable result**.

It supports:

- Dependabot alerts
- Code scanning / CodeQL alerts
- Secret scanning alerts
- Stable dependency remediation
- Automated tests/build/lint verification
- Direct fixes or pull requests
- Draft or ready-for-review PRs
- Before/after security reports
- Maximum 10 parallel repository workers
- Claude Code and Claude `-p`
- Claude Batch API integration boundary
- Cursor rules and agent workflows
- MCP stdio and Streamable HTTP

The project is designed for individuals, teams, organisations and the wider developer community. It is not tied to a particular GitHub account.

## Architecture

```text
                  AI / Application Clients
             ┌──────────┬───────────┬──────────┐
             ▼          ▼           ▼          ▼
          Claude     Cursor       MCP        CLI
             │          │           │          │
             └──────────┼───────────┼──────────┘
                        ▼
                 Agentic Workflow
                        │
                  TS Orchestrator
                   sequencing only
                        │
        ┌───────────────┼────────────────┐
        ▼               ▼                ▼
   Audit script    Remediation       Verification
        │               │                │
        └───────────────┼────────────────┘
                        ▼
                    GitHub API
                        │
                 Commit / Pull Request
                        │
                        ▼
                 Security re-audit
                        │
                        ▼
                     Reports
```

### Source-of-truth rule

The TypeScript orchestrator coordinates sequencing. It does not duplicate security operations.

- **Skills** define agent workflow and reasoning guidance.
- **Agents** define repository responsibilities.
- **Scripts** perform deterministic security collection, remediation and verification.
- **Hooks** enforce lifecycle safety gates.
- **MCP** exposes capabilities to compatible clients.
- **Claude/Cursor** provide reasoning where useful.
- **GitHub API** is authoritative for GitHub security state.

## MCP server

MCP is a first-class feature. Clone this repository and run it as an MCP server locally, or host it as a service for an MCP-compatible application.

### MCP tools

| Tool | Purpose | Mutates? |
|---|---|---:|
| `list_repositories` | List accessible active repositories | No |
| `security_summary` | Current security counts | No |
| `dependabot_alerts` | Open Dependabot findings + patched versions | No |
| `remediation_plan` | Conservative npm remediation plan | No |
| `remediate_repository` | Execute deterministic remediation runner | **Only with explicit opt-in** |

Mutation is **fail-closed**. It requires both `execute=true` and `MCP_ALLOW_MUTATIONS=true`. PR mode is recommended and the system never auto-merges.

### Local MCP with stdio

```bash
git clone https://github.com/girijashankarj/garry-github-security-agent-mcp.git
cd garry-github-security-agent-mcp
npm install
cp .env.example .env
```

Set real credentials in `.env`, then:

```bash
npm run mcp
```

Example client configuration:

```json
{
  "mcpServers": {
    "github-security-agent": {
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "/path/to/garry-github-security-agent-mcp",
      "env": {
        "GITHUB_OWNER": "your-github-owner",
        "GITHUB_TOKEN": "your-github-token",
        "MCP_ALLOW_MUTATIONS": "false"
      }
    }
  }
}
```

Never commit real credentials.

### MCP over Streamable HTTP

```bash
MCP_HOST=127.0.0.1 MCP_PORT=3000 npm run mcp:http
```

Endpoint:

```text
http://127.0.0.1:3000/mcp
```

For remote hosting, use HTTPS and authentication/authorisation. Do not expose mutation-enabled MCP directly to the public internet.

### MCP Inspector

```bash
npx @modelcontextprotocol/inspector npm run mcp
```

Use Inspector to verify tool schemas and responses before connecting an AI client.

## Claude integration

Claude is optional. The deterministic security engine works without Anthropic access.

Interactive:

```bash
claude
```

CI/non-interactive:

```bash
claude -p "Run the security audit workflow defined by this repository. Follow approved configuration and never auto-merge."
```

### Claude Batch API

For large repository sets:

```text
Repositories → Claude Batch API → remediation plans
       → deterministic validation → max 10 workers
       → tests + security recheck → commit / PR
```

The Batch layer must not directly mutate repositories.

## Local environment

```bash
cp .env.example .env
```

Example values are intentionally fake:

```env
GITHUB_OWNER=example-owner
GITHUB_TOKEN=github_pat_REPLACE_WITH_YOUR_TOKEN
ANTHROPIC_API_KEY=sk-ant-REPLACE_WITH_YOUR_KEY
ANTHROPIC_MODEL=claude-sonnet-4-5
SECURITY_AUDIT_MAX_REPO_WORKERS=10
SECURITY_AUDIT_RUN_TESTS=true
SECURITY_AUDIT_FIX_MODE=pr
SECURITY_AUDIT_PR_MODE=draft
MCP_ALLOW_MUTATIONS=false
MCP_HOST=127.0.0.1
MCP_PORT=3000
```

`.env` is gitignored. Never commit credentials.

## GitHub Actions

Sensitive values belong in **GitHub Actions Secrets**:

| Secret | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API authentication |
| `SECURITY_AUDIT_GITHUB_TOKEN` | Optional elevated GitHub authentication |

Non-sensitive configuration belongs in **GitHub Actions Variables**:

| Variable | Purpose |
|---|---|
| `GITHUB_OWNER` | Target GitHub account/organisation |
| `ANTHROPIC_MODEL` | Claude model |
| `SECURITY_AUDIT_MAX_REPO_WORKERS` | Worker limit, capped at 10 |

Never store tokens or API keys in Variables.

## Stable remediation strategy

The project does **not** blindly upgrade dependencies to latest.

> **Use the smallest stable patched version that resolves the security finding.**

The agent should use GitHub advisory data, inspect manifests and lockfiles, avoid unrelated dependency churn, avoid unnecessary major migrations, run verification, re-check security state and report unresolved findings honestly.

A successful commit is not proof that a vulnerability is fixed.

## Operator controls

Interactive runs ask:

1. All repositories or selected repositories?
2. Default branch or PR?
3. Draft or ready PR?
4. Commit-message format?
5. Include before/after table?
6. Which test/build/lint suites should run?

## Reports

```text
temp/
└── security-count/
    └── YYYY-MM-DD/
        ├── report-YYYY-MM-DD-HHmmss-sss.json   # BEFORE
        └── report-YYYY-MM-DD-HHmmss-sss.json   # AFTER
```

Reports contain run metadata, operator choices, security counts, findings, changes, verification, commits/PRs, failures and unresolved issues.

## Project structure

```text
.claude/
├── CLAUDE.md
├── settings.json
├── agents/
│   ├── security-repository-agent.md
│   ├── test-agent.md
│   └── review-agent.md
├── hooks/
│   ├── pre-change-audit.sh
│   └── post-change-test.sh
└── skills/
    └── security-audit/
        └── SKILL.md

.cursor/
├── rules/
│   └── security-audit.mdc
└── skills/
    └── security-audit/
        └── SKILL.md

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

Scripts are reusable outside Claude. Claude Code, Cursor and MCP clients can add agentic reasoning around the same deterministic security operations.

## Development

Requirements: Node.js 20+, Git, a GitHub token with appropriate permissions, and optional Anthropic access.

```bash
npm install
npm run build
npm test
npm run audit
npm run mcp
npm run mcp:http
node scripts/audit-security.mjs
node scripts/verify-repo.mjs
node scripts/consistency-check.mjs
```

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
- Never silently expand repository scope.
- Never dismiss alerts merely to reduce counts.
- Never auto-merge.
- Never claim a vulnerability is fixed without verification.
- Isolate repository failures.
- Keep reports out of Git.
- Keep MCP mutations disabled by default.
- Prefer MCP discovery and planning before mutation.

## Community use

This project is designed to work with any GitHub account or organisation. Configure the target through environment variables or GitHub Actions configuration rather than assuming a specific owner.

## License

MIT
