#!/usr/bin/env node
/** Deterministic repository remediation entrypoint. Claude supplies reasoning; this script is the mutation boundary. */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const required = ['GITHUB_OWNER', 'GITHUB_TOKEN', 'SECURITY_AUDIT_REPOSITORY', 'SECURITY_AUDIT_BEFORE_REPORT'];
for (const name of required) if (!process.env[name]) throw new Error(`${name} is required`);

const [owner, repo] = process.env.SECURITY_AUDIT_REPOSITORY.split('/');
if (!owner || !repo || owner !== process.env.GITHUB_OWNER) throw new Error('SECURITY_AUDIT_REPOSITORY must be owner/name for GITHUB_OWNER');
const base = process.env.SECURITY_AUDIT_BASE_BRANCH ?? 'main';
const fixMode = process.env.SECURITY_AUDIT_FIX_MODE ?? 'pr';
const prMode = process.env.SECURITY_AUDIT_PR_MODE ?? 'draft';
const commitMessage = process.env.SECURITY_AUDIT_COMMIT_MESSAGE ?? 'fix(security): remediate vulnerabilities';
const runTests = process.env.SECURITY_AUDIT_RUN_TESTS !== 'false';

function command(file, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { cwd, shell: false, env: { ...process.env, GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'http.extraheader', GIT_CONFIG_VALUE_0: `Authorization: Bearer ${process.env.GITHUB_TOKEN}` }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', d => stdout += d); child.stderr.on('data', d => stderr += d);
    child.on('error', reject); child.on('close', code => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

async function api(path, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, { ...options, headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${process.env.GITHUB_TOKEN}`, 'x-github-api-version': '2022-11-28', ...(options.headers ?? {}) } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`);
  return response.json();
}

// Fail closed before any mutation. This is the same lifecycle invariant used by the Claude hook.
const hook = await command('bash', ['.claude/hooks/pre-change-audit.sh'], process.cwd());
if (hook.code !== 0) throw new Error(`Pre-change hook failed: ${hook.stderr || hook.stdout}`);

const alerts = await api(`/repos/${owner}/${repo}/dependabot/alerts?state=open&per_page=100`);
const npmAlerts = alerts.filter(a => a.dependency?.package?.ecosystem === 'npm' && a.security_vulnerability?.first_patched_version?.identifier);
if (!npmAlerts.length) {
  console.log(JSON.stringify({ repository: `${owner}/${repo}`, status: 'skipped', reason: 'No supported npm Dependabot remediation found' }));
  process.exit(0);
}

const parent = await mkdtemp(join(tmpdir(), 'github-security-audit-'));
const cloneDir = join(parent, repo);
const branch = `security-audit/${Date.now()}-${repo}`;
try {
  const clone = await command('git', ['clone', '--depth', '1', '--branch', base, `https://github.com/${owner}/${repo}.git`, cloneDir], parent);
  if (clone.code !== 0) throw new Error(clone.stderr.slice(-4000));
  if (fixMode === 'pr') {
    const switched = await command('git', ['switch', '-c', branch], cloneDir);
    if (switched.code !== 0) throw new Error(switched.stderr.slice(-4000));
  }

  const changes = [];
  for (const alert of npmAlerts) {
    const name = alert.dependency.package.name;
    const patched = alert.security_vulnerability.first_patched_version.identifier;
    const result = await command('npm', ['install', `${name}@${patched}`, '--save-exact'], cloneDir);
    if (result.code !== 0) throw new Error(`npm remediation failed for ${name}: ${result.stderr.slice(-4000)}`);
    changes.push({ packageName: name, before: alert.security_vulnerability.vulnerable_version_range ?? 'vulnerable', after: patched, reason: alert.security_advisory?.ghsa_id ?? 'Dependabot security advisory' });
  }

  const verify = await command('node', [join(process.cwd(), 'scripts', 'post-change-verify.mjs'), cloneDir], process.cwd());
  let tests = [];
  try { tests = JSON.parse(verify.stdout); } catch { tests = [{ command: 'post-change-verify', exitCode: verify.code, output: verify.stdout.slice(-4000) }]; }
  if (runTests && verify.code !== 0) {
    console.log(JSON.stringify({ repository: `${owner}/${repo}`, status: 'failed', changes, tests, error: 'Post-change verification failed' }));
    process.exit(2);
  }

  const diff = await command('git', ['status', '--short'], cloneDir);
  if (!diff.stdout.trim()) {
    console.log(JSON.stringify({ repository: `${owner}/${repo}`, status: 'skipped', changes, tests, reason: 'No working-tree changes' }));
    process.exit(0);
  }

  for (const [key, value] of [['user.name', 'github-security-audit[bot]'], ['user.email', 'github-actions[bot]@users.noreply.github.com']]) await command('git', ['config', key, value], cloneDir);
  const added = await command('git', ['add', '-A'], cloneDir);
  if (added.code !== 0) throw new Error(added.stderr);
  const committed = await command('git', ['commit', '-m', commitMessage], cloneDir);
  if (committed.code !== 0) throw new Error(committed.stderr);
  const pushed = await command('git', ['push', 'origin', fixMode === 'pr' ? `HEAD:${branch}` : `HEAD:${base}`], cloneDir);
  if (pushed.code !== 0) throw new Error(pushed.stderr.slice(-4000));

  const commit = (await command('git', ['rev-parse', 'HEAD'], cloneDir)).stdout.trim();
  let pullRequest;
  if (fixMode === 'pr') {
    const table = changes.map(c => `| ${c.packageName} | ${c.before} | ${c.after} | ${c.reason} |`).join('\n');
    const body = `## Security remediation\n\n| Package | Before | After | Reason |\n|---|---|---|---|\n${table}\n\n## Verification\n\n${tests.map(t => `- ${t.status ?? (t.exitCode === 0 ? 'passed' : 'failed')}: ${t.command}`).join('\n')}\n\nNo automatic merge is performed.`;
    const pr = await api(`/repos/${owner}/${repo}/pulls`, { method: 'POST', body: JSON.stringify({ title: `fix(security): remediate ${repo}`, head: branch, base, body, draft: prMode === 'draft' }), headers: { 'content-type': 'application/json' } });
    pullRequest = pr.html_url;
  }
  console.log(JSON.stringify({ repository: `${owner}/${repo}`, status: 'fixed', changes, tests, commit, pullRequest }));
} finally {
  await rm(parent, { recursive: true, force: true });
}
