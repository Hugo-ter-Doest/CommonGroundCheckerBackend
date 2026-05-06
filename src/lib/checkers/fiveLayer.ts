import { getFileContent } from "../github";
import { load as loadYaml } from "js-yaml";
import type { CheckResult } from "../types";

type LayerKey = "interaction" | "process" | "integration" | "service" | "data";
type SignalStrength = "strong" | "weak";

type LayerDefinition = {
  label: string;
  pathKeywords: Array<{ value: string; strength: SignalStrength }>;
  textKeywords: Array<{ value: string; strength: SignalStrength }>;
};

const LAYER_DEFINITIONS: Record<LayerKey, LayerDefinition> = {
  interaction: {
    label: "Interaction layer (frontend / portal)",
    pathKeywords: [
      { value: "/frontend/", strength: "strong" },
      { value: "/ui/", strength: "strong" },
      { value: "/portal/", strength: "strong" },
      { value: "/web/", strength: "strong" },
      { value: "/client/", strength: "strong" },
      { value: "/admin/", strength: "weak" },
      { value: "/admin-ui/", strength: "weak" },
      { value: "frontend", strength: "strong" },
      { value: "ui", strength: "strong" },
    ],
    textKeywords: [
      { value: "frontend", strength: "strong" },
      { value: "portal", strength: "strong" },
      { value: "ui", strength: "strong" },
      { value: "interface", strength: "strong" },
      { value: "react", strength: "strong" },
      { value: "vue", strength: "strong" },
      { value: "angular", strength: "strong" },
      { value: "next", strength: "strong" },
      { value: "nuxt", strength: "strong" },
      { value: "web app", strength: "strong" },
      { value: "user interface", strength: "strong" },
      { value: "dashboard", strength: "weak" },
      { value: "admin", strength: "weak" },
      { value: "admin panel", strength: "weak" },
      { value: "management ui", strength: "weak" },
    ],
  },
  process: {
    label: "Process layer (orchestration / BFF)",
    pathKeywords: [
      { value: "/process/", strength: "strong" },
      { value: "/workflow/", strength: "strong" },
      { value: "/orchestration/", strength: "strong" },
      { value: "/bff/", strength: "strong" },
      { value: "/saga/", strength: "strong" },
    ],
    textKeywords: [
      { value: "process", strength: "strong" },
      { value: "orchestration", strength: "strong" },
      { value: "bff", strength: "strong" },
      { value: "camunda", strength: "strong" },
      { value: "flowable", strength: "strong" },
      { value: "workflow", strength: "strong" },
      { value: "bpmn", strength: "strong" },
      { value: "business process", strength: "strong" },
      { value: "service bus", strength: "strong" },
    ],
  },
  integration: {
    label: "Integration layer (gateway / NLX)",
    pathKeywords: [
      { value: "/integration/", strength: "strong" },
      { value: "/gateway/", strength: "strong" },
      { value: "/nlx/", strength: "strong" },
      { value: "/proxy/", strength: "strong" },
      { value: "/api-gateway/", strength: "strong" },
    ],
    textKeywords: [
      { value: "integration", strength: "strong" },
      { value: "gateway", strength: "strong" },
      { value: "nlx", strength: "strong" },
      { value: "zgw", strength: "strong" },
      { value: "zaak", strength: "strong" },
      { value: "api-gateway", strength: "strong" },
      { value: "proxy", strength: "strong" },
      { value: "connector", strength: "strong" },
      { value: "mediator", strength: "strong" },
    ],
  },
  service: {
    label: "Service layer (back-end microservice)",
    pathKeywords: [
      { value: "/service/", strength: "strong" },
      { value: "/services/", strength: "strong" },
      { value: "/backend/", strength: "strong" },
      { value: "/api/", strength: "strong" },
      { value: "/rest/", strength: "strong" },
      { value: "/graphql/", strength: "strong" },
      { value: "/grpc/", strength: "strong" },
    ],
    textKeywords: [
      { value: "service", strength: "strong" },
      { value: "api", strength: "strong" },
      { value: "backend", strength: "strong" },
      { value: "microservice", strength: "strong" },
      { value: "rest", strength: "strong" },
      { value: "graphql", strength: "strong" },
      { value: "grpc", strength: "strong" },
      { value: "server", strength: "strong" },
      { value: "api service", strength: "strong" },
    ],
  },
  data: {
    label: "Data layer (data store / register)",
    pathKeywords: [
      { value: "/data/", strength: "strong" },
      { value: "/db/", strength: "strong" },
      { value: "/database/", strength: "strong" },
      { value: "/register/", strength: "strong" },
      { value: "/storage/", strength: "strong" },
    ],
    textKeywords: [
      { value: "database", strength: "strong" },
      { value: "register", strength: "strong" },
      { value: "data store", strength: "strong" },
      { value: "storage", strength: "strong" },
      { value: "persistence", strength: "strong" },
      { value: "postgres", strength: "strong" },
      { value: "mysql", strength: "strong" },
      { value: "mongodb", strength: "strong" },
      { value: "redis", strength: "strong" },
      { value: "sql", strength: "strong" },
      { value: "nosql", strength: "strong" },
    ],
  },
};

