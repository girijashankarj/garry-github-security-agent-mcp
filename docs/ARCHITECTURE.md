# Architecture

## Goals

Provide a safe, repeatable security-remediation workflow that can be used by an individual developer or a community contributor.

## Execution model

The orchestrator performs discovery and creates the before-action report. Repository workers then operate independently.

```text
                 Orchestrator
                      │
          ┌───────────┴───────────┐
          │ security discovery     │
          │ before report          │
          │ operator approval      │
          └───────────┬───────────┘
                      │
                 batch scheduler
                  max = 10
          ┌─────┬─────┬─────┬─────┐
          ▼     ▼     ▼     ▼     ▼
         Repo  Repo  Repo  Repo  ... Repo
          │     │     │     │
          └─────┴─────┴─────┴──────┘
                      │
               wait for batch
                      │
                 next 10 repos
                      │
                      ▼
                after-action report
```

A worker must not modify another repository. Worker failures are recorded and do not cancel the remaining workers.

## Per-repository lifecycle

1. Fetch repository metadata and security alerts.
2. Inspect manifests and lockfiles.
3. Classify each finding as direct/transitive and production/development where data permits.
4. Determine the smallest stable patched version.
5. Apply only approved remediation.
6. Detect and run the repository's relevant test/build/lint commands.
7. Verify the post-change security state where API permissions permit.
8. Commit directly or create a PR according to operator choice.
9. Store results in the final report.

## PR safety

Default behaviour is draft PR and no auto-merge. The operator can explicitly choose direct default-branch changes or ready-for-review PRs.

Every remediation PR should contain a before/after table:

| Package | Before | After | Reason | Test |
|---|---:|---:|---|---|
| example | 1.0.0 | 1.0.3 | Security patch | npm test |

## Concurrency

The scheduler uses a bounded pool of 10 repository workers. It waits for the current batch to complete before starting the next batch. This prevents a large account from creating an uncontrolled request or CI storm.

## Reports

Each run creates a timestamped before-action and after-action report under `temp/security-count/<YYYY-MM-DD>/`. The directory is ignored by Git.

Reports are JSON-first so they can later be rendered into Markdown, HTML or CSV without losing structured data.
