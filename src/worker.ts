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

async function clone(owner: string, repo: string, base: string, dir: string) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is required");
  // Credential is supplied via an environment-expanded git config header, not command arguments.
  await exec("git", ["-c", `http.extraheader=Authorization: Bearer ${token}`, "clone", "--depth", "1", "--branch", base, `https://github.com/${owner}/${repo}.git`, dir], {
    timeout: 120_000,
    maxBuffer: 4 * 1024 * 1024,
  });
}

export async function processRepository(options: WorkerOptions): Promise<RepositoryResult> {
  const before = await options.github.counts(options.repo);
  const alerts = await options.github.dependabot(options.repo);
  const npmPlans = alerts.map(planNpm).filter((x): x is NonNullable<typeof x> => Boolean(x));
  if (npmPlans.length === 0) return { repository: `${options.owner}/${options.repo}`, before, changes: [], tests: [], status: "skipped" };

  const dir = await mkdtemp(join(tmpdir(), "github-security-audit-"));
  try {
    await clone(options.owner, options.repo, options.base, dir);
    const changes: string[] = [];
    const tests: RepositoryResult["tests"] = [];

    for (const plan of npmPlans) {
      const result = await applyNpmPlan(dir, plan);
      if (result.exitCode !== 0) {
        return { repository: `${options.owner}/${options.repo}`, before, changes, tests, status: "failed", error: result.output.slice(-4000) };
      }
      changes.push(`${plan.packageName}: ${plan.vulnerableRange} -> ${plan.patchedVersion}`);
    }

    if (options.runTests) {
      const result = await runCommand("npm", ["test", "--if-present"], dir);
      tests.push({ command: result.command, exitCode: result.exitCode, output: result.output.slice(-4000) });
      if (result.exitCode !== 0) return { repository: `${options.owner}/${options.repo}`, before, changes, tests, status: "failed", error: "Test suite failed" };
    }

    const diff = await runCommand("git", ["diff", "--stat"], dir);
    changes.push(diff.output.trim());
    return { repository: `${options.owner}/${options.repo}`, before, changes, tests, status: "fixed" };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
