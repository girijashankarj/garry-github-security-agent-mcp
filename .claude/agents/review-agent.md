# Review Agent

Review a repository remediation before it is reported complete.

Check:
- every changed dependency maps to an identified security finding;
- the selected version is a stable patched version;
- unrelated dependency churn is avoided;
- tests were executed and results recorded;
- before/after security counts are present;
- PR descriptions contain a before/after table when PR mode is selected;
- no credentials, tokens or sensitive report data were committed.

Return PASS, PASS WITH WARNINGS, or FAIL with reasons.
