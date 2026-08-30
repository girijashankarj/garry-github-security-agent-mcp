#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${1:?repository directory is required}"
node scripts/post-change-verify.mjs "$REPO_DIR"
