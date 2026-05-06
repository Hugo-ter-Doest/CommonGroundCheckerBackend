// Shared types across checkers and UI

export type CheckStatus = "pass" | "fail" | "warn" | "info";
export type RequirementLevel = "mandatory" | "recommended" | "informative";
export type ConfidenceLevel = "high" | "medium" | "low";

export interface VersionEvidence {
  source: "release" | "tag" | "manifest" | "readme" | "none";
  detail: string;
}

export interface CheckResult {
  id: string;
  title: string;
  /** Short description of what was checked */
  description: string;
  /** Whether this criterion is mandatory, recommended, or informative */
  requirementLevel?: RequirementLevel;
  status: CheckStatus;
  /** Detail message explaining why pass/fail */
  message: string;
  /** Optional evidence — file paths or URLs found */
  evidence?: string[];
  /** Link to the relevant Common Ground / standard reference */
  referenceUrl?: string;
  /** Optional confidence level for inferred/heuristic checks */
  confidence?: ConfidenceLevel;
}

export interface CheckReport {
  repoUrl: string;
  owner: string;
  repo: string;
  checkedAt: string;
  scoringConfigId: string | null;
  score: number; // 0-100
  results: CheckResult[];
  repoMeta: {
    description: string | null;
    language: string | null;
    stars: number;
    forks: number;
    defaultBranch: string;
    topics: string[];
    license: string | null;
    version: string | null;
    versionEvidence: VersionEvidence;
  };
}