const README_FILENAMES = ["readme.md", "readme.txt", "readme.rst", "readme"];
const PUBLICCODE_FILENAMES = ["publiccode.yml", "publiccode.yaml"];

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").toLowerCase();
}

function flattenStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(flattenStrings);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(flattenStrings);
  }
  return [];
}

interface LayerDetection {
  layer: LayerKey;
  evidence: string;
  strength: SignalStrength;
}

function detectLayerSignalsFromPath(repoPath: string): LayerDetection[] {
  const normalized = normalizePath(repoPath);
  const detections: LayerDetection[] = [];

  for (const [layer, definition] of Object.entries(LAYER_DEFINITIONS) as [LayerKey, LayerDefinition][]) {
    for (const keyword of definition.pathKeywords) {
      if (normalized.includes(keyword.value)) {
        detections.push({
          layer,
          strength: keyword.strength,
          evidence: `Found path segment "${keyword.value.replace(/\//g, "")}" in ${repoPath}`,
        });
        break;
      }
    }
  }

  return detections;
}

function detectLayerSignalsFromText(
  text: string,
  source: string
): LayerDetection[] {
  const lower = text.toLowerCase();
  const detections: LayerDetection[] = [];

  for (const [layer, definition] of Object.entries(LAYER_DEFINITIONS) as [LayerKey, LayerDefinition][]) {
    for (const keyword of definition.textKeywords) {
      if (lower.includes(keyword.value)) {
        detections.push({
          layer,
          strength: keyword.strength,
          evidence: `Found "${keyword.value}" in ${source}`,
        });
        break;
      }
    }
  }

  return detections;
}

async function extractPublicCodeText(owner: string, repo: string, tree: string[]): Promise<string> {
  const publiccodePath = tree.find((path) =>
    PUBLICCODE_FILENAMES.includes(path.toLowerCase())
  );

  if (!publiccodePath) {
    return "";
  }

  const raw = await getFileContent(owner, repo, publiccodePath);
  if (!raw) {
    return "";
  }

  try {
    const parsed = loadYaml(raw);
    return flattenStrings(parsed).join(" ");
  } catch {
    return raw;
  }
}

function formatLayerLabels(layers: LayerKey[]): string[] {
  return layers.map((layer) => LAYER_DEFINITIONS[layer].label);
}

function getLayerConfidence(layers: LayerKey[], evidence: string[]): "high" | "medium" | "low" {
  if (layers.length === 1 && evidence.length > 0) {
    return "high";
  }

  if (layers.length > 1) {
    return "medium";
  }

  return "low";
}

