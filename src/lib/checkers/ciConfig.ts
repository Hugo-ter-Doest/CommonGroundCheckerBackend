import type { CheckResult } from "../types";

const CI_CONFIG_PATHS = [
  ".github/workflows/",
  ".gitlab-ci.yml",
  ".gitlab-ci.yaml",
  ".circleci/config.yml",
  ".circleci/config.yaml",
  "azure-pipelines.yml",
  "azure-pipelines.yaml",
  "bitbucket-pipelines.yml",
  "jenkinsfile",
  "jenkinsfile.txt",
];

function findCiConfigFiles(tree: string[]): string[] {
  return tree
    .filter((path) => {
      const lower = path.toLowerCase();
      return CI_CONFIG_PATHS.some((candidate) =>
        candidate.endsWith("/")
          ? lower.startsWith(candidate)
          : lower === candidate
      );
    })
    .slice(0, 5);
}

export function checkCiConfig(tree: string[]): CheckResult {
  const evidence = findCiConfigFiles(tree);
  if (evidence.length > 0) {
    return {
      id: "cicd",
      title: "CI/CD configuration",
      description:
        "Checks whether the repository includes continuous integration or continuous delivery pipeline configuration.",
      status: "pass",
      message: `Detected CI/CD configuration in ${evidence.length} file(s).`,
      evidence,
      referenceUrl:
        "https://docs.github.com/en/actions/automating-builds-and-tests/about-github-actions",
    };
  }

  return {
    id: "cicd",
    title: "CI/CD configuration",
    description:
      "Checks whether the repository includes continuous integration or continuous delivery pipeline configuration.",
    status: "warn",
    message:
      "No common CI/CD configuration files were found. Add workflow definitions for automated builds and deployments.",
    evidence: [],
    referenceUrl:
      "https://docs.github.com/en/actions/automating-builds-and-tests/about-github-actions",
  };
}
