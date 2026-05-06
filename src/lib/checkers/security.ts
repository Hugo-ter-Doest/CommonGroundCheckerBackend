import type { CheckResult } from "../types";

const SECURITY_FILES = [
  "security.md",
  ".github/security.md",
  "docs/security.md",
  "security.txt",
  "security.rst",
];

export function checkSecurity(tree: string[]): CheckResult {
  const lowerTree = tree.map((path) => path.toLowerCase());

  const matches = tree.filter((path, index) => {
    const lower = lowerTree[index];
    const filename = lower.split("/").pop() ?? lower;

    return (
      SECURITY_FILES.includes(lower) ||
      SECURITY_FILES.includes(filename) ||
      lower.endsWith("/security.md")
    );
  });

  if (matches.length === 0) {
    return {
      id: "security",
      title: "Security policy",
      description:
        "A SECURITY file should explain how to report vulnerabilities privately, which versions are supported, and how security disclosures are handled.",
      status: "warn",
      message:
        "No SECURITY.md file found. Add one to document responsible vulnerability disclosure and supported versions.",
      evidence: [],
      referenceUrl:
        "https://docs.github.com/en/code-security/getting-started/adding-a-security-policy-to-your-repository",
    };
  }

  return {
    id: "security",
    title: "Security policy",
    description:
      "A SECURITY file should explain how to report vulnerabilities privately, which versions are supported, and how security disclosures are handled.",
    status: "pass",
    message: "Security policy file found.",
    evidence: matches.slice(0, 10),
    referenceUrl:
      "https://docs.github.com/en/code-security/getting-started/adding-a-security-policy-to-your-repository",
  };
}
