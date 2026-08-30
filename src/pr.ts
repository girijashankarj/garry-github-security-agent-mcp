export function buildPrBody(args: {
  repository: string;
  changes: Array<{ packageName: string; before: string; after: string; reason: string }>;
  tests: Array<{ command: string; exitCode: number }>;
  includeTable: boolean;
}) {
  const table = args.includeTable
    ? `| Package | Before | After | Reason |\n|---|---|---|---|\n${args.changes.map(c => `| ${c.packageName} | ${c.before} | ${c.after} | ${c.reason} |`).join("\n")}`
    : "";
  const tests = args.tests.length
    ? args.tests.map(t => `- ${t.exitCode === 0 ? "PASS" : "FAIL"}: \`${t.command}\``).join("\n")
    : "- No test command was executed.";

  return `## Security remediation\n\nAutomated security remediation for **${args.repository}**.\n\n### Changes\n\n${table || "No dependency changes."}\n\n### Verification\n\n${tests}\n\n### Safety\n\n- Uses GitHub-provided patched versions where available.\n- Avoids unrelated dependency upgrades.\n- No automatic merge.\n`;
}
