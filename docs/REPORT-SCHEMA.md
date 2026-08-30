# Report Schema

Each run has a before-action and after-action JSON report.

```json
{
  "run": {
    "startedAt": "ISO-8601",
    "completedAt": "ISO-8601",
    "operator": {},
    "scope": "all|selected"
  },
  "summary": {
    "repositories": 0,
    "critical": 0,
    "high": 0,
    "medium": 0,
    "low": 0,
    "unresolved": 0
  },
  "categories": {
    "dependabot": {},
    "codeScanning": {},
    "secretScanning": {}
  },
  "repositories": [
    {
      "name": "owner/repo",
      "before": {},
      "after": {},
      "changes": [],
      "tests": [],
      "commit": null,
      "pullRequest": null,
      "status": "fixed|partial|failed|skipped"
    }
  ]
}
```

The before report must be written before mutations. The after report must include the resulting state and unresolved findings.
