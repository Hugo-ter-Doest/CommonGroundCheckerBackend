import type { CheckStatus, RequirementLevel } from "./types";
import { prisma } from "./db";

export interface CriterionConfig {
  weight: number;
  requirementLevel: RequirementLevel;
}

interface ScoringConfigOverrides {
  criterionWeights?: Record<string, number>;
  criterionRequirementLevels?: Record<string, RequirementLevel>;
  categoryWeights?: Record<string, number>;
  complexityThreshold?: number;
  complexityMaxCcnThreshold?: number;
  spectralRulesetSource?: string;
}

export interface ScoringConfig {
  criterionConfigByCheckId: Record<string, CriterionConfig>;
  categoryWeights: Record<string, number>;
  statusScoreByStatus: Record<CheckStatus, number>;
  complexityThreshold: number;
  complexityMaxCcnThreshold: number;
  spectralRulesetSource: string;
}

export interface ActiveScoringConfig {
  id: string | null;
  config: ScoringConfig;
}

export const DEFAULT_STATUS_SCORE_BY_STATUS: Record<CheckStatus, number> = {
  pass: 1,
  warn: 0.5,
  info: 0.5,
  fail: 0,
};

export const DEFAULT_COMPLEXITY_THRESHOLD = 15;
export const DEFAULT_COMPLEXITY_MAX_CCN_THRESHOLD = 30;
export const DEFAULT_SPECTRAL_RULESET_SOURCE =
  "https://static.developer.overheid.nl/adr/ruleset.yaml";

export const DEFAULT_CATEGORY_WEIGHTS: Record<string, number> = {
  Governance: 0.2,
  Architecture: 0.2,
  Security: 0,
  "Deployment & Operations": 0.2,
  "Software Quality": 0.15,
};

export const DEFAULT_CRITERION_CONFIG_BY_CHECK_ID: Record<string, CriterionConfig> = {
  sourcecode: { weight: 1, requirementLevel: "mandatory" },
  openapi: { weight: 1, requirementLevel: "mandatory" },
  license: { weight: 1, requirementLevel: "mandatory" },
  eupllicense: { weight: 1, requirementLevel: "mandatory" },
  copyrightowner: { weight: 1, requirementLevel: "mandatory" },
  publiccode: { weight: 1, requirementLevel: "mandatory" },
  docker: { weight: 1, requirementLevel: "mandatory" },
  dockerimage: { weight: 1, requirementLevel: "mandatory" },
  helmchart: { weight: 1, requirementLevel: "mandatory" },
  documentation: { weight: 1, requirementLevel: "mandatory" },
  changelog: { weight: 1, requirementLevel: "recommended" },
  tests: { weight: 1, requirementLevel: "mandatory" },
  cicd: { weight: 1, requirementLevel: "mandatory" },
  complexity: { weight: 1, requirementLevel: "mandatory" },
  codemetrics: { weight: 0, requirementLevel: "informative" },
  owaspsecurecoding: { weight: 1, requirementLevel: "mandatory" },
  adrvalidator: { weight: 1, requirementLevel: "mandatory" },
  contributing: { weight: 1, requirementLevel: "mandatory" },
  codeofconduct: { weight: 1, requirementLevel: "mandatory" },
  security: { weight: 1, requirementLevel: "mandatory" },
  semver: { weight: 1, requirementLevel: "mandatory" },
  sbom: { weight: 1, requirementLevel: "mandatory" },
  coverage: { weight: 1, requirementLevel: "mandatory" },
  fivelayer: { weight: 1, requirementLevel: "mandatory" },
};

function clampWeight(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, Math.round(value * 100) / 100));
}

function clampComplexityThreshold(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_COMPLEXITY_THRESHOLD;
  const rounded = Math.round(value);
  return Math.max(1, Math.min(100, rounded));
}

function clampComplexityMaxCcnThreshold(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_COMPLEXITY_MAX_CCN_THRESHOLD;
  const rounded = Math.round(value);
  return Math.max(1, Math.min(200, rounded));
}

function sanitizeSpectralRulesetSource(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_SPECTRAL_RULESET_SOURCE;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_SPECTRAL_RULESET_SOURCE;
}

