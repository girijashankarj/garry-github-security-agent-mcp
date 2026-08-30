#!/usr/bin/env node
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const required = [
  '.env.example', '.gitignore', 'README.md', 'package.json', 'tsconfig.json',
  'config/defaults.yaml',
  '.claude/CLAUDE.md', '.claude/settings.json', '.claude/hooks/pre-change-audit.sh',
  '.claude/skills/security-audit/SKILL.md',
  '.claude/agents/security-repository-agent.md', '.claude/agents/test-agent.md', '.claude/agents/review-agent.md',
  '.cursor/rules/security-audit.mdc',
  '.github/workflows/claude-security-audit.yml',
  'scripts/preflight.mjs', 'scripts/audit-security.mjs', 'scripts/remediate-repo.mjs',
  'scripts/verify-repo.mjs', 'scripts/post-change-verify.mjs', 'scripts/finalize-report.mjs',
  'src/index.ts', 'src/orchestrator.ts', 'src/github.ts', 'src/runtime.ts', 'src/report.ts', 'src/remediation.ts', 'src/pr.ts', 'src/types.ts', 'src/worker.ts',
  'src/mcp-server.ts'
];
const missing = [];
for (const file of required) {
  try { await access(resolve(root, file)); }
  catch { missing.push(file); }
}
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const expectedScripts = ['audit', 'mcp', 'mcp:http', 'build', 'test'];
const missingScripts = expectedScripts.filter(s => !pkg.scripts?.[s]);
const gitignore = await readFile(resolve(root, '.gitignore'), 'utf8');
const envIgnored = /(^|\n)\.env(\.|\n|$)/m.test(gitignore) && /(^|\n)\.env\n/m.test(gitignore);
const reportIgnored = /(^|\n)temp\//m.test(gitignore);
const failures = [...missing.map(x => `missing: ${x}`), ...missingScripts.map(x => `package script missing: ${x}`)];
if (!envIgnored) failures.push('security: .env is not clearly ignored');
if (!reportIgnored) failures.push('security: temp/ is not ignored');
console.log(JSON.stringify({ requiredFiles: required.length, missing, missingScripts, envIgnored, reportIgnored, status: failures.length ? 'failed' : 'passed', failures }, null, 2));
if (failures.length) process.exit(1);
