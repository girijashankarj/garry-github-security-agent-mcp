import { spawn } from "node:child_process";
import { access } from "node:fs/promises";

export async function runScript(script: string, args: string[] = [], env: Record<string, string> = {}) {
  await access(script);
  return new Promise<{ exitCode: number; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ exitCode: code ?? 1, stdout, stderr }));
  });
}

export async function runHook(path: string, env: Record<string, string>) {
  return runScript(path, [], env);
}
