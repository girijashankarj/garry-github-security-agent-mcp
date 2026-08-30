import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const cwd = process.argv[2];
if (!cwd) throw new Error("Usage: node scripts/post-change-verify.mjs <repo-directory>");

const commands = [
  ["npm", ["test", "--if-present"]],
  ["npm", ["run", "build", "--if-present"]],
  ["npm", ["run", "lint", "--if-present"]],
];

const results = [];
for (const [command, args] of commands) {
  try {
    const result = await exec(command, args, { cwd, timeout: 10 * 60_000, maxBuffer: 8 * 1024 * 1024 });
    results.push({ command: [command, ...args].join(" "), status: "passed", exitCode: 0, output: `${result.stdout}${result.stderr}`.slice(-4000) });
  } catch (error) {
    results.push({ command: [command, ...args].join(" "), status: "failed", exitCode: error.code ?? 1, output: `${error.stdout ?? ""}${error.stderr ?? ""}`.slice(-4000) });
  }
}

console.log(JSON.stringify(results, null, 2));
if (results.some((r) => r.status === "failed")) process.exit(1);
