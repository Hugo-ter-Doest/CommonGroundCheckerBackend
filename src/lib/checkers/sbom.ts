import type { CheckResult } from "../types";

const SBOM_EXACT_FILES = [
  "sbom.json",
  "sbom.xml",
  "sbom.yaml",
  "sbom.yml",
  "sbom.spdx",
  "sbom.spdx.json",
  "sbom.cdx.json",
  "bom.json",
  "bom.xml",
  "bom.yaml",
  "bom.yml",
  "cyclonedx.json",
  "cyclonedx.xml",
  "spdx.json",
  "spdx.yaml",
  "spdx.yml",
];

export function checkSbom(tree: string[]): CheckResult {
  const lowerTree = tree.map((p) => p.toLowerCase());

  const found = tree.filter((path, index) => {
    const lower = lowerTree[index];
    const filename = lower.split("/").pop() ?? lower;

    return (
      SBOM_EXACT_FILES.includes(filename) ||
      lower.endsWith(".spdx.json") ||
      lower.endsWith(".cdx.json") ||
      lower.includes("/sbom/") ||
      lower.includes("/cyclonedx/")
    );
  });

  if (found.length === 0) {
    return {
      id: "sbom",
      title: "SBOM (Software Bill of Materials)",
      description:
        "The component should publish an SBOM (e.g. SPDX or CycloneDX) to improve software supply-chain transparency.",
      status: "warn",
      message:
        "No SBOM file found. Consider publishing SPDX or CycloneDX output in the repository.",
      evidence: [],
      referenceUrl: "https://www.cisa.gov/sbom",
    };
  }

  return {
    id: "sbom",
    title: "SBOM (Software Bill of Materials)",
    description:
      "The component should publish an SBOM (e.g. SPDX or CycloneDX) to improve software supply-chain transparency.",
    status: "pass",
    message: `SBOM file(s) found: ${found.slice(0, 5).join(", ")}${found.length > 5 ? ` (+${found.length - 5} more)` : ""}.`,
    evidence: found.slice(0, 10),
    referenceUrl: "https://www.cisa.gov/sbom",
  };
}
