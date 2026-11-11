import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    repo: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    repoAnalysis: {
      create: vi.fn(),
    },
    $disconnect: vi.fn(),
  },
}));

import { prisma } from "@/lib/db";
import { buildServer } from "@/server";

type MockFn = ReturnType<typeof vi.fn>;
type MockPrisma = {
  repo: {
    upsert: MockFn;
    findUnique: MockFn;
    findMany: MockFn;
    findFirst: MockFn;
    update: MockFn;
  };
  repoAnalysis: { create: MockFn };
};

const mockedPrisma = prisma as unknown as MockPrisma;
const ADMIN_TOKEN = "test-admin-token";
const lastCheckedAt = new Date("2026-11-01T10:00:00Z");

function storedRepo(overrides: Record<string, unknown> = {}) {
  return {
    id: "repo-id",
    owner: "example",
    name: "repo",
    repoUrl: "https://github.com/example/repo",
    helmChartLocations: [],
    dockerLocations: [],
    apiSpecificationLocations: [],
    documentationLocations: [],
    updatedAt: new Date("2026-11-01T10:00:00Z"),
    followed: false,
    checkIntervalHours: null,
    lastCheckedAt,
    nextCheckAt: null,
    ...overrides,
  };
}

let app: ReturnType<typeof buildServer>;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ADMIN_TOKEN = ADMIN_TOKEN;
  mockedPrisma.repo.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve(storedRepo(data))
  );
  app = buildServer();
});

afterEach(async () => {
  await app.close();
  delete process.env.ADMIN_TOKEN;
});

function putFollow(payload: unknown, token: string | null = ADMIN_TOKEN) {
  return app.inject({
    method: "PUT",
    url: "/api/repositories/repo-id/follow",
    headers: token ? { authorization: `Bearer ${token}` } : {},
    payload: payload as Record<string, unknown>,
  });
}

