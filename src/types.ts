export type FixMode = "default-branch" | "pr";
export type PrMode = "draft" | "ready";
export type Severity = "critical" | "high" | "medium" | "low";

export interface OperatorChoices {
  scope: "all" | "selected";
  repositories: string[];
  fixMode: FixMode;
  prMode: PrMode;
  commitMessage: string;
  includeBeforeAfterTable: boolean;
  runTests: boolean;
}

export interface SecurityCounts {
  dependabot: Record<Severity, number>;
  codeScanning: number;
  secretScanning: number;
  total: number;
}

export interface DependabotAlert {
  number: number;
  state: string;
  dependency?: {
    package?: { ecosystem?: string; name?: string };
    manifest_path?: string;
    scope?: string;
  };
  security_advisory?: {
    ghsa_id?: string;
    cve_id?: string | null;
    summary?: string;
    severity?: Severity;
  };
  security_vulnerability?: {
    vulnerable_version_range?: string;
    first_patched_version?: { identifier?: string } | null;
  };
}

export interface RepositoryResult {
  repository: string;
  before: SecurityCounts;
  after?: SecurityCounts;
  changes: string[];
  tests: { command: string; exitCode: number; output: string }[];
  commit?: string;
  pullRequest?: string;
  status: "fixed" | "partial" | "failed" | "skipped";
  error?: string;
}

export interface AuditReport {
  run: {
    startedAt: string;
    completedAt?: string;
    operator: Omit<OperatorChoices, "commitMessage"> & { commitMessage: string };
    scope: string;
  };
  summary: {
    repositories: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    unresolved: number;
  };
  categories: SecurityCounts;
  repositories: RepositoryResult[];
}
