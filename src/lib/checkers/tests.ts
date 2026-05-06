import type { CheckResult } from "../types";

const TEST_FILE_PATTERNS = [
  /(^|\/)test\//i,
  /(^|\/)tests\//i,
  /(^|\/)__tests__\//i,
  /\.(test|spec)\.(ts|tsx|js|jsx|py|java|go|rb|php|cs)$/i,
  /(^|\/)pytest\.ini$/i,
  /(^|\/)jest\.config\.(js|cjs|mjs|ts)$/i,
  /(^|\/)vitest\.config\.(js|cjs|mjs|ts)$/i,
  /(^|\/)go\.test$/i,
  /(^|\/)tox\.ini$/i,
];

function isTestPath(path: string): boolean {
  return TEST_FILE_PATTERNS.some((pattern) => pattern.test(path));
}

export function checkTests(tree: string[]): CheckResult {
  const matches = tree.filter((path) => isTestPath(path));

  if (matches.length === 0) {
    return {
      id: "tests",
      title: "Test suite presence",
      description:
        "The repository should include automated tests (unit/integration) or clear test configuration to support reliable software quality.",
      status: "warn",
      message:
        "No obvious test files or test configuration were found. Consider adding automated tests.",
      evidence: [],
      referenceUrl: "https://docs.github.com/en/actions/automating-builds-and-tests",
    };
  }

  return {
    id: "tests",
    title: "Test suite presence",
    description:
      "The repository should include automated tests (unit/integration) or clear test configuration to support reliable software quality.",
    status: "pass",
    message: "Test files or test configuration detected.",
    evidence: matches.slice(0, 10),
    referenceUrl: "https://docs.github.com/en/actions/automating-builds-and-tests",
  };
}
