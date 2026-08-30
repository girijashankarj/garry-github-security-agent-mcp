# Agent Model

## Orchestrator

Responsible for preflight questions, repository discovery, before-report creation, batch scheduling and final report aggregation.

## Repository Security Agent

One worker per repository. It owns discovery, dependency analysis, remediation, verification and commit/PR preparation for that repository only.

## Batch controller

Uses a hard concurrency ceiling of 10. It starts up to ten workers, waits until all workers in the batch settle, records their results, then starts the next batch.

## Test agent

Determines test/build/lint commands from package managers and repository configuration. Commands are executed only after a change and their output/status is recorded.

## Review agent

Checks that the proposed change addresses the original alert, avoids unnecessary dependency churn, and that PR descriptions contain the required before/after table.

Agents must not silently change operator choices.
