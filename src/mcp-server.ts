import { createServer as createHttpServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Octokit } from "@octokit/rest";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { localhostHostValidation, localhostOriginValidation, toNodeHandler } from "@modelcontextprotocol/node";
import * as z from "zod/v4";
import { GitHubClient } from "./github.js";
import { planNpm } from "./remediation.js";
import type { DependabotAlert } from "./types.js";

const exec = promisify(execFile);
const owner = process.env.GITHUB_OWNER;
const token = process.env.GITHUB_TOKEN;

if (!owner || !token) throw new Error("GITHUB_OWNER and GITHUB_TOKEN are required");

const github = new GitHubClient(new Octokit({ auth: token }), owner);
const repoSchema = z.string().regex(/^[A-Za-z0-9_.-]+$/, "Use a repository name, not owner/name");

function text(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

async function repository(repo: string) {
  const repositories = await github.repositories();
  const match = repositories.find((item) => item.name === repo || item.full_name === `${owner}/${repo}`);
  if (!match) throw new Error(`Repository ${owner}/${repo} is not available to the configured GitHub token`);
  return match;
}

function registerTools(server: McpServer) {
  server.registerTool("list_repositories", { description: "List active, non-fork repositories visible to the configured GitHub token.", inputSchema: z.object({}) }, async () => text((await github.repositories()).map((repo) => ({ name: repo.name, fullName: repo.full_name, defaultBranch: repo.default_branch, visibility: repo.visibility }))));

  server.registerTool("security_summary", { description: "Return current open Dependabot, code scanning and secret scanning counts for a repository.", inputSchema: z.object({ repo: repoSchema }) }, async ({ repo }) => text({ repository: `${owner}/${repo}`, counts: await github.counts(repo) }));

  server.registerTool("dependabot_alerts", { description: "List open Dependabot alerts and their GitHub-provided patched versions.", inputSchema: z.object({ repo: repoSchema, severity: z.enum(["critical", "high", "medium", "low"]).optional() }) }, async ({ repo, severity }) => {
    const alerts = await github.dependabot(repo);
    const filtered = severity ? alerts.filter((alert) => alert.security_advisory?.severity === severity) : alerts;
    return text(filtered.map((alert) => ({ number: alert.number, package: alert.dependency?.package?.name, ecosystem: alert.dependency?.package?.ecosystem, manifest: alert.dependency?.manifest_path, severity: alert.security_advisory?.severity, ghsa: alert.security_advisory?.ghsa_id, cve: alert.security_advisory?.cve_id, vulnerableRange: alert.security_vulnerability?.vulnerable_version_range, firstPatchedVersion: alert.security_vulnerability?.first_patched_version?.identifier })));
  });

  server.registerTool("remediation_plan", { description: "Create a conservative remediation plan from open npm Dependabot alerts. This tool never changes a repository.", inputSchema: z.object({ repo: repoSchema }) }, async ({ repo }) => {
    const alerts = await github.dependabot(repo);
    return text({ repository: `${owner}/${repo}`, plans: alerts.map((alert) => planNpm(alert)).filter((plan): plan is NonNullable<typeof plan> => plan !== null) });
  });

  server.registerTool("remediate_repository", { description: "Apply the deterministic security remediation runner. Disabled unless MCP_ALLOW_MUTATIONS=true and execute=true. PR mode is recommended.", inputSchema: z.object({ repo: repoSchema, execute: z.boolean().default(false), fixMode: z.enum(["pr", "default-branch"]).default("pr"), prMode: z.enum(["draft", "ready"]).default("draft"), runTests: z.boolean().default(true) }) }, async ({ repo, execute, fixMode, prMode, runTests }) => {
    const match = await repository(repo);
    const alerts = await github.dependabot(repo);
    const plans = alerts.map((alert: DependabotAlert) => planNpm(alert)).filter((plan): plan is NonNullable<typeof plan> => plan !== null);
    if (!execute) return text({ mode: "dry-run", repository: match.full_name, plans, message: "No repository changes were made. Call again with execute=true after explicit operator approval." });
    if (process.env.MCP_ALLOW_MUTATIONS !== "true") throw new Error("Mutation tools are disabled. Set MCP_ALLOW_MUTATIONS=true after explicit operator approval.");

    const { stdout, stderr } = await exec("node", ["scripts/remediate-repo.mjs"], { cwd: process.cwd(), env: { ...process.env, GITHUB_OWNER: owner, GITHUB_TOKEN: token, SECURITY_AUDIT_REPOSITORY: match.full_name, SECURITY_AUDIT_BASE_BRANCH: match.default_branch, SECURITY_AUDIT_FIX_MODE: fixMode, SECURITY_AUDIT_PR_MODE: prMode, SECURITY_AUDIT_RUN_TESTS: String(runTests) }, maxBuffer: 16 * 1024 * 1024 });
    let result: unknown;
    try { result = JSON.parse(stdout); } catch { result = { output: stdout }; }
    return text({ result, stderr: stderr.slice(-4000) });
  });
}

export function createSecurityAuditServer() {
  const server = new McpServer({ name: "github-security-agent-mcp", version: "0.1.0" }, { instructions: "Use read-only security tools for discovery and planning. Repository mutation is disabled unless MCP_ALLOW_MUTATIONS=true and execute=true. Never expose GitHub tokens." });
  registerTools(server);
  return server;
}

async function serveHttp() {
  const handler = toNodeHandler(createMcpHandler(() => createSecurityAuditServer()));
  const validateHost = localhostHostValidation();
  const validateOrigin = localhostOriginValidation();
  const port = Number(process.env.MCP_PORT ?? 3000);
  const host = process.env.MCP_HOST ?? "127.0.0.1";
  createHttpServer((req, res) => { if (!validateHost(req, res) || !validateOrigin(req, res)) return; void handler(req, res); }).listen(port, host, () => console.error(`GitHub Security Agent MCP server listening on http://${host}:${port}/mcp`));
}

if (process.argv.includes("--http")) await serveHttp();
else { await serveStdio(() => createSecurityAuditServer()); console.error("GitHub Security Agent MCP server running on stdio"); }
