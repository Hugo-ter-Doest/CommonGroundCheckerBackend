import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  DEFAULT_COMPLEXITY_MAX_CCN_THRESHOLD,
  DEFAULT_COMPLEXITY_THRESHOLD,
  DEFAULT_CRITERION_CONFIG_BY_CHECK_ID,
  DEFAULT_SPECTRAL_RULESET_SOURCE,
  getScoringConfig,
  saveCriterionWeights,
} from "@/lib/scoring";

type ScoringRouteBody = {
  reset?: boolean;
  complexityThreshold?: number;
  complexityMaxCcnThreshold?: number;
  spectralRulesetSource?: string;
  criterionWeights?: unknown;
  criterionRequirementLevels?: unknown;
};

function extractWeightsFromPayload(payload: unknown): Record<string, number> {
  if (!payload || typeof payload !== "object") return {};

  const raw = payload as Record<string, unknown>;
  const result: Record<string, number> = {};

  for (const checkId of Object.keys(DEFAULT_CRITERION_CONFIG_BY_CHECK_ID)) {
    const criterionConfig = DEFAULT_CRITERION_CONFIG_BY_CHECK_ID[checkId];
    if (criterionConfig.requirementLevel === "informative") {
      continue;
    }

    const value = raw[checkId];
    if (typeof value === "number" && Number.isFinite(value)) {
      result[checkId] = value;
    }
  }

  return result;
}

function extractRequirementLevelsFromPayload(payload: unknown): Record<string, string> {
  if (!payload || typeof payload !== "object") return {};

  const raw = payload as Record<string, unknown>;
  const result: Record<string, string> = {};

  for (const checkId of Object.keys(DEFAULT_CRITERION_CONFIG_BY_CHECK_ID)) {
    const criterionConfig = DEFAULT_CRITERION_CONFIG_BY_CHECK_ID[checkId];
    if (criterionConfig.requirementLevel === "informative") continue;

    const value = raw[checkId];
    if (value === "mandatory" || value === "recommended") {
      result[checkId] = value;
    }
  }

  return result;
}

function extractComplexityThresholdFromPayload(payload: unknown): number | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const raw = payload as Record<string, unknown>;
  const value = raw.complexityThreshold;
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
}

function extractComplexityMaxCcnThresholdFromPayload(
  payload: unknown
): number | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const raw = payload as Record<string, unknown>;
  const value = raw.complexityMaxCcnThreshold;
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
}

function extractSpectralRulesetSourceFromPayload(
  payload: unknown
): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const raw = payload as Record<string, unknown>;
  const value = raw.spectralRulesetSource;
  if (typeof value !== "string") return undefined;
  return value;
}

export async function registerAdminScoringRoute(fastify: FastifyInstance) {
  fastify.get("/api/admin/scoring", async (request, reply) => {
    try {
      const scoringConfig = await getScoringConfig();

      return {
        criterionWeights: Object.fromEntries(
          Object.entries(scoringConfig.criterionConfigByCheckId).map(([checkId, config]) => [
            checkId,
            config.weight,
          ])
        ),
        criterionRequirementLevels: Object.fromEntries(
          Object.entries(scoringConfig.criterionConfigByCheckId).map(([checkId, config]) => [
            checkId,
            config.requirementLevel,
          ])
        ),
        complexityThreshold: scoringConfig.complexityThreshold,
        complexityMaxCcnThreshold: scoringConfig.complexityMaxCcnThreshold,
        spectralRulesetSource: scoringConfig.spectralRulesetSource,
        defaultCriterionWeights: Object.fromEntries(
          Object.entries(DEFAULT_CRITERION_CONFIG_BY_CHECK_ID).map(([checkId, config]) => [
            checkId,
            config.weight,
          ])
        ),
        defaultCriterionRequirementLevels: Object.fromEntries(
          Object.entries(DEFAULT_CRITERION_CONFIG_BY_CHECK_ID).map(([checkId, config]) => [
            checkId,
            config.requirementLevel,
          ])
        ),
        defaultComplexityThreshold: DEFAULT_COMPLEXITY_THRESHOLD,
        defaultComplexityMaxCcnThreshold: DEFAULT_COMPLEXITY_MAX_CCN_THRESHOLD,
        defaultSpectralRulesetSource: DEFAULT_SPECTRAL_RULESET_SOURCE,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unexpected error.";
      return reply.status(500).send({ error: message });
    }
  });

  fastify.post(
    "/api/admin/scoring",
    async (
      request: FastifyRequest<{ Body: ScoringRouteBody }>,
      reply: FastifyReply
    ) => {
      try {
        const body = request.body ?? {};
        const reset = body.reset === true;
        const incomingThreshold = extractComplexityThresholdFromPayload(body);
        const incomingMaxThreshold = extractComplexityMaxCcnThresholdFromPayload(body);
        const incomingSpectralRulesetSource = extractSpectralRulesetSourceFromPayload(body);

        const activeConfig = reset
          ? await saveCriterionWeights(
              {},
              DEFAULT_COMPLEXITY_THRESHOLD,
              DEFAULT_COMPLEXITY_MAX_CCN_THRESHOLD,
              {},
              DEFAULT_SPECTRAL_RULESET_SOURCE
            )
          : await saveCriterionWeights(
              extractWeightsFromPayload(body?.criterionWeights),
              incomingThreshold,
              incomingMaxThreshold,
              extractRequirementLevelsFromPayload(body?.criterionRequirementLevels),
              incomingSpectralRulesetSource
            );

        return {
          ok: true,
          scoringConfigId: activeConfig.id,
          complexityThreshold: activeConfig.config.complexityThreshold,
          complexityMaxCcnThreshold:
            activeConfig.config.complexityMaxCcnThreshold,
          spectralRulesetSource: activeConfig.config.spectralRulesetSource,
          criterionWeights: Object.fromEntries(
            Object.entries(activeConfig.config.criterionConfigByCheckId).map(([checkId, config]) => [
              checkId,
              config.weight,
            ])
          ),
          criterionRequirementLevels: Object.fromEntries(
            Object.entries(activeConfig.config.criterionConfigByCheckId).map(([checkId, config]) => [
              checkId,
              config.requirementLevel,
            ])
          ),
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unexpected error.";
        return reply.status(500).send({ error: message });
      }
    }
  );
}
