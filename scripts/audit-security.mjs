#!/usr/bin/env node
/** Deterministic baseline collector. Claude should consume this output, not invent security counts. */
const owner = process.env.GITHUB_OWNER;
const token = process.env.GITHUB_TOKEN;
if (!owner || !token) throw new Error('GITHUB_OWNER and GITHUB_TOKEN are required');

const headers = {
  accept: 'application/vnd.github+json',
  authorization: `Bearer ${token}`,
  'x-github-api-version': '2022-11-28',
  'user-agent': 'github-security-audit'
};

async function api(path) {
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
  return res.json();
}

const repos = await api('/user/repos?affiliation=owner&per_page=100');
const selected = repos.filter(r => !r.archived && !r.fork);
const output = [];

for (const repo of selected) {
  const base = `/repos/${owner}/${repo.name}`;
  const result = { repository: repo.full_name, defaultBranch: repo.default_branch, categories: {}, alerts: [] };
  try {
    const alerts = await api(`${base}/dependabot/alerts?state=open&per_page=100`);
    result.categories.dependabot = alerts.length;
    result.alerts.push(...alerts.map(a => ({ category:'dependabot', severity:a.security_advisory?.severity ?? 'unknown', package:a.dependency?.package?.name, ghsa:a.security_advisory?.ghsa_id, cve:a.security_advisory?.cve_id, patched:a.security_vulnerability?.first_patched_version?.identifier })));
  } catch (e) { result.categories.dependabot = null; result.errors = [...(result.errors ?? []), `dependabot: ${e.message}`]; }
  try { result.categories.codeScanning = (await api(`${base}/code-scanning/alerts?state=open&per_page=100`)).length; }
  catch (e) { result.categories.codeScanning = null; result.errors = [...(result.errors ?? []), `code-scanning: ${e.message}`]; }
  try { result.categories.secretScanning = (await api(`${base}/secret-scanning/alerts?state=open&per_page=100`)).length; }
  catch (e) { result.categories.secretScanning = null; result.errors = [...(result.errors ?? []), `secret-scanning: ${e.message}`]; }
  output.push(result);
}

console.log(JSON.stringify({ generatedAt:new Date().toISOString(), owner, repositories:output }, null, 2));