function buildScoringConfig(overrides?: ScoringConfigOverrides): ScoringConfig {
  const criterionConfigByCheckId: Record<string, CriterionConfig> =
    Object.fromEntries(
      Object.entries(DEFAULT_CRITERION_CONFIG_BY_CHECK_ID).map(([checkId, config]) => {
        const overrideWeight = overrides?.criterionWeights?.[checkId];
        const overrideLevel = overrides?.criterionRequirementLevels?.[checkId];
        const effectiveLevel: RequirementLevel =
          config.requirementLevel === "informative"
            ? "informative"
            : overrideLevel === "mandatory" || overrideLevel === "recommended"
              ? overrideLevel
              : config.requirementLevel;
        const effectiveWeight =
          effectiveLevel === "informative"
            ? 0
            : typeof overrideWeight === "number"
              ? clampWeight(overrideWeight)
              : config.weight;

        return [
          checkId,
          {
            requirementLevel: effectiveLevel,
            weight: effectiveWeight,
          },
        ];
      })
    );

  const categoryWeights: Record<string, number> = { ...DEFAULT_CATEGORY_WEIGHTS };

  if (overrides?.categoryWeights) {
    for (const [category, weight] of Object.entries(overrides.categoryWeights)) {
      if (typeof weight === "number" && Number.isFinite(weight)) {
        categoryWeights[category] = clampWeight(weight);
      }
    }
  }

  return {
    criterionConfigByCheckId,
    categoryWeights,
    statusScoreByStatus: { ...DEFAULT_STATUS_SCORE_BY_STATUS },
    complexityThreshold:
      typeof overrides?.complexityThreshold === "number"
        ? clampComplexityThreshold(overrides.complexityThreshold)
        : DEFAULT_COMPLEXITY_THRESHOLD,
    complexityMaxCcnThreshold:
      typeof overrides?.complexityMaxCcnThreshold === "number"
        ? clampComplexityMaxCcnThreshold(overrides.complexityMaxCcnThreshold)
        : DEFAULT_COMPLEXITY_MAX_CCN_THRESHOLD,
    spectralRulesetSource: sanitizeSpectralRulesetSource(
      overrides?.spectralRulesetSource
    ),
  };
}

function parseOverridesFromDbPayload(payload: unknown): ScoringConfigOverrides {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  const candidate = payload as Record<string, unknown>;
  const criterionWeightsRaw = candidate.criterionWeights;
  const criterionRequirementLevelsRaw = candidate.criterionRequirementLevels;
  const complexityThresholdRaw = candidate.complexityThreshold;
  const complexityMaxCcnThresholdRaw = candidate.complexityMaxCcnThreshold;
  const spectralRulesetSourceRaw = candidate.spectralRulesetSource;
  const criterionWeights: Record<string, number> = {};
  if (criterionWeightsRaw && typeof criterionWeightsRaw === "object") {
    for (const [checkId, weight] of Object.entries(
      criterionWeightsRaw as Record<string, unknown>
    )) {
      if (typeof weight === "number" && Number.isFinite(weight)) {
        criterionWeights[checkId] = weight;
      }
    }
  }

  const categoryWeights: Record<string, number> = {};
  const categoryWeightsRaw = candidate.categoryWeights;
  if (categoryWeightsRaw && typeof categoryWeightsRaw === "object") {
    for (const [category, weight] of Object.entries(
      categoryWeightsRaw as Record<string, unknown>
    )) {
      if (typeof weight === "number" && Number.isFinite(weight)) {
        categoryWeights[category] = weight;
      }
    }
  }

  const criterionRequirementLevels: Record<string, RequirementLevel> = {};
  if (criterionRequirementLevelsRaw && typeof criterionRequirementLevelsRaw === "object") {
    for (const [checkId, level] of Object.entries(
      criterionRequirementLevelsRaw as Record<string, unknown>
    )) {
      if (
        level === "mandatory" ||
        level === "recommended" ||
        level === "informative"
      ) {
        criterionRequirementLevels[checkId] = level;
      }
    }
  }

  return {
    criterionWeights,
    categoryWeights: Object.keys(categoryWeights).length > 0 ? categoryWeights : undefined,
    criterionRequirementLevels: Object.keys(criterionRequirementLevels).length > 0 ? criterionRequirementLevels : undefined,
    complexityThreshold:
      typeof complexityThresholdRaw === "number"
        ? clampComplexityThreshold(complexityThresholdRaw)
        : undefined,
    complexityMaxCcnThreshold:
      typeof complexityMaxCcnThresholdRaw === "number"
        ? clampComplexityMaxCcnThreshold(complexityMaxCcnThresholdRaw)
        : undefined,
    spectralRulesetSource:
      typeof spectralRulesetSourceRaw === "string"
        ? sanitizeSpectralRulesetSource(spectralRulesetSourceRaw)
        : undefined,
  };
}

