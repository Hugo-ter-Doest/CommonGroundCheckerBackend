import type { CheckResult } from "../types";

const SEMVER_REGEX = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*))?(?:\+([\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*))?$/;

export function checkSemver(version: string | null): CheckResult {
  if (!version) {
    return {
      id: "semver",
      title: "Semantic Versioning",
      description:
        "The repository should publish versions that follow semantic versioning (MAJOR.MINOR.PATCH).",
      status: "warn",
      message:
        "No version information found. Add release tags or manifest version fields to enable semantic-version checks.",
      evidence: [],
      referenceUrl: "https://semver.org/",
    };
  }

  if (SEMVER_REGEX.test(version.trim())) {
    return {
      id: "semver",
      title: "Semantic Versioning",
      description:
        "The repository should publish versions that follow semantic versioning (MAJOR.MINOR.PATCH).",
      status: "pass",
      message: `Version \"${version}\" follows semantic versioning.`,
      evidence: [version],
      referenceUrl: "https://semver.org/",
    };
  }

  return {
    id: "semver",
    title: "Semantic Versioning",
    description:
      "The repository should publish versions that follow semantic versioning (MAJOR.MINOR.PATCH).",
    status: "fail",
    message: `Version \"${version}\" does not follow semantic versioning.`,
    evidence: [version],
    referenceUrl: "https://semver.org/",
  };
}
