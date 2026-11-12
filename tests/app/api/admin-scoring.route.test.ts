import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    scoringConfig: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    $disconnect: vi.fn(),
  },
}));

import { prisma } from "@/lib/db";
import { DEFAULT_CRITERION_CONFIG_BY_CHECK_ID } from "@/lib/scoring";
import { buildServer } from "@/server";

type MockPrisma = {
  scoringConfig: {
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
};

type ScoringResponse = {
  criterionWeights: Record<string, number>;
  criterionRequirementLevels: Record<string, string>;
  defaultCriterionWeights: Record<string, number>;
  defaultCriterionRequirementLevels: Record<string, string>;
};

const mockedPrisma = prisma as unknown as MockPrisma;

let app: ReturnType<typeof buildServer>;

beforeEach(() => {
  vi.clearAllMocks();
  app = buildServer();
});

afterEach(async () => {
  await app.close();
});

describe("complexity requirement level", () => {
  it("defaults to informative with no weight", () => {
    expect(DEFAULT_CRITERION_CONFIG_BY_CHECK_ID.complexity).toEqual({
      weight: 0,
      requirementLevel: "informative",
    });
  });

  it("stays informative in GET /api/admin/scoring when the stored config marks it mandatory", async () => {
    mockedPrisma.scoringConfig.findFirst.mockResolvedValue({
      id: "cfg-1",
      criterionWeights: { complexity: 1 },
      categoryWeights: {},
      criterionRequirementLevels: { complexity: "mandatory" },
      complexityThreshold: 15,
      complexityMaxCcnThreshold: 30,
      spectralRulesetSource: null,
    });

    const response = await app.inject({ method: "GET", url: "/api/admin/scoring" });
    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.payload) as ScoringResponse;
    expect(body.criterionRequirementLevels.complexity).toBe("informative");
    expect(body.criterionWeights.complexity).toBe(0);
    expect(body.defaultCriterionRequirementLevels.complexity).toBe("informative");
    expect(body.defaultCriterionWeights.complexity).toBe(0);
  });

  it("ignores a posted mandatory level for complexity", async () => {
    mockedPrisma.scoringConfig.findFirst.mockResolvedValue(null);
    mockedPrisma.scoringConfig.create.mockResolvedValue({ id: "cfg-2" });

    const response = await app.inject({
      method: "POST",
      url: "/api/admin/scoring",
      payload: {
        criterionWeights: { complexity: 1 },
        criterionRequirementLevels: { complexity: "mandatory" },
      },
    });
    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.payload) as ScoringResponse;
    expect(body.criterionRequirementLevels.complexity).toBe("informative");
    expect(body.criterionWeights.complexity).toBe(0);
  });
});
