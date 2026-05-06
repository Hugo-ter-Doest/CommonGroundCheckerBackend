import type { CheckResult } from "../types";

const CHANGELOG_PATTERNS = [
  /^changelog(?:\.(?:md|txt|rst))?$/,
  /^news(?:\.(?:md|txt|rst))?$/,
  /^release[-_]notes(?:\.(?:md|txt|rst))?$/,
];

export function checkChangelog(tree: string[]): CheckResult {
  const lowerTree = tree.map((path) => path.toLowerCase());

  const matches = lowerTree.filter((path) => {
    const filename = path.split("/").pop() ?? path;
    return CHANGELOG_PATTERNS.some((pattern) => pattern.test(filename));
  });

  if (matches.length === 0) {
    return {
      id: "changelog",
      title: "Changelog presence",
      description:
        "A changelog file helps stakeholders understand what changed between releases.",
      status: "warn",
      message:
        "No changelog file was found. Add a CHANGELOG.md, NEWS.md, or equivalent to document release history.",
      evidence: [],
      referenceUrl: "https://keepachangelog.com/en/1.0.0/",
    };
  }

  return {
    id: "changelog",
    title: "Changelog presence",
    description:
      "A changelog file helps stakeholders understand what changed between releases.",
    status: "pass",
    message: `Changelog file found: ${matches.slice(0, 5).join(", ")}`,
    evidence: matches.slice(0, 10),
    referenceUrl: "https://keepachangelog.com/en/1.0.0/",
  };
}
