import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
import { buildServer } from "@/server";

type MockPrisma = {
  scoringConfig: {
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
};

const mockedPrisma = prisma as unknown as MockPrisma;

type ScoringResponse = {
  categoryWeights: Record<string, number>;
  defaultCategoryWeights: Record<string, number>;
};

describe("admin scoring route category weights", () => {
  let app: ReturnType<typeof buildServer>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = buildServer();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns Maintainability as a default category", async () => {
    mockedPrisma.scoringConfig.findFirst.mockResolvedValueOnce(null);

    const response = await app.inject({ method: "GET", url: "/api/admin/scoring" });

    expect(response.statusCode).toBe(200);
    const body = response.json<ScoringResponse>();
    expect(body.defaultCategoryWeights.Maintainability).toBe(0.15);
    expect(body.defaultCategoryWeights).not.toHaveProperty("Software Quality");
    expect(body.categoryWeights.Maintainability).toBe(0.15);
  });

  it("applies a stored Software Quality weight to Maintainability", async () => {
    mockedPrisma.scoringConfig.findFirst.mockResolvedValueOnce({
      id: "cfg-legacy",
      criterionWeights: {},
      categoryWeights: { Governance: 0.3, "Software Quality": 0.4 },
      criterionRequirementLevels: {},
      complexityThreshold: 15,
      complexityMaxCcnThreshold: 30,
      spectralRulesetSource: null,
    });

    const response = await app.inject({ method: "GET", url: "/api/admin/scoring" });

    expect(response.statusCode).toBe(200);
    const body = response.json<ScoringResponse>();
    expect(body.categoryWeights.Governance).toBe(0.3);
    expect(body.categoryWeights.Maintainability).toBe(0.4);
    expect(body.categoryWeights).not.toHaveProperty("Software Quality");
  });

  it("stores a submitted Software Quality weight as Maintainability", async () => {
    mockedPrisma.scoringConfig.create.mockResolvedValueOnce({ id: "cfg-new" });

    const response = await app.inject({
      method: "POST",
      url: "/api/admin/scoring",
      payload: { categoryWeights: { "Software Quality": 0.3 } },
    });

    expect(response.statusCode).toBe(200);
    const [createArgs] = mockedPrisma.scoringConfig.create.mock.calls[0] as [
      { data: { categoryWeights: Record<string, number> } },
    ];
    const stored = createArgs.data.categoryWeights;
    expect(stored).toEqual({ Maintainability: 0.3 });
    const body = response.json<ScoringResponse>();
    expect(body.categoryWeights.Maintainability).toBe(0.3);
    expect(body.categoryWeights).not.toHaveProperty("Software Quality");
  });
});
