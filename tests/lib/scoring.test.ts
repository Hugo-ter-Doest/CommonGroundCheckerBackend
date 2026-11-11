import { describe, it, expect, vi } from "vitest";

const findFirst = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  prisma: {
    scoringConfig: { findFirst },
  },
}));

import { getActiveScoringConfig } from "@/lib/scoring";

describe("scoring defaults", () => {
  it("rates maintainability as a recommended criterion by default", async () => {
    findFirst.mockResolvedValueOnce(null);

    const active = await getActiveScoringConfig();

    expect(active.config.criterionConfigByCheckId.maintainability).toEqual({
      weight: 1,
      requirementLevel: "recommended",
    });
  });

  it("keeps a stored requirement level for maintainability", async () => {
    findFirst.mockResolvedValueOnce({
      id: "cfg-1",
      criterionWeights: { maintainability: 0.5 },
      categoryWeights: {},
      criterionRequirementLevels: { maintainability: "mandatory" },
      complexityThreshold: 15,
      complexityMaxCcnThreshold: 30,
      spectralRulesetSource: null,
    });

    const active = await getActiveScoringConfig();

    expect(active.id).toBe("cfg-1");
    expect(active.config.criterionConfigByCheckId.maintainability).toEqual({
      weight: 0.5,
      requirementLevel: "mandatory",
    });
  });
});
