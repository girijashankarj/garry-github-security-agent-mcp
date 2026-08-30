import process from "node:process";

const required = ["GITHUB_OWNER", "GITHUB_TOKEN"];
const missing = required.filter((name) => !process.env[name]);

if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(", ")}`);
  console.error("Copy .env.example to .env and fill in real values. Never commit .env.");
  process.exit(1);
}

if (process.env.GITHUB_TOKEN.includes("REPLACE_WITH")) {
  console.error("GITHUB_TOKEN still contains the mock value from .env.example.");
  process.exit(1);
}

const max = Number(process.env.SECURITY_AUDIT_MAX_PARALLEL ?? 10);
if (!Number.isInteger(max) || max < 1 || max > 10) {
  console.error("SECURITY_AUDIT_MAX_PARALLEL must be an integer from 1 to 10.");
  process.exit(1);
}

console.log("Preflight passed: credentials present, mock token rejected, concurrency <= 10.");
