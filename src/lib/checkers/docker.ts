import type { CheckResult } from "../types";

const DOCKER_FILES = [
  "dockerfile",
  "dockerfile.dev",
  "dockerfile.prod",
  "dockerfile.local",
];
const COMPOSE_FILES = [
  "docker-compose.yml",
  "docker-compose.yaml",
  "docker-compose.dev.yml",
  "docker-compose.prod.yml",
];

export function checkDocker(tree: string[]): CheckResult {
  const lowerTree = tree.map((p) => p.toLowerCase());

  const dockerfiles = tree.filter((p) =>
    DOCKER_FILES.includes(p.toLowerCase().split("/").pop()!)
  );
  const composeFiles = tree.filter((p) =>
    COMPOSE_FILES.includes(p.toLowerCase().split("/").pop()!)
  );
  const hasPackageHelmChart = lowerTree.some(
    (p) => p === "chart.yaml" || p.includes("/chart.yaml")
  );

  const allEvidence = [...dockerfiles, ...composeFiles];
  if (hasPackageHelmChart) allEvidence.push("(Helm chart)");

  if (dockerfiles.length === 0 && composeFiles.length === 0 && !hasPackageHelmChart) {
    return {
      id: "docker",
      title: "Docker support",
      description:
        "The component must be deployable as a container. A Dockerfile and optionally a docker-compose file should be present.",
      status: "fail",
      message:
        "No Dockerfile or docker-compose file found. Common Ground components must be containerisable.",
      evidence: [],
      referenceUrl:
        "https://commonground.nl/cms/view/54476272/haven",
    };
  }

  if (dockerfiles.length > 0 && composeFiles.length > 0) {
    return {
      id: "docker",
      title: "Docker support",
      description:
        "The component must be deployable as a container. A Dockerfile and docker-compose file should be present.",
      status: "pass",
      message: `Dockerfile and docker-compose file(s) found.`,
      evidence: allEvidence,
      referenceUrl: "https://commonground.nl/cms/view/54476272/haven",
    };
  }

  return {
    id: "docker",
    title: "Docker support",
    description:
      "The component must be deployable as a container. A Dockerfile and docker-compose file should be present.",
    status: "fail",
    message:
      dockerfiles.length > 0
        ? "Dockerfile found but no docker-compose file. A docker-compose file is required for this checker."
        : "Docker-compose file found but no Dockerfile detected. A Dockerfile is required.",
    evidence: allEvidence,
    referenceUrl: "https://commonground.nl/cms/view/54476272/haven",
  };
}
