import type { CheckResult } from "../types";

function normalizeDockerLocations(dockerLocations: string[] = []): string[] {
  return dockerLocations.map((value) => value.trim()).filter(Boolean);
}

export function checkDockerImage(dockerLocations: string[] = []): CheckResult {
  const locations = normalizeDockerLocations(dockerLocations);

  if (locations.length === 0) {
    return {
      id: "dockerimage",
      title: "Available Docker image",
      description:
        "A published Docker image location should be available so deployments can pull a ready-to-run container image.",
      status: "fail",
      message:
        "No Docker image location was provided. Add a registry/repository URL for the published image.",
      evidence: [],
      referenceUrl: "https://commonground.nl/cms/view/54476272/haven",
    };
  }

  return {
    id: "dockerimage",
    title: "Available Docker image",
    description:
      "A published Docker image location should be available so deployments can pull a ready-to-run container image.",
    status: "pass",
    message: "Docker image location provided.",
    evidence: locations,
    referenceUrl: "https://commonground.nl/cms/view/54476272/haven",
  };
}
