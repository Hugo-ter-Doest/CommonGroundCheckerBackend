import type { CheckResult } from "../types";

const DOCUMENTATION_PATTERNS = [
  "readme.md",
  "readme.rst",
  "docs/index.md",
  "docs/readme.md",
  "documentation/index.md",
  "mkdocs.yml",
  "docusaurus.config.js",
  "docusaurus.config.ts",
  "swagger-ui/index.html",
  "docs/",
];

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function isLikelyDocsUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.includes("docs") ||
    lower.includes("documentation") ||
    lower.includes("readthedocs") ||
    lower.includes("swagger") ||
    lower.includes("redoc")
  );
}

export function checkDocumentation(
  tree: string[],
  documentationLocations: string[] = []
): CheckResult {
  const lowerTree = tree.map((p) => p.toLowerCase());

  const internalMatches = tree.filter((path, index) => {
    const lower = lowerTree[index];
    const filename = lower.split("/").pop() ?? lower;

    return (
      DOCUMENTATION_PATTERNS.includes(lower) ||
      DOCUMENTATION_PATTERNS.includes(filename) ||
      lower.startsWith("docs/") ||
      lower.includes("/docs/") ||
      lower.includes("/documentation/") ||
      lower.endsWith("/mkdocs.yml")
    );
  });

  const externalDocs = documentationLocations
    .map((url) => normalizeUrl(url))
    .filter(Boolean);

  if (internalMatches.length === 0 && externalDocs.length === 0) {
    return {
      id: "documentation",
      title: "Documentation Availability",
      description:
        "The component should provide accessible user or technical documentation in the repository or via a dedicated docs site.",
      status: "warn",
      message:
        "No clear documentation files or external documentation URL were found.",
      evidence: [],
      referenceUrl: "https://www.irealisatie.nl/kennis/common-ground",
    };
  }

  if (internalMatches.length === 0 && externalDocs.length > 0) {
    const nonStandardDocs = externalDocs.filter((url) => !isLikelyDocsUrl(url));
    return {
      id: "documentation",
      title: "Documentation Availability",
      description:
        "The component should provide accessible user or technical documentation in the repository or via a dedicated docs site.",
      status: nonStandardDocs.length > 0 ? "warn" : "pass",
      message:
        nonStandardDocs.length > 0
          ? "External documentation URL provided, but it does not look like a documentation page. Please verify the URL."
          : "Documentation provided via external documentation site.",
      evidence: externalDocs,
      referenceUrl: "https://www.irealisatie.nl/kennis/common-ground",
    };
  }

  return {
    id: "documentation",
    title: "Documentation Availability",
    description:
      "The component should provide accessible user or technical documentation in the repository or via a dedicated docs site.",
    status: "pass",
    message:
      externalDocs.length > 0
        ? "Documentation found in repository and external documentation site configured."
        : "Documentation files found in repository.",
    evidence: [...internalMatches.slice(0, 8), ...externalDocs].slice(0, 10),
    referenceUrl: "https://www.irealisatie.nl/kennis/common-ground",
  };
}
