import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    scoringConfig: {
      findFirst: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/db";
import { DEFAULT_CATEGORY_WEIGHTS, getActiveScoringConfig } from "@/lib/scoring";

// Mirrors CATEGORY_WEIGHTS in the frontend, src/lib/criteria.ts of
// https://github.com/Hugo-ter-Doest/CommonGroundChecker
const FRONTEND_CATEGORY_WEIGHTS = {
  Governance: 0.2,
  Architecture: 0.2,
  Security: 0.25,
  "Deployment & Operations": 0.2,
  "Software Quality": 0.15,
};

const findFirst = (prisma as unknown as {
  scoringConfig: { findFirst: ReturnType<typeof vi.fn> };
}).scoringConfig.findFirst;

describe("default category weights", () => {
  beforeEach(() => {
    findFirst.mockReset();
  });

  it("equal the frontend defaults", () => {
    expect(DEFAULT_CATEGORY_WEIGHTS).toEqual(FRONTEND_CATEGORY_WEIGHTS);
  });

  it("are used when no scoring configuration is stored", async () => {
    findFirst.mockResolvedValue(null);

    const active = await getActiveScoringConfig();

    expect(active.id).toBeNull();
    expect(active.config.categoryWeights).toEqual(FRONTEND_CATEGORY_WEIGHTS);
  });

  it("fill categories a stored configuration does not set", async () => {
    findFirst.mockResolvedValue({
      id: "cfg-1",
      criterionWeights: {},
      categoryWeights: { Governance: 0.5 },
      criterionRequirementLevels: {},
      complexityThreshold: null,
      complexityMaxCcnThreshold: null,
      spectralRulesetSource: null,
    });

    const active = await getActiveScoringConfig();

    expect(active.config.categoryWeights).toEqual({
      ...FRONTEND_CATEGORY_WEIGHTS,
      Governance: 0.5,
    });
  });
});
