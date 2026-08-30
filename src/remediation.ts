import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { DependabotAlert } from "./types.js";

const exec = promisify(execFile);

export interface RemediationPlan {
  packageName: string;
  manifest: string;
  vulnerableRange: string;
  patchedVersion: string;
  command: string[];
}

/** Builds a conservative npm remediation plan from GitHub's first patched version. */
export function planNpm(alert: DependabotAlert): RemediationPlan | null {
  if (alert.dependency?.package?.ecosystem !== "npm") return null;
  const packageName = alert.dependency.package.name;
  const patchedVersion = alert.security_vulnerability?.first_patched_version?.identifier;
  const manifest = alert.dependency.manifest_path;
  if (!packageName || !patchedVersion || !manifest) return null;

  return {
    packageName,
    manifest,
    vulnerableRange: alert.security_vulnerability?.vulnerable_version_range ?? "unknown",
    patchedVersion,
    command: ["npm", "install", `${packageName}@${patchedVersion}`, "--save-exact"],
  };
}

export async function runCommand(command: string, args: string[], cwd: string) {
  try {
    const result = await exec(command, args, { cwd, maxBuffer: 8 * 1024 * 1024 });
    return { command: [command, ...args].join(" "), exitCode: 0, output: `${result.stdout}${result.stderr}` };
  } catch (error: any) {
    return { command: [command, ...args].join(" "), exitCode: error.code ?? 1, output: `${error.stdout ?? ""}${error.stderr ?? ""}${error.message ?? ""}` };
  }
}

export async function applyNpmPlan(repoDir: string, plan: RemediationPlan) {
  // execFile avoids shell interpolation. The version is sourced from GitHub's patched-version field.
  return runCommand("npm", ["install", `${plan.packageName}@${plan.patchedVersion}`, "--save-exact"], repoDir);
}
