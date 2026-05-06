import type { CheckResult } from "../types";

const CODE_OF_CONDUCT_FILES = [
  "code_of_conduct.md",
  "code-of-conduct.md",
  "codeofconduct.md",
  "code_of_conduct.rst",
  ".github/code_of_conduct.md",
  "docs/code_of_conduct.md",
];

export function checkCodeOfConduct(tree: string[]): CheckResult {
  const lowerTree = tree.map((path) => path.toLowerCase());

  const matches = tree.filter((path, index) => {
    const lower = lowerTree[index];
    const filename = lower.split("/").pop() ?? lower;

    return (
      CODE_OF_CONDUCT_FILES.includes(lower) ||
      CODE_OF_CONDUCT_FILES.includes(filename) ||
      lower.endsWith("/code_of_conduct.md") ||
      lower.endsWith("/code-of-conduct.md")
    );
  });

  if (matches.length === 0) {
    return {
      id: "codeofconduct",
      title: "Code of Conduct",
      description:
        "A Code of Conduct should define expected behavior and reporting channels to maintain a safe and inclusive contribution environment.",
      status: "warn",
      message:
        "No Code of Conduct file found. Add CODE_OF_CONDUCT.md to clarify community behavior standards.",
      evidence: [],
      referenceUrl:
        "https://opensource.guide/code-of-conduct/",
    };
  }

  return {
    id: "codeofconduct",
    title: "Code of Conduct",
    description:
      "A Code of Conduct should define expected behavior and reporting channels to maintain a safe and inclusive contribution environment.",
    status: "pass",
    message: "Code of Conduct file found.",
    evidence: matches.slice(0, 10),
    referenceUrl: "https://opensource.guide/code-of-conduct/",
  };
}
