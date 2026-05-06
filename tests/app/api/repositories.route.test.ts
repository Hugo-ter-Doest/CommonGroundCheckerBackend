import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({
  prisma: {
    repo: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    repoAnalysis: {
      create: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/db";
import { GET as getOpenApi } from "@/app/api/openapi/route";
import { POST as postRepo } from "@/app/api/repositories/route";
import { POST as postRepoAnalysis } from "@/app/api/repositories/[repoId]/analyses/route";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("API route tests", () => {
  describe("GET /api/openapi", () => {
    it("returns the OpenAPI specification", async () => {
      const response = await getOpenApi();
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body).toHaveProperty("openapi", "3.1.0");
      expect(body).toHaveProperty("paths");
      expect(body.paths).toHaveProperty("/api/repositories");
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
      (prisma.repo.upsert as ReturnType<typeof vi.fn>).mockResolvedValue(mockRepo);

      const request = {
        json: async () => ({
          repoUrl: "https://github.com/example/repo",
          description: "A sample repository",
        }),
      } as unknown as NextRequest;

      const response = await postRepo(request);
      expect(prisma.repo.upsert).toHaveBeenCalled();
      expect(response.status).toBe(200);

      const body = await response.json();
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
      const request = {
        json: async () => ({ description: "No repo URL" }),
      } as unknown as NextRequest;

      const response = await postRepo(request);
      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body).toEqual({ error: "Missing required field: repoUrl" });
    });

    it("returns 400 for an invalid GitHub repoUrl", async () => {
      const request = {
        json: async () => ({ repoUrl: "https://example.com/not-github/repo" }),
      } as unknown as NextRequest;

      const response = await postRepo(request);
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("Invalid GitHub URL");
    });
  });

  describe("POST /api/repositories/{repoId}/analyses", () => {
    it("returns 404 when the repository does not exist", async () => {
      (prisma.repo.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const request = {
        json: async () => ({
          checkedAt: "2026-05-06T00:00:00Z",
          score: 65,
          results: [],
        }),
      } as unknown as NextRequest;

      const response = await postRepoAnalysis(request, {
        params: Promise.resolve({ repoId: "missing-repo" }),
      });
      expect(prisma.repo.findUnique).toHaveBeenCalledWith({ where: { id: "missing-repo" } });
      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body).toEqual({ error: "Repository not found." });
    });

    it("returns 400 when the payload is invalid", async () => {
      (prisma.repo.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "repo-id" });

      const request = {
        json: async () => ({
          checkedAt: "not-a-date",
          score: 65,
          results: [],
        }),
      } as unknown as NextRequest;

      const response = await postRepoAnalysis(request, {
        params: Promise.resolve({ repoId: "repo-id" }),
      });
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("Missing or invalid checkedAt field.");
    });

    it("creates a new analysis result for an existing repository", async () => {
      (prisma.repo.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "repo-id" });
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
      (prisma.repoAnalysis.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockAnalysis);

      const request = {
        json: async () => ({
          checkedAt: "2026-05-06T00:00:00Z",
          score: 80,
          results: [],
        }),
      } as unknown as NextRequest;

      const response = await postRepoAnalysis(request, {
        params: Promise.resolve({ repoId: "repo-id" }),
      });
      expect(prisma.repoAnalysis.create).toHaveBeenCalledWith({
        data: {
          repoId: "repo-id",
          scoringConfigId: null,
          checkedAt: new Date("2026-05-06T00:00:00Z"),
          version: null,
          score: 80,
          results: [],
        },
      });
      expect(response.status).toBe(201);

      const body = await response.json();
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
