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

async function secureGit(repoDir: string, args: string[]) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is required");
  return exec("git", args, {
    cwd: repoDir,
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.extraheader", GIT_CONFIG_VALUE_0: `Authorization: Bearer ${token}` },
  });
}

export async function processRepository(options: WorkerOptions): Promise<RepositoryResult> {
  const fullName = `${options.owner}/${options.repo}`;
  const before = await options.github.counts(options.repo);
  const alerts = await options.github.dependabot(options.repo);
  const npmPlans = alerts.map(planNpm).filter((x): x is NonNullable<typeof x> => Boolean(x));
  if (npmPlans.length === 0) return { repository: fullName, before, changes: [], tests: [], status: "skipped" };

  const parent = await mkdtemp(join(tmpdir(), "github-security-audit-parent-"));
  const cloneDir = join(parent, options.repo);
  const branch = `security-audit/${Date.now()}-${options.repo}`;
  try {
    await secureGit(parent, ["clone", "--depth", "1", "--branch", options.base, `https://github.com/${options.owner}/${options.repo}.git`, cloneDir]);
    if (options.fixMode === "pr") await exec("git", ["switch", "-c", branch], { cwd: cloneDir });

    const changes: string[] = [];
    const tests: RepositoryResult["tests"] = [];
    for (const plan of npmPlans) {
      const result = await applyNpmPlan(cloneDir, plan);
      if (result.exitCode !== 0) return { repository: fullName, before, changes, tests, status: "failed", error: result.output.slice(-4000) };
      changes.push(`${plan.packageName}: ${plan.vulnerableRange} -> ${plan.patchedVersion}`);
    }

    if (options.runTests) {
      const result = await runCommand("npm", ["test", "--if-present"], cloneDir);
      tests.push({ command: result.command, exitCode: result.exitCode, output: result.output.slice(-4000) });
      if (result.exitCode !== 0) return { repository: fullName, before, changes, tests, status: "failed", error: "Test suite failed" };
    }

    const diff = await runCommand("git", ["diff", "--stat"], cloneDir);
    if (!diff.output.trim()) return { repository: fullName, before, changes, tests, status: "skipped" };

    await exec("git", ["config", "user.name", "github-security-audit[bot]"], { cwd: cloneDir });
    await exec("git", ["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"], { cwd: cloneDir });
    await exec("git", ["add", "-A"], { cwd: cloneDir });
    await exec("git", ["commit", "-m", options.commitMessage], { cwd: cloneDir });
    await secureGit(cloneDir, ["push", "origin", options.fixMode === "pr" ? `HEAD:${branch}` : `HEAD:${options.base}`]);

    const after = await options.github.counts(options.repo);
    const commit = (await exec("git", ["rev-parse", "HEAD"], { cwd: cloneDir })).stdout.trim();
    let pullRequest: string | undefined;

    if (options.fixMode === "pr") {
      const rows = changes.map((change) => `| ${change} | patched | Security fix | ${tests.every(t => t.exitCode === 0) ? "passed" : "not run"} |`).join("\n");
      const body = `${options.includeBeforeAfterTable ? `## Before / After\n\n| Package / Change | Result | Reason | Test |\n|---|---|---|---|\n${rows}\n\n` : ""}Automated security remediation.\n\nSecurity findings before: ${before.total}. After: ${after.total}.\n\nNo auto-merge is performed.`;
      const pr = await options.github.pullRequest(options.repo, branch, options.base, `fix(security): remediate ${options.repo}`, body, options.prMode === "draft");
      pullRequest = pr.data.html_url;
    }

    return { repository: fullName, before, after, changes, tests, commit, pullRequest, status: after.total < before.total ? "fixed" : "partial" };
  } catch (error) {
    return { repository: fullName, before, changes: [], tests: [], status: "failed", error: String(error) };
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}
