import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    repo: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    repoAnalysis: {
      create: vi.fn(),
    },
    $disconnect: vi.fn(),
  },
}));

import { prisma } from "@/lib/db";
import { buildServer } from "@/server";

type MockPrisma = {
  repo: {
    upsert: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
  };
  repoAnalysis: {
    create: ReturnType<typeof vi.fn>;
  };
  $disconnect: ReturnType<typeof vi.fn>;
};

const mockedPrisma = prisma as unknown as MockPrisma;

type OpenApiResponse = {
  openapi: string;
  paths: Record<string, unknown>;
};

type ErrorResponse = { error: string };

type RepoPostResponse = {
  id: string;
  owner: string;
  name: string;
  repoUrl: string;
  analysisCount: number;
  latestAnalysis: {
    checkedAt: string;
    score: number;
    rating: number | null;
    categoryRatings: Record<string, number | null> | null;
    aspectRatings?: unknown;
    endorsement?: unknown;
    issueCounts?: unknown;
  };
};

type AnalysisResponse = {
  id: string;
  repoId: string;
  scoringConfigId: string | null;
  checkedAt: string;
  version: string | null;
  score: number;
  rating?: number | null;
  categoryRatings?: Record<string, number | null> | null;
  aspectRatings?: Record<string, { rating: number | null; found?: number; expected?: number }> | null;
  endorsement?: { passed: boolean; reasons: string[] } | null;
  issueCounts?: { errors: number; warnings: number } | null;
  results: unknown[];
  createdAt: string;
};

let app: ReturnType<typeof buildServer>;

beforeEach(() => {
  vi.clearAllMocks();
  app = buildServer();
});

afterEach(async () => {
  await app.close();
  vi.clearAllMocks();
});