type ScoringConfigDbRow = {
  id: string;
  criterionWeights: unknown;
  categoryWeights: unknown;
  criterionRequirementLevels: unknown;
  complexityThreshold: number | null;
  complexityMaxCcnThreshold: number | null;
  spectralRulesetSource: string | null;
};

async function readLatestDbOverrides(): Promise<{
  id: string;
  overrides: ScoringConfigOverrides;
} | null> {
  const row = (await prisma.scoringConfig.findFirst({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      criterionWeights: true,
      categoryWeights: true,
      criterionRequirementLevels: true,
      complexityThreshold: true,
      complexityMaxCcnThreshold: true,
      spectralRulesetSource: true,
    },
  })) as ScoringConfigDbRow | null;

  if (!row) return null;

  return {
    id: row.id,
    overrides: parseOverridesFromDbPayload({
      criterionWeights: row.criterionWeights,
      categoryWeights: row.categoryWeights,
      criterionRequirementLevels: row.criterionRequirementLevels,
      complexityThreshold: row.complexityThreshold,
      complexityMaxCcnThreshold: row.complexityMaxCcnThreshold,
      spectralRulesetSource: row.spectralRulesetSource,
    }),
  };
}

async function createDbOverridesRecord(
  overrides: ScoringConfigOverrides
): Promise<string> {
  const created = (await prisma.scoringConfig.create({
    data: {
      criterionWeights: overrides.criterionWeights ?? {},
      categoryWeights: overrides.categoryWeights ?? {},
      criterionRequirementLevels: overrides.criterionRequirementLevels ?? {},
      complexityThreshold: clampComplexityThreshold(
        overrides.complexityThreshold ?? DEFAULT_COMPLEXITY_THRESHOLD
      ),
      complexityMaxCcnThreshold: clampComplexityMaxCcnThreshold(
        overrides.complexityMaxCcnThreshold ??
          DEFAULT_COMPLEXITY_MAX_CCN_THRESHOLD
      ),
      spectralRulesetSource: sanitizeSpectralRulesetSource(
        overrides.spectralRulesetSource
      ),
    },
  })) as { id: string };

  return created.id;
}

export async function getScoringConfig(): Promise<ScoringConfig> {
  const active = await getActiveScoringConfig();
  return active.config;
}

export async function getActiveScoringConfig(): Promise<ActiveScoringConfig> {
  try {
    const latest = await readLatestDbOverrides();

    if (!latest) {
      return {
        id: null,
        config: buildScoringConfig(),
      };
    }

    return {
      id: latest.id,
      config: buildScoringConfig(latest.overrides),
    };
  } catch {
    return {
      id: null,
      config: buildScoringConfig(),
    };
  }
}

export async function saveCriterionWeights(
  criterionWeights: Record<string, number>,
  complexityThreshold?: number,
  complexityMaxCcnThreshold?: number,
  criterionRequirementLevels?: Record<string, string>,
  categoryWeights?: Record<string, number>,
  spectralRulesetSource?: string
): Promise<ActiveScoringConfig> {
  const overrides: ScoringConfigOverrides = {
    criterionWeights: {},
    criterionRequirementLevels: {},
    categoryWeights,
    complexityThreshold:
      typeof complexityThreshold === "number"
        ? clampComplexityThreshold(complexityThreshold)
        : DEFAULT_COMPLEXITY_THRESHOLD,
    complexityMaxCcnThreshold:
      typeof complexityMaxCcnThreshold === "number"
        ? clampComplexityMaxCcnThreshold(complexityMaxCcnThreshold)
        : DEFAULT_COMPLEXITY_MAX_CCN_THRESHOLD,
    spectralRulesetSource: sanitizeSpectralRulesetSource(spectralRulesetSource),
  };

  for (const [checkId, config] of Object.entries(
    DEFAULT_CRITERION_CONFIG_BY_CHECK_ID
  )) {
    const incoming = criterionWeights[checkId];
    const clamped =
      config.requirementLevel === "informative"
        ? 0
        : typeof incoming === "number"
          ? clampWeight(incoming)
          : clampWeight(config.weight);
    overrides.criterionWeights![checkId] = clamped;

    const incomingLevel = criterionRequirementLevels?.[checkId];
    const effectiveLevel: RequirementLevel =
      config.requirementLevel === "informative"
        ? "informative"
        : incomingLevel === "mandatory" || incomingLevel === "recommended"
          ? incomingLevel
          : config.requirementLevel;

    overrides.criterionRequirementLevels![checkId] = effectiveLevel;
  }

  const id = await createDbOverridesRecord(overrides);

  return {
    id,
    config: buildScoringConfig(overrides),
  };
}
