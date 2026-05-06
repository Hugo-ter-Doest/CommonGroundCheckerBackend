import { getRepoTree, parseGitHubTreeUrl } from "../github";
import type { CheckResult } from "../types";

export async function checkHelmChart(
  owner: string,
  repo: string,
  tree: string[],
  helmChartLocations: string[] = []
): Promise<CheckResult> {
  //const lowerTree = tree.map((p) => p.toLowerCase());
  const normalizedHints = helmChartLocations.map((p) => p.toLowerCase());
  const localPathHints = normalizedHints.filter(
    (h) => !h.startsWith("http://") && !h.startsWith("https://")
  );

  const externalHints = helmChartLocations
    .map((hint) => parseGitHubTreeUrl(hint))
    .filter(
      (
        hint
      ): hint is {
        owner: string;
        repo: string;
        branch: string;
        path: string;
      } => !!hint
    );

  const externalChartEvidence: string[] = [];
  let externalHelmDetected = false;

  for (const hint of externalHints) {
    try {
      const externalTree = await getRepoTree(hint.owner, hint.repo, hint.branch);
      const externalLower = externalTree.map((p) => p.toLowerCase());
      const expectedChart = hint.path.toLowerCase().endsWith("chart.yaml")
        ? hint.path.toLowerCase().replace(/^\/+|\/+$/g, "")
        : `${hint.path.replace(/^\/+|\/+$/g, "")}/chart.yaml`;

      if (externalLower.includes(expectedChart)) {
        externalHelmDetected = true;
        externalChartEvidence.push(
          `External Helm chart detected: https://github.com/${hint.owner}/${hint.repo}/tree/${hint.branch}/${hint.path}`
        );
      }
    } catch {
      // Ignore external lookup issues and proceed with local detection.
    }
  }

  const hintedHelmChart = tree.find((p) => {
    const lower = p.toLowerCase();
    return (
      lower.endsWith("chart.yaml") &&
      (localPathHints.length === 0 ||
        localPathHints.some(
          (hint) => lower === `${hint}/chart.yaml` || lower.startsWith(`${hint}/`)
        ))
    );
  });

  const helmChart = hintedHelmChart ?? tree.find((p) => p.toLowerCase().endsWith("chart.yaml"));
  const hasHelm = !!helmChart || externalHelmDetected;
  const evidence: string[] = [];

  if (helmChart) evidence.push(helmChart);
  if (helmChartLocations.length > 0) {
    evidence.push(`Provided helm locations: ${helmChartLocations.join(", ")}`);
  }
  evidence.push(...externalChartEvidence);

  if (hasHelm) {
    return {
      id: "helmchart",
      title: "Helm chart (Kubernetes)",
      description: "A Helm chart was detected for the component being checked.",
      status: "pass",
      message: "Helm chart detected for this component.",
      evidence,
      referenceUrl: "https://haven.commonground.nl",
    };
  }

  return {
    id: "helmchart",
    title: "Helm chart (Kubernetes)",
    description: "A Helm chart was detected for the component being checked.",
    status: "fail",
    message:
      "No Helm chart (Chart.yaml) was found for this component. Add a Helm chart to the repository.",
    evidence,
    referenceUrl: "https://haven.commonground.nl",
  };
}
