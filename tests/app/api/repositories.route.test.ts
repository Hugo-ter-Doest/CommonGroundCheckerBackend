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
  latestAnalysis: { checkedAt: string; score: number };
};

type AnalysisResponse = {
  id: string;
  repoId: string;
  scoringConfigId: string | null;
  checkedAt: string;
  version: string | null;
  score: number;
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

    it("returns 400 for an invalid GitHub repoUrl", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/repositories",
        payload: { repoUrl: "https://example.com/not-github/repo" },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload) as ErrorResponse;
      expect(body.error).toContain("Invalid GitHub URL");
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
  });
});
