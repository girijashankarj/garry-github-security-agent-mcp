import { Octokit } from "@octokit/rest";
import inquirer from "inquirer";
import { GitHubClient } from "./github.js";
import { writeReport } from "./report.js";
import { runScript } from "./runtime.js";
import type { AuditReport, OperatorChoices, RepositoryResult, SecurityCounts } from "./types.js";

const owner = process.env.GITHUB_OWNER ?? "";
const token = process.env.GITHUB_TOKEN ?? "";
if (!owner || !token) throw new Error("GITHUB_OWNER and GITHUB_TOKEN are required");
const github = new GitHubClient(new Octokit({ auth: token }), owner);
const MAX_WORKERS = Math.max(1, Math.min(Number(process.env.SECURITY_AUDIT_MAX_REPO_WORKERS ?? 10), 10));

function emptyCounts(): SecurityCounts { return { dependabot: { critical: 0, high: 0, medium: 0, low: 0 }, codeScanning: 0, secretScanning: 0, total: 0 }; }
function addCounts(target: SecurityCounts, value: SecurityCounts) {
  for (const s of ["critical", "high", "medium", "low"] as const) target.dependabot[s] += value.dependabot[s];
  target.codeScanning += value.codeScanning; target.secretScanning += value.secretScanning; target.total += value.total;
}

async function ask(): Promise<OperatorChoices> {
  const a = await inquirer.prompt([
    { type: "list", name: "scope", message: "Audit all repositories or selected repositories?", choices: ["all", "selected"] },
    { type: "input", name: "repositories", message: "Repositories (comma separated owner/name):", when: (x: any) => x.scope === "selected" },
    { type: "list", name: "fixMode", message: "Fix directly or create a PR?", choices: [{ name: "Directly fix default branch", value: "default-branch" }, { name: "Create pull request", value: "pr" }] },
    { type: "list", name: "prMode", message: "If PR, what type?", choices: ["draft", "ready"], when: (x: any) => x.fixMode === "pr" },
    { type: "input", name: "commitMessage", message: "Commit message format:", default: "fix(security): remediate vulnerabilities" },
    { type: "confirm", name: "includeBeforeAfterTable", message: "Include before/after table in PR descriptions?", default: true },
    { type: "confirm", name: "runTests", message: "Run detected test/build suites after changes?", default: true },
  ]);
  return { ...a, repositories: a.scope === "selected" ? a.repositories.split(",").map((x: string) => x.trim()) : [], prMode: a.prMode ?? "draft" };
}

function toCounts(r: any): SecurityCounts {
  const severity = r.severity ?? {};
  const dependabot = { critical: severity.critical ?? 0, high: severity.high ?? 0, medium: severity.medium ?? 0, low: severity.low ?? 0 };
  const codeScanning = r.categories.codeScanning ?? 0;
  const secretScanning = r.categories.secretScanning ?? 0;
  return { dependabot, codeScanning, secretScanning, total: Object.values(dependabot).reduce((a, b) => a + b, 0) + codeScanning + secretScanning };
}

/** Orchestration only: deterministic scripts own collection, remediation and verification. */
export async function run() {
  const startedAt = new Date().toISOString();
  const operator = await ask();
  const all = await github.repositories();
  const selected = operator.scope === "all" ? all : all.filter(r => operator.repositories.includes(r.full_name) || operator.repositories.includes(r.name));
  const selectedNames = new Set(selected.map(r => r.full_name));

  const baselineRun = await runScript("scripts/audit-security.mjs", [], { GITHUB_OWNER: owner, GITHUB_TOKEN: token });
  if (baselineRun.exitCode !== 0) throw new Error(`Baseline security script failed: ${baselineRun.stderr}`);
  const payload = JSON.parse(baselineRun.stdout);
  const baseline: RepositoryResult[] = payload.repositories.filter((r: any) => selectedNames.has(r.repository)).map((r: any) => ({ repository: r.repository, before: toCounts(r), changes: [], tests: [], status: "skipped" as const, error: r.errors?.join("; ") }));
  const baselineCounts = emptyCounts(); baseline.forEach(r => addCounts(baselineCounts, r.before));
  const before: AuditReport = { run: { startedAt, operator, scope: operator.scope }, summary: { repositories: selected.length, critical: baselineCounts.dependabot.critical, high: baselineCounts.dependabot.high, medium: baselineCounts.dependabot.medium, low: baselineCounts.dependabot.low, unresolved: baselineCounts.total }, categories: baselineCounts, repositories: baseline };
  const beforePath = await writeReport(before);
  console.log(`Before-action report: ${beforePath}`);

  const results: RepositoryResult[] = [];
  for (let offset = 0; offset < selected.length; offset += MAX_WORKERS) {
    const batch = selected.slice(offset, offset + MAX_WORKERS);
    const batchResults = await Promise.all(batch.map(async repo => {
      const result = await runScript("scripts/remediate-repo.mjs", [], {
        GITHUB_OWNER: owner, GITHUB_TOKEN: token, SECURITY_AUDIT_REPOSITORY: repo.full_name,
        SECURITY_AUDIT_BASE_BRANCH: repo.default_branch, SECURITY_AUDIT_FIX_MODE: operator.fixMode,
        SECURITY_AUDIT_PR_MODE: operator.prMode, SECURITY_AUDIT_COMMIT_MESSAGE: operator.commitMessage,
        SECURITY_AUDIT_RUN_TESTS: String(operator.runTests), SECURITY_AUDIT_INCLUDE_BEFORE_AFTER: String(operator.includeBeforeAfterTable),
        SECURITY_AUDIT_BEFORE_REPORT: beforePath,
      });
      if (result.exitCode !== 0) return { repository: repo.full_name, before: baseline.find(r => r.repository === repo.full_name)?.before ?? emptyCounts(), changes: [], tests: [], status: "failed" as const, error: result.stderr || result.stdout.slice(-4000) };
      return JSON.parse(result.stdout) as RepositoryResult;
    }));
    results.push(...batchResults);
    console.log(`Batch ${Math.floor(offset / MAX_WORKERS) + 1} complete: ${batch.length} repositories`);
  }

  const finalize = await runScript("scripts/finalize-report.mjs", [], { GITHUB_OWNER: owner, GITHUB_TOKEN: token, SECURITY_AUDIT_REPOSITORIES: selected.map(r => r.full_name).join(",") });
  if (finalize.exitCode !== 0) console.error(`Final security collection failed: ${finalize.stderr}`);
  const afterPayload = finalize.exitCode === 0 ? JSON.parse(finalize.stdout) : null;
  const afterByRepo = new Map<string, any>((afterPayload?.repositories ?? []).map((r: any) => [r.repository, r]));
  const afterCounts = emptyCounts();
  for (const result of results) {
    const collected = afterByRepo.get(result.repository);
    if (collected) result.after = toCounts(collected);
    addCounts(afterCounts, result.after ?? result.before);
  }
  const after: AuditReport = { run: { startedAt, completedAt: new Date().toISOString(), operator, scope: operator.scope }, summary: { repositories: selected.length, critical: afterCounts.dependabot.critical, high: afterCounts.dependabot.high, medium: afterCounts.dependabot.medium, low: afterCounts.dependabot.low, unresolved: afterCounts.total }, categories: afterCounts, repositories: results };
  console.log(`After-action report: ${await writeReport(after)}`);
}
