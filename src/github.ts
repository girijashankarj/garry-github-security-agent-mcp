import { Octokit } from "@octokit/rest";
import type { DependabotAlert, SecurityCounts } from "./types.js";

export class GitHubClient {
  constructor(private readonly octokit: Octokit, private readonly owner: string) {}

  async repositories() {
    const repos = await this.octokit.paginate(this.octokit.rest.repos.listForAuthenticatedUser, {
      affiliation: "owner",
      per_page: 100,
    });
    return repos.filter((repo) => !repo.archived && !repo.fork);
  }

  async dependabot(repo: string): Promise<DependabotAlert[]> {
    return this.octokit.paginate(this.octokit.rest.dependabot.listAlertsForRepo, {
      owner: this.owner,
      repo,
      state: "open",
      per_page: 100,
    }) as Promise<DependabotAlert[]>;
  }

  async counts(repo: string): Promise<SecurityCounts> {
    const alerts = await this.dependabot(repo);
    const dependabot = { critical: 0, high: 0, medium: 0, low: 0 } as SecurityCounts["dependabot"];
    for (const alert of alerts) {
      const severity = alert.security_advisory?.severity;
      if (severity && severity in dependabot) dependabot[severity]++;
    }

    // These endpoints are intentionally isolated because GitHub permissions can differ.
    // A 403/404 becomes zero only for unavailable categories, and is recorded by the caller.
    let codeScanning = 0;
    let secretScanning = 0;
    try {
      const data = await this.octokit.paginate(this.octokit.rest.codeScanning.listAlertsForRepo, {
        owner: this.owner,
        repo,
        state: "open",
        per_page: 100,
      });
      codeScanning = data.length;
    } catch { /* permission or feature unavailable */ }

    try {
      const data = await this.octokit.paginate(this.octokit.rest.secretScanning.listAlertsForRepo, {
        owner: this.owner,
        repo,
        state: "open",
        per_page: 100,
      });
      secretScanning = data.length;
    } catch { /* permission or feature unavailable */ }

    const total = Object.values(dependabot).reduce((a, b) => a + b, 0) + codeScanning + secretScanning;
    return { dependabot, codeScanning, secretScanning, total };
  }

  async createBranch(repo: string, branch: string, base: string) {
    const ref = await this.octokit.rest.git.getRef({ owner: this.owner, repo, ref: `heads/${base}` });
    return this.octokit.rest.git.createRef({ owner: this.owner, repo, ref: `refs/heads/${branch}`, sha: ref.data.object.sha });
  }

  async updateFile(repo: string, path: string, content: string, branch: string, message: string) {
    let sha: string | undefined;
    try {
      const current = await this.octokit.rest.repos.getContent({ owner: this.owner, repo, path, ref: branch });
      if (!Array.isArray(current.data) && "sha" in current.data) sha = current.data.sha;
    } catch (error: any) {
      if (error.status !== 404) throw error;
    }
    return this.octokit.rest.repos.createOrUpdateFileContents({
      owner: this.owner, repo, path, branch, message,
      content: Buffer.from(content).toString("base64"), sha,
    });
  }

  async pullRequest(repo: string, head: string, base: string, title: string, body: string, draft: boolean) {
    return this.octokit.rest.pulls.create({ owner: this.owner, repo, head, base, title, body, draft });
  }
}
