import { describe, expect, it } from "vitest";
import { planNpm } from "./remediation.js";

describe("npm remediation planning", () => {
  it("uses GitHub's first patched version", () => {
    const plan = planNpm({
      number: 1,
      state: "open",
      dependency: {
        package: { ecosystem: "npm", name: "example-package" },
        manifest_path: "package.json"
      },
      security_advisory: { ghsa_id: "GHSA-test", severity: "high" },
      security_vulnerability: {
        vulnerable_version_range: "<2.0.3",
        first_patched_version: { identifier: "2.0.3" }
      }
    });

    expect(plan?.patchedVersion).toBe("2.0.3");
    expect(plan?.command).toEqual(["npm", "install", "example-package@2.0.3", "--save-exact"]);
  });

  it("does not create an npm plan for another ecosystem", () => {
    expect(planNpm({
      number: 2,
      state: "open",
      dependency: { package: { ecosystem: "pip", name: "example" }, manifest_path: "requirements.txt" },
      security_vulnerability: { first_patched_version: { identifier: "2.0.0" } }
    })).toBeNull();
  });
});
