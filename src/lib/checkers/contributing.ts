import type { CheckResult } from "../types";

const CONTRIBUTING_FILES = [
  "contributing.md",
  "contributing.rst",
  "contributing.txt",
  ".github/contributing.md",
  "docs/contributing.md",
];

export function checkContributing(tree: string[]): CheckResult {
  const lowerTree = tree.map((path) => path.toLowerCase());

  const matches = tree.filter((path, index) => {
    const lower = lowerTree[index];
    const filename = lower.split("/").pop() ?? lower;

    return (
      CONTRIBUTING_FILES.includes(lower) ||
      CONTRIBUTING_FILES.includes(filename) ||
      lower.endsWith("/contributing.md")
    );
  });

  if (matches.length === 0) {
    return {
      id: "contributing",
      title: "Contributing guide",
      description:
        "A CONTRIBUTING file should explain how external developers can propose changes, run checks, and submit pull requests.",
      status: "warn",
      message:
        "No CONTRIBUTING guide found. Add CONTRIBUTING.md to make contribution workflows clear.",
      evidence: [],
      referenceUrl: "https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/setting-guidelines-for-repository-contributors",
    };
  }

  return {
    id: "contributing",
    title: "Contributing guide",
    description:
      "A CONTRIBUTING file should explain how external developers can propose changes, run checks, and submit pull requests.",
    status: "pass",
    message: "Contributing guide found.",
    evidence: matches.slice(0, 10),
    referenceUrl: "https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/setting-guidelines-for-repository-contributors",
  };
}
