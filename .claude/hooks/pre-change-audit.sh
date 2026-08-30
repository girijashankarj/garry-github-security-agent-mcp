#!/usr/bin/env bash
set -euo pipefail

# Hook contract: the orchestrator must create a before-action report before mutations.
# This hook intentionally fails closed when the report path is missing.
REPORT_PATH="${SECURITY_AUDIT_BEFORE_REPORT:-}"

if [[ -z "$REPORT_PATH" || ! -f "$REPORT_PATH" ]]; then
  echo "ERROR: before-action security report is required before repository changes." >&2
  exit 1
fi
