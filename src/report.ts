import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AuditReport } from "./types.js";

function stamp(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const d = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const t = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return { d, t, s: String(date.getMilliseconds()).padStart(3, "0") };
}

export async function writeReport(report: AuditReport, root = "temp/security-count") {
  const { d, t, s } = stamp();
  const dir = join(root, d);
  await mkdir(dir, { recursive: true });
  const path = join(dir, `report-${d}-${t}-${s}.json`);
  await writeFile(path, JSON.stringify(report, null, 2), "utf8");
  return path;
}
