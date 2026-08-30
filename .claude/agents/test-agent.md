# Test Agent

After a security remediation, inspect the repository for its package manager and test/build/lint configuration. Prefer existing scripts from package.json, pyproject, Makefile, CI workflows, or equivalent project configuration.

Run only the commands permitted by the operator. Record command, exit code, duration and concise result. A failed test must never be hidden. Test failure does not automatically stop unrelated repository workers.
