import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { RepositoryResult } from "./types.js";
import type { GitHubClient } from "./github.js";
import { planNpm, applyNpmPlan, runCommand } from "./remediation.js";

const exec = promisify(execFile);

export interface WorkerOptions {
  github: GitHubClient;
  owner: string;
  repo: string;
  base: string;
  fixMode: "default-branch" | "pr";
  prMode: "draft" | "ready";
  commitMessage: string;
  runTests: boolean;
  includeBeforeAfterTable: boolean;
}

async function git(repoDir: string, args: string[]) {
  return exec("git", args, { cwd: repoDir, timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
}

async function clone(owner: string, repo: string, base: string, dir: string) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is required");
  await exec("git", ["-c", `http.extraheader=Authorization: Bearer ${token}`, "clone", "--depth", "1", "--branch", base, `https://github.com/${owner}/${repo}.git`, dir], {
    timeout: 120_000,
    maxBuffer: 4 * 1024 * 1024,
  });
}

export async function processRepository(options: WorkerOptions): Promise<RepositoryResult> {
  const fullName = `${options.owner}/${options.repo}`;
  const before = await options.github.counts(options.repo);
  const alerts = await options.github.dependabot(options.repo);
  const npmPlans = alerts.map(planNpm).filter((x): x is NonNullable<typeof x> => Boolean(x));
  if (npmPlans.length === 0) return { repository: fullName, before, changes: [], tests: [], status: "skipped" };

  const dir = await mkdtemp(join(tmpdir(), "github-security-audit-"));
  const branch = `security-audit/${Date.now()}-${options.repo}`;
  try {
    await clone(options.owner, options.repo, options.base, dir);
    if (options.fixMode === "pr") await git(dir, ["switch", "-c", branch]);

    const changes: string[] = [];
    const tests: RepositoryResult["tests"] = [];
    for (const plan of npmPlans) {
      const result = await applyNpmPlan(dir, plan);
      if (result.exitCode !== 0) return { repository: fullName, before, changes, tests, status: "failed", error: result.output.slice(-4000) };
      changes.push(`${plan.packageName}: ${plan.vulnerableRange} -> ${plan.patchedVersion}`);
    }

    if (options.runTests) {
      const result = await runCommand("npm", ["test", "--if-present"], dir);
      tests.push({ command: result.command, exitCode: result.exitCode, output: result.output.slice(-4000) });
      if (result.exitCode !== 0) return { repository: fullName, before, changes, tests, status: "failed", error: "Test suite failed" };
    }

    const diff = await runCommand("git", ["diff", "--stat"], dir);
    if (!diff.output.trim()) return { repository: fullName, before, changes, tests, status: "skipped" };

    await git(dir, ["config", "user.name", "github-security-audit[bot]"]);
    await git(dir, ["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
    await git(dir, ["add", "package.json", "package-lock.json", "npm-shrinkwrap.json"]);
    await git(dir, ["commit", "-m", options.commitMessage]);

    const token = process.env.GITHUB_TOKEN!;
    await git(dir, ["-c", `http.extraheader=Authorization: Bearer ${token}`, "push", "origin", options.fixMode === "pr" ? `HEAD:${branch}` : `HEAD:${options.base}`]);

    const after = await options.github.counts(options.repo);
    let pullRequest: string | undefined;
    let commit: string | undefined;
    const commitResult = await git(dir, ["rev-parse", "HEAD"]);
    commit = commitResult.stdout.trim();

    if (options.fixMode === "pr") {
      const table = changes.map((change) => `| ${change} | remediated | patched | Security fix | ${tests.some(t => t.exitCode === 0) ? "passed" : "not run"} |`).join("\n");
      const body = `${options.includeBeforeAfterTable ? `## Before / After\n\n| Package | Before | After | Reason | Test |\n|---|---|---|---|---|\n${table}\n\n` : ""}Automated security remediation.\n\nSecurity findings before: ${before.total}. After: ${after.total}.\n\nTests were run according to the operator configuration. No auto-merge is performed.`;
      const pr = await options.github.pullRequest(options.repo, branch, options.base, `fix(security): remediate ${options.repo}`, body, options.prMode === "draft");
      pullRequest = pr.data.html_url;
    }

    return { repository: fullName, before, after, changes, tests, commit, pullRequest, status: after.total < before.total ? "fixed" : "partial" };
  } catch (error) {
    return { repository: fullName, before, changes: [], tests: [], status: "failed", error: String(error) };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