describe("API route tests", () => {
  describe("GET /api/openapi", () => {
    it("returns the OpenAPI specification", async () => {
      const response = await app.inject({ method: "GET", url: "/api/openapi" });
      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload) as OpenApiResponse;
      expect(body).toHaveProperty("openapi", "3.1.0");
      expect(body).toHaveProperty("paths");
      expect(body.paths).toHaveProperty("/api/repositories");
      expect(body.paths).toHaveProperty("/api/repositories/export");
      expect(body.paths).toHaveProperty("/api/repositories/{repoId}/analyses");
    });
  });

  describe("POST /api/repositories", () => {
    it("creates or updates repository metadata with a valid GitHub repoUrl", async () => {
      const mockRepo = {
        id: "repo-id",
        owner: "example",
        name: "repo",
        repoUrl: "https://github.com/example/repo",
        helmChartLocations: [],
        dockerLocations: [],
        apiSpecificationLocations: [],
        documentationLocations: [],
        updatedAt: new Date("2026-05-06T00:00:00Z"),
        _count: { analyses: 1 },
        analyses: [{ checkedAt: new Date("2026-05-06T00:00:00Z"), score: 42 }],
      };
      mockedPrisma.repo.upsert.mockResolvedValue(mockRepo);

      const response = await app.inject({
        method: "POST",
        url: "/api/repositories",
        payload: {
          repoUrl: "https://github.com/example/repo",
          description: "A sample repository",
        },
      });
      expect(mockedPrisma.repo.upsert).toHaveBeenCalled();
      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload) as RepoPostResponse;
      expect(body).toMatchObject({
        id: "repo-id",
        owner: "example",
        name: "repo",
        repoUrl: "https://github.com/example/repo",
        analysisCount: 1,
      });
      expect(body.latestAnalysis).toEqual({
        checkedAt: mockRepo.analyses[0].checkedAt.toISOString(),
        score: 42,
        rating: null,
        categoryRatings: null,
        aspectRatings: null,
        endorsement: null,
        issueCounts: null,
      });
    });

    it("creates or updates repository metadata with a valid GitLab repoUrl", async () => {
      const mockRepo = {
        id: "repo-id",
        owner: "rinis-oss/fsc",
        name: "open-fsc",
        repoUrl: "https://gitlab.com/rinis-oss/fsc/open-fsc",
        helmChartLocations: [],
        dockerLocations: [],
        apiSpecificationLocations: [],
        documentationLocations: [],
        updatedAt: new Date("2026-05-06T00:00:00Z"),
        _count: { analyses: 1 },
        analyses: [{ checkedAt: new Date("2026-05-06T00:00:00Z"), score: 50 }],
      };
      mockedPrisma.repo.upsert.mockResolvedValue(mockRepo);

      const response = await app.inject({
        method: "POST",
        url: "/api/repositories",
        payload: {
          repoUrl: "https://gitlab.com/rinis-oss/fsc/open-fsc",
          description: "OpenFSC is een open source peer-to-peer-systeem...",
        },
      });
      expect(mockedPrisma.repo.upsert).toHaveBeenCalled();
      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload) as RepoPostResponse;
      expect(body).toMatchObject({
        id: "repo-id",
        owner: "rinis-oss/fsc",
        name: "open-fsc",
        repoUrl: "https://gitlab.com/rinis-oss/fsc/open-fsc",
        analysisCount: 1,
      });
      expect(body.latestAnalysis).toEqual({
        checkedAt: mockRepo.analyses[0].checkedAt.toISOString(),
        score: 50,
        rating: null,
        categoryRatings: null,
        aspectRatings: null,
        endorsement: null,
        issueCounts: null,
      });
    });

    it("returns 400 when repoUrl is missing", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/repositories",
        payload: { description: "No repo URL" },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload) as ErrorResponse;
      expect(body).toEqual({ error: "Missing required field: repoUrl" });
    });

    it("returns 400 for an invalid GitHub or GitLab repoUrl", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/repositories",
        payload: { repoUrl: "https://example.com/not-github/repo" },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload) as ErrorResponse;
      expect(body.error).toContain("Invalid GitHub or GitLab URL");
    });
  });

  describe("POST /api/repositories/{repoId}/analyses", () => {
    it("returns 404 when the repository does not exist", async () => {
      mockedPrisma.repo.findUnique.mockResolvedValue(null);

      const response = await app.inject({
        method: "POST",
        url: "/api/repositories/missing-repo/analyses",
        payload: {
          checkedAt: "2026-05-06T00:00:00Z",
          score: 65,
          results: [],
        },
      });

      expect(mockedPrisma.repo.findUnique).toHaveBeenCalledWith({ where: { id: "missing-repo" } });
      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.payload) as ErrorResponse;
      expect(body).toEqual({ error: "Repository not found." });
    });

    it("returns 400 when the payload is invalid", async () => {
      mockedPrisma.repo.findUnique.mockResolvedValue({ id: "repo-id" });

      const response = await app.inject({
        method: "POST",
        url: "/api/repositories/repo-id/analyses",
        payload: {
          checkedAt: "not-a-date",
          score: 65,
          results: [],
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload) as ErrorResponse;
      expect(body.error).toContain("Missing or invalid checkedAt field.");
    });

    it("creates a new analysis result for an existing repository", async () => {
      mockedPrisma.repo.findUnique.mockResolvedValue({ id: "repo-id" });
      const mockAnalysis = {
        id: "analysis-id",
        repoId: "repo-id",
        scoringConfigId: null,
        checkedAt: new Date("2026-05-06T00:00:00Z"),
        version: null,
        score: 80,
        results: [],
        createdAt: new Date("2026-05-06T00:00:00Z"),
      };
      mockedPrisma.repoAnalysis.create.mockResolvedValue(mockAnalysis);

      const response = await app.inject({
        method: "POST",
        url: "/api/repositories/repo-id/analyses",
        payload: {
          checkedAt: "2026-05-06T00:00:00Z",
          score: 80,
          results: [],
        },
      });

      expect(mockedPrisma.repoAnalysis.create).toHaveBeenCalledWith({
        data: {
          repoId: "repo-id",
          scoringConfigId: null,
          checkedAt: new Date("2026-05-06T00:00:00Z"),
          version: null,
          score: 80,
          rating: null,
          results: [],
        },
      });
      expect(response.statusCode).toBe(201);

      const body = JSON.parse(response.payload) as AnalysisResponse;
      expect(body).toEqual({
        id: "analysis-id",
        repoId: "repo-id",
        scoringConfigId: null,
        checkedAt: "2026-05-06T00:00:00.000Z",
        version: null,
        score: 80,
        results: [],
        createdAt: "2026-05-06T00:00:00.000Z",
      });
    });

    it("stores the overall rating and the rating per category", async () => {
      mockedPrisma.repo.findUnique.mockResolvedValue({ id: "repo-id" });
      const categoryRatings = { Governance: 4.2, Security: null, Architecture: 0.5, "Software Quality": 5.5 };
      const aspectRatings = {
        licensing: { rating: 4.2 },
        modularity: { rating: null },
        "community-documents": { rating: 4, found: 4, expected: 5 },
      };
      const endorsement = { passed: false, reasons: ["Mandatory criterion fails: Open source licence"] };
      mockedPrisma.repoAnalysis.create.mockResolvedValue({
        id: "analysis-id",
        repoId: "repo-id",
        scoringConfigId: null,
        checkedAt: new Date("2026-05-06T00:00:00Z"),
        version: null,
        score: 80,
        rating: 3.4,
        categoryRatings,
        aspectRatings,
        endorsement,
        results: [],
        createdAt: new Date("2026-05-06T00:00:00Z"),
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/repositories/repo-id/analyses",
        payload: {
          checkedAt: "2026-05-06T00:00:00Z",
          score: 80,
          rating: 3.4,
          categoryRatings,
          aspectRatings,
          endorsement,
          results: [],
        },
      });

      expect(mockedPrisma.repoAnalysis.create).toHaveBeenCalledWith({
        data: {
          repoId: "repo-id",
          scoringConfigId: null,
          checkedAt: new Date("2026-05-06T00:00:00Z"),
          version: null,
          score: 80,
          rating: 3.4,
          categoryRatings,
          aspectRatings,
          endorsement,
          results: [],
        },
      });
      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload) as AnalysisResponse;
      expect(body.rating).toBe(3.4);
      expect(body.categoryRatings).toEqual(categoryRatings);
      expect(body.aspectRatings).toEqual(aspectRatings);
      expect(body.endorsement).toEqual(endorsement);
    });

    it.each([
      ["an array", [{ rating: 3 }]],
      ["a bare number per aspect", { licensing: 4.2 }],
      ["a rating out of range", { licensing: { rating: 6 } }],
      ["a found count without expected", { "community-documents": { rating: 4, found: 4 } }],
      ["more found than expected", { "community-documents": { rating: 5, found: 6, expected: 5 } }],
      ["a fractional count", { "community-documents": { rating: 4, found: 1.5, expected: 5 } }],
    ])("returns 400 when aspectRatings is %s", async (_label, aspectRatings) => {
      mockedPrisma.repo.findUnique.mockResolvedValue({ id: "repo-id" });

      const response = await app.inject({
        method: "POST",
        url: "/api/repositories/repo-id/analyses",
        payload: { checkedAt: "2026-05-06T00:00:00Z", score: 80, aspectRatings, results: [] },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload) as ErrorResponse;
      expect(body.error).toContain("Invalid aspectRatings field");
      expect(mockedPrisma.repoAnalysis.create).not.toHaveBeenCalled();
    });

    it.each([
      ["a boolean", true],
      ["missing reasons", { passed: true }],
      ["a string passed", { passed: "yes", reasons: [] }],
      ["a reason that is not text", { passed: false, reasons: [3] }],
    ])("returns 400 when endorsement is %s", async (_label, endorsement) => {
      mockedPrisma.repo.findUnique.mockResolvedValue({ id: "repo-id" });

      const response = await app.inject({
        method: "POST",
        url: "/api/repositories/repo-id/analyses",
        payload: { checkedAt: "2026-05-06T00:00:00Z", score: 80, endorsement, results: [] },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload) as ErrorResponse;
      expect(body.error).toContain("Invalid endorsement field");
      expect(mockedPrisma.repoAnalysis.create).not.toHaveBeenCalled();
    });

    it("stores the issue counts", async () => {
      mockedPrisma.repo.findUnique.mockResolvedValue({ id: "repo-id" });
      mockedPrisma.repoAnalysis.create.mockResolvedValue({ id: "analysis-id", issueCounts: { errors: 5, warnings: 4 } });

      const response = await app.inject({
        method: "POST",
        url: "/api/repositories/repo-id/analyses",
        payload: {
          checkedAt: "2026-05-06T00:00:00Z",
          score: 68,
          issueCounts: { errors: 5, warnings: 4 },
          results: [],
        },
      });

      expect(response.statusCode).toBe(201);
      const [createArgs] = mockedPrisma.repoAnalysis.create.mock.calls[0] as [{ data: Record<string, unknown> }];
      expect(createArgs.data.issueCounts).toEqual({ errors: 5, warnings: 4 });
      const body = JSON.parse(response.payload) as AnalysisResponse;
      expect(body.issueCounts).toEqual({ errors: 5, warnings: 4 });
    });

    it.each([
      ["a number", 3],
      ["an array", [1, 2]],
      ["missing warnings", { errors: 1 }],
      ["a negative count", { errors: -1, warnings: 0 }],
      ["a fractional count", { errors: 1.5, warnings: 0 }],
      ["a string count", { errors: "1", warnings: 0 }],
    ])("returns 400 when issueCounts is %s", async (_label, issueCounts) => {
      mockedPrisma.repo.findUnique.mockResolvedValue({ id: "repo-id" });

      const response = await app.inject({
        method: "POST",
        url: "/api/repositories/repo-id/analyses",
        payload: { checkedAt: "2026-05-06T00:00:00Z", score: 80, issueCounts, results: [] },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload) as ErrorResponse;
      expect(body.error).toContain("Invalid issueCounts field");
      expect(mockedPrisma.repoAnalysis.create).not.toHaveBeenCalled();
    });

    it("accepts null ratings and a null endorsement", async () => {
      mockedPrisma.repo.findUnique.mockResolvedValue({ id: "repo-id" });
      mockedPrisma.repoAnalysis.create.mockResolvedValue({ id: "analysis-id" });

      const response = await app.inject({
        method: "POST",
        url: "/api/repositories/repo-id/analyses",
        payload: {
          checkedAt: "2026-05-06T00:00:00Z",
          score: 0,
          rating: null,
          categoryRatings: null,
          aspectRatings: null,
          endorsement: null,
          issueCounts: null,
          results: [],
        },
      });

      expect(response.statusCode).toBe(201);
      const [createArgs] = mockedPrisma.repoAnalysis.create.mock.calls[0] as [{ data: Record<string, unknown> }];
      expect(createArgs.data.rating).toBeNull();
      expect(createArgs.data).not.toHaveProperty("categoryRatings");
      expect(createArgs.data).not.toHaveProperty("aspectRatings");
      expect(createArgs.data).not.toHaveProperty("endorsement");
      expect(createArgs.data).not.toHaveProperty("issueCounts");
    });

    it.each([
      ["above 5.5", 5.6],
      ["below 0.5", 0.4],
      ["a string", "3.4"],
      ["a boolean", true],
    ])("returns 400 when rating is %s", async (_label, rating) => {
      mockedPrisma.repo.findUnique.mockResolvedValue({ id: "repo-id" });

      const response = await app.inject({
        method: "POST",
        url: "/api/repositories/repo-id/analyses",
        payload: {
          checkedAt: "2026-05-06T00:00:00Z",
          score: 80,
          rating,
          results: [],
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload) as ErrorResponse;
      expect(body.error).toContain("Invalid rating field");
      expect(mockedPrisma.repoAnalysis.create).not.toHaveBeenCalled();
    });

    it.each([
      ["an array", [3.4]],
      ["a number", 3.4],
      ["an object with a rating out of range", { Governance: 6 }],
      ["an object with a string", { Governance: "4" }],
    ])("returns 400 when categoryRatings is %s", async (_label, categoryRatings) => {
      mockedPrisma.repo.findUnique.mockResolvedValue({ id: "repo-id" });

      const response = await app.inject({
        method: "POST",
        url: "/api/repositories/repo-id/analyses",
        payload: {
          checkedAt: "2026-05-06T00:00:00Z",
          score: 80,
          rating: 3.4,
          categoryRatings,
          results: [],
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload) as ErrorResponse;
      expect(body.error).toContain("Invalid categoryRatings field");
      expect(mockedPrisma.repoAnalysis.create).not.toHaveBeenCalled();
    });
  });

  describe("ratings in the read routes", () => {
    const analysis = {
      checkedAt: new Date("2026-05-06T00:00:00Z"),
      score: 70,
      rating: 3.4,
      categoryRatings: { Governance: 4.2, Security: null },
      aspectRatings: { licensing: { rating: 4.2 }, containerisation: { rating: 3, found: 2, expected: 3 } },
      endorsement: { passed: true, reasons: [] },
      issueCounts: { errors: 0, warnings: 3 },
    };

    it("returns the latest analysis rating in the repository list", async () => {
      mockedPrisma.repo.findMany.mockResolvedValue([
        {
          id: "repo-id",
          owner: "example",
          name: "repo",
          repoUrl: "https://github.com/example/repo",
          helmChartLocations: [],
          dockerLocations: [],
          apiSpecificationLocations: [],
          documentationLocations: [],
          updatedAt: new Date("2026-05-06T00:00:00Z"),
          _count: { analyses: 1 },
          analyses: [analysis],
        },
      ]);

      const response = await app.inject({ method: "GET", url: "/api/repositories" });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload) as { repositories: RepoPostResponse[] };
      expect(body.repositories[0].latestAnalysis).toEqual({
        checkedAt: "2026-05-06T00:00:00.000Z",
        score: 70,
        rating: 3.4,
        categoryRatings: { Governance: 4.2, Security: null },
        aspectRatings: { licensing: { rating: 4.2 }, containerisation: { rating: 3, found: 2, expected: 3 } },
        endorsement: { passed: true, reasons: [] },
        issueCounts: { errors: 0, warnings: 3 },
      });
      const findManyArgs = mockedPrisma.repo.findMany.mock.calls[0][0] as {
        include: { analyses: { select: Record<string, boolean> } };
      };
      expect(findManyArgs.include.analyses.select).toMatchObject({
        rating: true,
        categoryRatings: true,
        aspectRatings: true,
        endorsement: true,
        issueCounts: true,
      });
    });

    it("returns the ratings of every analysis in the repository history", async () => {
      mockedPrisma.repo.findFirst.mockResolvedValue({
        id: "repo-id",
        repoUrl: "https://github.com/example/repo",
        owner: "example",
        name: "repo",
        description: null,
        language: null,
        stars: 0,
        forks: 0,
        defaultBranch: "main",
        topics: [],
        license: null,
        version: null,
        versionEvidenceSource: null,
        versionEvidenceDetail: null,
        createdAt: "2026-05-06T00:00:00.000Z",
        updatedAt: "2026-05-06T00:00:00.000Z",
        analyses: [{ id: "analysis-id", ...analysis, results: [] }],
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/repo-history?owner=example&repo=repo",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload) as { analyses: AnalysisResponse[] };
      expect(body.analyses[0].rating).toBe(3.4);
      expect(body.analyses[0].categoryRatings).toEqual({ Governance: 4.2, Security: null });
      expect(body.analyses[0].aspectRatings).toEqual(analysis.aspectRatings);
      expect(body.analyses[0].endorsement).toEqual({ passed: true, reasons: [] });
      expect(body.analyses[0].issueCounts).toEqual({ errors: 0, warnings: 3 });
    });

    it("exports the latest rating and the rating per category as CSV columns", async () => {
      mockedPrisma.repo.findMany.mockResolvedValue([
        {
          owner: "example",
          name: "repo",
          repoUrl: "https://github.com/example/repo",
          _count: { analyses: 2 },
          analyses: [{ ...analysis, version: "1.0.0", results: [] }],
        },
        {
          owner: "example",
          name: "older",
          repoUrl: "https://github.com/example/older",
          _count: { analyses: 1 },
          analyses: [
            {
              checkedAt: new Date("2026-05-01T00:00:00Z"),
              score: 50,
              rating: null,
              categoryRatings: null,
              aspectRatings: null,
              endorsement: null,
              issueCounts: null,
              version: null,
              results: [],
            },
          ],
        },
      ]);

      const response = await app.inject({ method: "GET", url: "/api/repositories/export" });

      expect(response.statusCode).toBe(200);
      const [header, firstRow, secondRow] = response.payload.split("\r\n");
      expect(header).toBe(
        "owner,name,repoUrl,latestCheckedAt,latestScore,latestRating,rating_Governance,rating_Security,aspect_containerisation,aspect_licensing,latestPassed,latestErrors,latestWarnings,latestVersion,analysisCount,latestResultsJson"
      );
      expect(firstRow).toBe(
        "example,repo,https://github.com/example/repo,2026-05-06T00:00:00.000Z,70,3.4,4.2,,3,4.2,true,0,3,1.0.0,2,[]"
      );
      expect(secondRow).toBe(
        "example,older,https://github.com/example/older,2026-05-01T00:00:00.000Z,50,,,,,,,,,,1,[]"
      );
    });
  });
});
