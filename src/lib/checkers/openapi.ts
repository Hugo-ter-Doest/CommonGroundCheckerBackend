import { getFileContent } from "../github";
import type { CheckResult } from "../types";

const OPENAPI_PATTERNS = [
  "openapi.yaml",
  "openapi.yml",
  "openapi.json",
  "swagger.yaml",
  "swagger.yml",
  "swagger.json",
  "api/openapi.yaml",
  "api/openapi.yml",
  "api/openapi.json",
  "api/swagger.yaml",
  "api/swagger.yml",
  "api/swagger.json",
  "docs/openapi.yaml",
  "docs/openapi.yml",
  "docs/swagger.yaml",
  ".openapi.yaml",
];

export async function checkOpenApi(
  owner: string,
  repo: string,
  tree: string[],
  apiSpecificationLocations: string[] = []
): Promise<CheckResult> {
  const lowerTree = tree.map((p) => p.toLowerCase());

  const providedLocations = apiSpecificationLocations
    .map((location) => location.trim())
    .filter(Boolean);

  if (providedLocations.length > 0) {
    const matchedRepositoryPaths = providedLocations
      .filter((location) => !/^https?:\/\//i.test(location))
      .map((location) => location.replace(/^\/+|\/+$/g, ""))
      .map((location) => {
        const index = lowerTree.findIndex((path) => path === location.toLowerCase());
        return index >= 0 ? tree[index] : null;
      })
      .filter((path): path is string => path !== null);

    const providedUrls = providedLocations.filter((location) =>
      /^https?:\/\//i.test(location)
    );

    const resolved = [...new Set([...matchedRepositoryPaths, ...providedUrls])];

    if (resolved.length > 0) {
      return {
        id: "openapi",
        title: "API-first / OpenAPI Specification",
        description:
          "The component must expose a machine-readable OpenAPI (or Swagger) specification.",
        status: "pass",
        message: `Found API specification using provided location(s): ${resolved.join(", ")}.`,
        evidence: resolved,
        referenceUrl:
          "https://commonground.nl/cms/view/54476259/api-designrules",
      };
    }

    return {
      id: "openapi",
      title: "API-first / OpenAPI Specification",
      description:
        "The component must expose a machine-readable OpenAPI (or Swagger) specification.",
      status: "fail",
      message:
        "Provided API specification location(s) could not be resolved. Provide a valid URL or repository-relative OpenAPI path.",
      evidence: providedLocations,
      referenceUrl:
        "https://commonground.nl/cms/view/54476259/api-designrules",
    };
  }

  // Check for exact known filenames
  const found = OPENAPI_PATTERNS.filter((p) => lowerTree.includes(p));

  // Also search for any file ending in openapi.yaml / swagger.json etc.
  const deepMatches = lowerTree.filter(
    (p) =>
      p.endsWith("/openapi.yaml") ||
      p.endsWith("/openapi.yml") ||
      p.endsWith("/openapi.json") ||
      p.endsWith("/swagger.yaml") ||
      p.endsWith("/swagger.yml") ||
      p.endsWith("/swagger.json")
  );

  const allFound = [...new Set([...found, ...deepMatches])];

  if (allFound.length === 0) {
    return {
      id: "openapi",
      title: "API-first / OpenAPI Specification",
      description:
        "The component must expose a machine-readable OpenAPI (or Swagger) specification.",
      status: "fail",
      message:
        "No OpenAPI / Swagger specification file was found in the repository.",
      evidence: [],
      referenceUrl:
        "https://commonground.nl/cms/view/54476259/api-designrules",
    };
  }

  // Optionally peek into the found file to confirm it has at least an 'info' section
  const actualPath =
    tree.find((p) => p.toLowerCase() === allFound[0]) ?? allFound[0];
  const content = await getFileContent(owner, repo, actualPath);
  const hasInfo = content
    ? content.includes("info:") || content.includes('"info"')
    : true;

  return {
    id: "openapi",
    title: "API-first / OpenAPI Specification",
    description:
      "The component must expose a machine-readable OpenAPI (or Swagger) specification.",
    status: hasInfo ? "pass" : "warn",
    message: hasInfo
      ? `Found valid OpenAPI specification at ${allFound.join(", ")}.`
      : `Found a spec file (${allFound[0]}) but it does not appear to contain an 'info' section.`,
    evidence: [
      `API specification was auto-discovered by the checker: ${allFound[0]}`,
      ...allFound,
    ],
    referenceUrl: "https://commonground.nl/cms/view/54476259/api-designrules",
  };
}
