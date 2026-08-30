import { Octokit } from "@octokit/rest";
import pLimit from "p-limit";
import inquirer from "inquirer";
import { GitHubClient } from "./github.js";
import { writeReport } from "./report.js";
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
  target.codeScanning += value.codeScanning;
  target.secretScanning += value.secretScanning;
  target.total += value.total;
}

async function ask(): Promise<OperatorChoices> {
  const answers = await inquirer.prompt([
    { type: "list", name: "scope", message: "Audit all repositories or selected repositories?", choices: ["all", "selected"] },
    { type: "input", name: "repositories", message: "Repositories (comma separated owner/name):", when: (a) => a.scope === "selected" },
    { type: "list", name: "fixMode", message: "How should fixes be delivered?", choices: [
      { name: "Directly fix default branch", value: "default-branch" },
      { name: "Create pull request", value: "pr" },
    ]},
    { type: "list", name: "prMode", message: "If PR, what type?", choices: ["draft", "ready"], when: (a) => a.fixMode === "pr" },
    { type: "input", name: "commitMessage", message: "Commit message format:", default: "fix(security): remediate vulnerabilities" },
    { type: "confirm", name: "includeBeforeAfterTable", message: "Include before/after table in PR descriptions?", default: true },
    { type: "confirm", name: "runTests", message: "Run detected test/build suites after changes?", default: true },
  ]);
  return { ...answers, repositories: answers.scope === "selected" ? answers.repositories.split(",").map((x: string) => x.trim()) : [], prMode: answers.prMode ?? "draft" };
}

export async function run() {
  const startedAt = new Date().toISOString();
  const operator = await ask();
  const all = await github.repositories();
  const selected = operator.scope === "all" ? all : all.filter((r) => operator.repositories.includes(r.full_name) || operator.repositories.includes(r.name));

  const before: AuditReport = {
    run: { startedAt, operator, scope: operator.scope },
    summary: { repositories: selected.length, critical: 0, high: 0, medium: 0, low: 0, unresolved: 0 },
    categories: emptyCounts(),
    repositories: [],
  };

  // Required invariant: the before-action report exists before any mutation.
  const beforePath = await writeReport(before);
  console.log(`Before-action report: ${beforePath}`);

  const results: RepositoryResult[] = [];
  const limit = pLimit(10);

  for (let offset = 0; offset < selected.length; offset += 10) {
    const batch = selected.slice(offset, offset + 10);
    const batchResults = await Promise.all(batch.map((repo) => limit(async (): Promise<RepositoryResult> => {
      try {
        const counts = await github.counts(repo.name);
        return { repository: repo.full_name, before: counts, changes: [], tests: [], status: "skipped" };
      } catch (error) {
        return { repository: repo.full_name, before: emptyCounts(), changes: [], tests: [], status: "failed", error: String(error) };
      }
    })));
    results.push(...batchResults);
    console.log(`Completed batch ${Math.floor(offset / 10) + 1}: ${batch.length} repositories`);
  }

  const categories = emptyCounts();
  for (const result of results) addCounts(categories, result.before);

  before.categories = categories;
  before.summary.critical = categories.dependabot.critical;
  before.summary.high = categories.dependabot.high;
  before.summary.medium = categories.dependabot.medium;
  before.summary.low = categories.dependabot.low;
  before.repositories = results;
  await writeReport(before);

  // Remediation is intentionally a separate phase. This guarantees the first report is persisted.
  // The next implementation layer can plug in package-manager-specific safe fixes.
  const after: AuditReport = {
    run: { startedAt, completedAt: new Date().toISOString(), operator, scope: operator.scope },
    summary: { ...before.summary, unresolved: categories.total },
    categories,
    repositories: results,
  };
  const afterPath = await writeReport(after);
  console.log(`After-action report: ${afterPath}`);
}
