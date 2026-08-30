# Operational Workflow

## Phase 0: Before action

Create `temp/security-count/<YYYY-MM-DD>/report-<YYYY-MM-DD>-<HHmmss>-<sec>.json` before any repository mutation. Record the operator choices and security counts by category.

## Phase 1: Questions

Ask the operator the six preflight questions defined in `CLAUDE.md`.

## Phase 2: Discovery

Resolve the requested repository set and collect the current security state.

## Phase 3: Bounded parallel remediation

Partition repositories into batches of ten. Spawn one repository security worker per repository. Do not exceed ten active workers. Wait for every worker in the current batch to finish before launching the next batch.

## Phase 4: Verification

Each worker runs the permitted test suite and records the result. Security state should be checked again after changes.

## Phase 5: Delivery

For direct mode, commit to the selected default branch using the operator's message format. For PR mode, create the requested draft/ready PR. The PR description must include a before/after table.

## Phase 6: After action

Create a second timestamped report in the same date folder. It must include totals, per-repository outcomes, changes, tests, commit/PR references and unresolved findings.
