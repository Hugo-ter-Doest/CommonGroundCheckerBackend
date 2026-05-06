import yaml from "js-yaml";
import { getFileContent } from "../github";
import type { CheckResult } from "../types";

const REQUIRED_FIELDS = ["publiccodeYmlVersion", "name", "url", "legal"];
const RECOMMENDED_FIELDS = ["description", "maintenance", "categories", "nl"];

export async function checkPublicCode(
  owner: string,
  repo: string,
  tree: string[]
): Promise<CheckResult> {
  const isPubliccodeFile = (path: string) => {
    const lower = path.toLowerCase().replace(/^\/+|\/+$/g, "");
    const filename = lower.split("/").pop() ?? lower;
    return filename === "publiccode.yml" || filename === "publiccode.yaml";
  };

  const rootMatch = tree.find((p) => {
    const lower = p.toLowerCase().replace(/^\/+|\/+$/g, "");
    return lower === "publiccode.yml" || lower === "publiccode.yaml";
  });
  const fallbackMatch = tree.find(isPubliccodeFile);
  const file = rootMatch ?? fallbackMatch;

  if (!file) {
    return {
      id: "publiccode",
      title: "publiccode.yml Metadata File",
      description:
        "A publiccode.yml file must be present in the repository root, containing machine-readable metadata per the publiccode.yml standard.",
      status: "fail",
      message:
        "No publiccode.yml file found. This file is mandatory for reuse in the Dutch public sector.",
      evidence: [],
      referenceUrl: "https://standard.publiccode.net/criteria/",
    };
  }

  const content = await getFileContent(owner, repo, file);
  if (!content) {
    return {
      id: "publiccode",
      title: "publiccode.yml Metadata File",
      description:
        "A publiccode.yml file must be present in the repository root.",
      status: "warn",
      message: `Found ${file} but could not read its contents.`,
      evidence: [file],
      referenceUrl: "https://standard.publiccode.net/criteria/",
    };
  }

  let parsed: Record<string, unknown> = {};
  try {
    parsed = (yaml.load(content) as Record<string, unknown>) ?? {};
  } catch {
    return {
      id: "publiccode",
      title: "publiccode.yml Metadata File",
      description:
        "A publiccode.yml file must be present in the repository root.",
      status: "fail",
      message: `Found ${file} but it is not valid YAML.`,
      evidence: [file],
      referenceUrl: "https://standard.publiccode.net/criteria/",
    };
  }

  const missingRequired = REQUIRED_FIELDS.filter((f) => !(f in parsed));
  const missingRecommended = RECOMMENDED_FIELDS.filter((f) => !(f in parsed));

  if (missingRequired.length > 0) {
    return {
      id: "publiccode",
      title: "publiccode.yml Metadata File",
      description:
        "A publiccode.yml file must be present in the repository root.",
      status: "warn",
      message: `publiccode.yml found but is missing required fields: ${missingRequired.join(", ")}.`,
      evidence: [file],
      referenceUrl: "https://standard.publiccode.net/criteria/",
    };
  }

  const msg =
    missingRecommended.length > 0
      ? `publiccode.yml is valid. Recommended fields missing: ${missingRecommended.join(", ")}.`
      : "publiccode.yml is present and contains all required and recommended fields.";

  return {
    id: "publiccode",
    title: "publiccode.yml Metadata File",
    description:
      "A publiccode.yml file must be present in the repository root.",
    status: missingRecommended.length > 0 ? "warn" : "pass",
    message: msg,
    evidence: [file],
    referenceUrl: "https://standard.publiccode.net/criteria/",
  };
}