export async function checkFiveLayer(
  owner: string,
  repo: string,
  tree: string[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  repoMeta: any
): Promise<CheckResult> {
  const topics: string[] = repoMeta?.topics ?? [];
  const repoDescription: string = repoMeta?.description ?? "";

  const readmePath = tree.find((path) =>
    README_FILENAMES.includes(path.toLowerCase())
  );
  const readme = readmePath ? await getFileContent(owner, repo, readmePath) : "";
  const publiccodeText = await extractPublicCodeText(owner, repo, tree);

  const allDetections: LayerDetection[] = [];

  for (const repoPath of tree) {
    allDetections.push(...detectLayerSignalsFromPath(repoPath));
  }

  const combinedText = [topics.join(" "), repoDescription, readme, publiccodeText].join(" ");
  allDetections.push(
    ...detectLayerSignalsFromText(combinedText, "repository metadata and docs")
  );

  const strongDetections = allDetections.filter((d) => d.strength === "strong");
  const weakDetections = allDetections.filter((d) => d.strength === "weak");
  const hasStrongInteraction = strongDetections.some((d) => d.layer === "interaction");
  const hasServiceOrDataStrong = strongDetections.some((d) =>
    d.layer === "service" || d.layer === "data"
  );

  const ignoredInteractionWeak =
    !hasStrongInteraction &&
    hasServiceOrDataStrong &&
    weakDetections.some((d) => d.layer === "interaction");

  const finalDetections = [
    ...strongDetections,
    ...weakDetections.filter(
      (d) => !(ignoredInteractionWeak && d.layer === "interaction")
    ),
  ];

  const layerDetections = new Map<LayerKey, Set<string>>();
  for (const detection of finalDetections) {
    const existing = layerDetections.get(detection.layer) ?? new Set<string>();
    existing.add(detection.evidence);
    layerDetections.set(detection.layer, existing);
  }

  const detectedLayers = Array.from(layerDetections.keys());
  const evidence = Array.from(layerDetections.values()).flatMap((set) => Array.from(set));
  const mentionsCG = /common\s*ground|commonground|5-lagen|vijf\s+lagen|layered architecture/i.test(
    combinedText
  );

  if (detectedLayers.length === 0) {
    return {
      id: "fivelayer",
      title: "Common Ground 5-Layer Architecture",
      description:
        "The component should clearly belong to one of the five Common Ground architectural layers.",
      status: "warn",
      message:
        "Could not determine the architectural layer from the repository structure, metadata, or documentation. " +
        "Add a clear layer signal or split the repository into a single Common Ground layer.",
      evidence: mentionsCG ? ["Repository references Common Ground, but no layer signal was detected."] : [],
      referenceUrl:
        "https://commonground.nl/cms/view/54476261/5-lagen-model",
      confidence: "low",
    };
  }

  const labels = formatLayerLabels(detectedLayers);
  const status = detectedLayers.length === 1 ? "pass" : "warn";
  const messageParts = [
    `Detected layer signals: ${labels.join("; ")}.`,
    detectedLayers.length > 1
      ? "This repository appears to span multiple Common Ground layers. Consider splitting responsibilities or clarifying the primary layer."
      : "This repository appears to target a single Common Ground layer.",
  ];

  if (ignoredInteractionWeak) {
    messageParts.push(
      "Admin UI or management interface hints were treated as supporting the existing service/data layer rather than a separate Interaction layer."
    );
  }

  if (mentionsCG) {
    messageParts.push("The repository also references Common Ground.");
  }

  return {
    id: "fivelayer",
    title: "Common Ground 5-Layer Architecture",
    description:
      "The component should clearly belong to one of the five Common Ground architectural layers.",
    status,
    message: messageParts.join(" "),
    evidence,
    referenceUrl:
      "https://commonground.nl/cms/view/54476261/5-lagen-model",
    confidence: getLayerConfidence(detectedLayers, evidence),
  };
}