describe("PUT /api/repositories/{repoId}/follow", () => {
  it("follows a repository and schedules the next check from the last check", async () => {
    mockedPrisma.repo.findUnique.mockResolvedValue(storedRepo());

    const response = await putFollow({ followed: true, checkIntervalHours: 24 });

    expect(response.statusCode).toBe(200);
    expect(mockedPrisma.repo.update).toHaveBeenCalledWith({
      where: { id: "repo-id" },
      data: {
        followed: true,
        checkIntervalHours: 24,
        nextCheckAt: new Date("2026-11-02T10:00:00Z"),
      },
    });
    expect(JSON.parse(response.payload)).toEqual({
      id: "repo-id",
      followed: true,
      checkIntervalHours: 24,
      lastCheckedAt: "2026-11-01T10:00:00.000Z",
      nextCheckAt: "2026-11-02T10:00:00.000Z",
    });
  });

  it("defaults to a weekly interval when following without one", async () => {
    mockedPrisma.repo.findUnique.mockResolvedValue(storedRepo());

    const response = await putFollow({ followed: true });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload)).toMatchObject({
      checkIntervalHours: 168,
      nextCheckAt: "2026-11-08T10:00:00.000Z",
    });
  });

  it("makes a never checked repository due immediately", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-05T12:00:00Z"), toFake: ["Date"] });
    try {
      mockedPrisma.repo.findUnique.mockResolvedValue(storedRepo({ lastCheckedAt: null }));

      const response = await putFollow({ followed: true, checkIntervalHours: 720 });

      expect(JSON.parse(response.payload)).toMatchObject({
        nextCheckAt: "2026-11-05T12:00:00.000Z",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("unfollows a repository, keeping its interval and clearing the next check", async () => {
    mockedPrisma.repo.findUnique.mockResolvedValue(
      storedRepo({ followed: true, checkIntervalHours: 720 })
    );

    const response = await putFollow({ followed: false });

    expect(response.statusCode).toBe(200);
    expect(mockedPrisma.repo.update).toHaveBeenCalledWith({
      where: { id: "repo-id" },
      data: { followed: false, checkIntervalHours: 720, nextCheckAt: null },
    });
  });

  it("returns 401 without a bearer token", async () => {
    const response = await putFollow({ followed: true }, null);

    expect(response.statusCode).toBe(401);
    expect(mockedPrisma.repo.update).not.toHaveBeenCalled();
  });

  it("returns 401 with a wrong token", async () => {
    const response = await putFollow({ followed: true }, "wrong-token");

    expect(response.statusCode).toBe(401);
    expect(mockedPrisma.repo.update).not.toHaveBeenCalled();
  });

  it("returns 503 when ADMIN_TOKEN is not configured", async () => {
    delete process.env.ADMIN_TOKEN;

    const response = await putFollow({ followed: true });

    expect(response.statusCode).toBe(503);
    expect(mockedPrisma.repo.findUnique).not.toHaveBeenCalled();
  });

  it("returns 400 when followed is missing", async () => {
    const response = await putFollow({ checkIntervalHours: 24 });

    expect(response.statusCode).toBe(400);
  });

  it("returns 400 for an interval outside the allowed values", async () => {
    const response = await putFollow({ followed: true, checkIntervalHours: 1 });

    expect(response.statusCode).toBe(400);
    expect((JSON.parse(response.payload) as { error: string }).error).toContain("24, 168, 720");
  });

  it("returns 404 for an unknown repository", async () => {
    mockedPrisma.repo.findUnique.mockResolvedValue(null);

    const response = await putFollow({ followed: true });

    expect(response.statusCode).toBe(404);
  });
});

describe("follow fields in responses", () => {
  it("includes the follow settings in the repository list", async () => {
    mockedPrisma.repo.findMany.mockResolvedValue([
      {
        ...storedRepo({
          followed: true,
          checkIntervalHours: 168,
          nextCheckAt: new Date("2026-11-08T10:00:00Z"),
        }),
        _count: { analyses: 2 },
        analyses: [],
      },
    ]);

    const response = await app.inject({ method: "GET", url: "/api/repositories" });

    const body = JSON.parse(response.payload) as { repositories: unknown[] };
    expect(body.repositories[0]).toMatchObject({
      followed: true,
      checkIntervalHours: 168,
      lastCheckedAt: "2026-11-01T10:00:00.000Z",
      nextCheckAt: "2026-11-08T10:00:00.000Z",
    });
  });

  it("includes the follow settings in the repository history", async () => {
    mockedPrisma.repo.findFirst.mockResolvedValue({
      ...storedRepo({ followed: true, checkIntervalHours: 24 }),
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
      createdAt: new Date("2026-11-01T10:00:00Z"),
      analyses: [],
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/repo-history?owner=example&repo=repo",
    });

    const body = JSON.parse(response.payload) as { repository: unknown };
    expect(body.repository).toMatchObject({
      followed: true,
      checkIntervalHours: 24,
      lastCheckedAt: "2026-11-01T10:00:00.000Z",
      nextCheckAt: null,
    });
  });
});

describe("storing an analysis", () => {
  it("records the check time and schedules the next check for a followed repository", async () => {
    mockedPrisma.repo.findUnique.mockResolvedValue(
      storedRepo({ followed: true, checkIntervalHours: 168 })
    );
    mockedPrisma.repoAnalysis.create.mockResolvedValue({ id: "analysis-id" });

    const response = await app.inject({
      method: "POST",
      url: "/api/repositories/repo-id/analyses",
      payload: { checkedAt: "2026-11-10T08:00:00Z", score: 70, results: [] },
    });

    expect(response.statusCode).toBe(201);
    expect(mockedPrisma.repo.update).toHaveBeenCalledWith({
      where: { id: "repo-id" },
      data: {
        lastCheckedAt: new Date("2026-11-10T08:00:00Z"),
        nextCheckAt: new Date("2026-11-17T08:00:00Z"),
      },
    });
  });

  it("records the check time without scheduling an unfollowed repository", async () => {
    mockedPrisma.repo.findUnique.mockResolvedValue(storedRepo());
    mockedPrisma.repoAnalysis.create.mockResolvedValue({ id: "analysis-id" });

    await app.inject({
      method: "POST",
      url: "/api/repositories/repo-id/analyses",
      payload: { checkedAt: "2026-11-10T08:00:00Z", score: 70, results: [] },
    });

    expect(mockedPrisma.repo.update).toHaveBeenCalledWith({
      where: { id: "repo-id" },
      data: { lastCheckedAt: new Date("2026-11-10T08:00:00Z"), nextCheckAt: null },
    });
  });
});
