import { Octokit } from "@octokit/rest";
import pLimit from "p-limit";
import inquirer from "inquirer";
import { GitHubClient } from "./github.js";
import { writeReport } from "./report.js";
import { processRepository } from "./worker.js";
import type { AuditReport, OperatorChoices, RepositoryResult, SecurityCounts } from "./types.js";

const owner = process.env.GITHUB_OWNER ?? "";
const token = process.env.GITHUB_TOKEN ?? "";
if (!owner || !token) throw new Error("GITHUB_OWNER and GITHUB_TOKEN are required");
const github = new GitHubClient(new Octokit({ auth: token }), owner);

function emptyCounts(): SecurityCounts {
  return { dependabot: { critical: 0, high: 0, medium: 0, low: 0 }, codeScanning: 0, secretScanning: 0, total: 0 };
}
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

export async function run() {
  const startedAt = new Date().toISOString();
  const operator = await ask();
  const all = await github.repositories();
  const selected = operator.scope === "all" ? all : all.filter((r) => operator.repositories.includes(r.full_name) || operator.repositories.includes(r.name));

  // Phase 0: collect the complete baseline before any mutation.
  const baseline: RepositoryResult[] = [];
  const baselineLimit = pLimit(10);
  for (let offset = 0; offset < selected.length; offset += 10) {
    const batch = selected.slice(offset, offset + 10);
    baseline.push(...await Promise.all(batch.map((repo) => baselineLimit(async () => {
      try { return { repository: repo.full_name, before: await github.counts(repo.name), changes: [], tests: [], status: "skipped" as const }; }
      catch (error) { return { repository: repo.full_name, before: emptyCounts(), changes: [], tests: [], status: "failed" as const, error: String(error) }; }
    }))));
  }
  const baselineCounts = emptyCounts(); baseline.forEach((r) => addCounts(baselineCounts, r.before));
  const before: AuditReport = { run: { startedAt, operator, scope: operator.scope }, summary: { repositories: selected.length, critical: baselineCounts.dependabot.critical, high: baselineCounts.dependabot.high, medium: baselineCounts.dependabot.medium, low: baselineCounts.dependabot.low, unresolved: baselineCounts.total }, categories: baselineCounts, repositories: baseline };
  const beforePath = await writeReport(before);
  console.log(`Before-action report: ${beforePath}`);

  // Phase 1: remediation. Hard ceiling of ten active repository workers.
  const results: RepositoryResult[] = [];
  for (let offset = 0; offset < selected.length; offset += 10) {
    const batch = selected.slice(offset, offset + 10);
    const batchResults = await Promise.all(batch.map((repo) => baselineLimit(async () => {
      const baselineResult = baseline.find((r) => r.repository === repo.full_name);
      if (!baselineResult || baselineResult.before.total === 0) return baselineResult ?? { repository: repo.full_name, before: emptyCounts(), changes: [], tests: [], status: "skipped" as const };
      return processRepository({ github, owner, repo: repo.name, base: repo.default_branch, ...operator });
    })));
    results.push(...batchResults);
    console.log(`Remediation batch ${Math.floor(offset / 10) + 1} complete: ${batch.length} repositories`);
  }

  const afterCounts = emptyCounts(); results.forEach((r) => addCounts(afterCounts, r.after ?? r.before));
  const after: AuditReport = { run: { startedAt, completedAt: new Date().toISOString(), operator, scope: operator.scope }, summary: { repositories: selected.length, critical: afterCounts.dependabot.critical, high: afterCounts.dependabot.high, medium: afterCounts.dependabot.medium, low: afterCounts.dependabot.low, unresolved: afterCounts.total }, categories: afterCounts, repositories: results };
  console.log(`After-action report: ${await writeReport(after)}`);
}
