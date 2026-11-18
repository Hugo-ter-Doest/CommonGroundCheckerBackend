import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    repo: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    $disconnect: vi.fn(),
  },
}));

import { prisma } from "@/lib/db";
import { sha256Hex } from "@/lib/adminAuth";
import { buildServer } from "@/server";

type MockFn = ReturnType<typeof vi.fn>;
const mockedPrisma = prisma as unknown as {
  repo: { upsert: MockFn; findUnique: MockFn; findMany: MockFn; updateMany: MockFn };
};

type WebhookResponse = {
  repoId: string;
  status: string;
  nextCheckAt: string | null;
  token?: string;
  error?: string;
};

type UpsertArgs = {
  where: { repoUrl: string };
  update: Record<string, unknown>;
  create: Record<string, unknown>;
};

const ADMIN_TOKEN = "webhook-admin-token";
const REPO_TOKEN = "repository-token";
const REPO_URL = "https://github.com/open-zaak/open-zaak";
const NOW = new Date("2026-11-11T12:00:00Z");

let app: ReturnType<typeof buildServer>;
let runDue: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  vi.clearAllMocks();
  process.env.WEBHOOK_ADMIN_TOKEN = ADMIN_TOKEN;
  mockedPrisma.repo.findMany.mockResolvedValue([]);
  mockedPrisma.repo.upsert.mockResolvedValue({ id: "repo-id" });
  mockedPrisma.repo.updateMany.mockResolvedValue({ count: 1 });
  app = buildServer();
  await app.ready();
  runDue = vi.spyOn(app.scheduler, "runDue");
});

afterEach(async () => {
  await app.close();
  vi.useRealTimers();
  delete process.env.WEBHOOK_ADMIN_TOKEN;
});

async function post(payload: Record<string, unknown>, token?: string) {
  const response = await app.inject({
    method: "POST",
    url: "/api/webhook",
    headers: token ? { authorization: `Bearer ${token}` } : {},
    payload,
  });
  return { statusCode: response.statusCode, body: JSON.parse(response.payload) as WebhookResponse };
}

function storedRepo(overrides: Record<string, unknown> = {}) {
  return {
    id: "repo-id",
    repoUrl: REPO_URL,
    followed: true,
    checkIntervalHours: 168,
    nextCheckAt: new Date("2026-11-18T12:00:00Z"),
    webhookTokenHash: sha256Hex(REPO_TOKEN),
    ...overrides,
  };
}

describe("POST /api/webhook", () => {
  describe("register", () => {
    it("follows the repository, returns a repository token once and queues a rescan", async () => {
      const { statusCode, body } = await post(
        {
          repoUrl: REPO_URL,
          action: "register",
          options: { helmChartLocations: ["charts/openzaak"], isRegister: true },
        },
        ADMIN_TOKEN
      );

      expect(statusCode).toBe(202);
      expect(body).toMatchObject({
        repoId: "repo-id",
        status: "queued",
        nextCheckAt: NOW.toISOString(),
      });
      expect(body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);

      const [args] = mockedPrisma.repo.upsert.mock.calls[0] as [UpsertArgs];
      expect(args.where).toEqual({ repoUrl: REPO_URL });
      expect(args.update).toEqual({
        followed: true,
        checkIntervalHours: 168,
        nextCheckAt: NOW,
        webhookTokenHash: sha256Hex(body.token ?? ""),
        helmChartLocations: ["charts/openzaak"],
        isRegister: true,
      });
      expect(args.create).toMatchObject({
        repoUrl: REPO_URL,
        owner: "open-zaak",
        name: "open-zaak",
        webhookTokenHash: sha256Hex(body.token ?? ""),
      });
      expect(JSON.stringify(args)).not.toContain(body.token);
      expect(runDue).toHaveBeenCalledWith({ repoId: "repo-id" });
    });

    it("uses the given check interval", async () => {
      await post({ repoUrl: REPO_URL, action: "register", checkIntervalHours: 24 }, ADMIN_TOKEN);

      const [args] = mockedPrisma.repo.upsert.mock.calls[0] as [UpsertArgs];
      expect(args.update.checkIntervalHours).toBe(24);
    });

    it("rotates the token when an existing repository is registered again", async () => {
      const first = await post({ repoUrl: REPO_URL, action: "register" }, ADMIN_TOKEN);
      const second = await post({ repoUrl: REPO_URL, action: "register" }, ADMIN_TOKEN);

      expect(second.body.token).not.toBe(first.body.token);
      const calls = mockedPrisma.repo.upsert.mock.calls as Array<[UpsertArgs]>;
      expect(calls[1][0].update.webhookTokenHash).toBe(sha256Hex(second.body.token ?? ""));
      expect(calls[1][0].update.webhookTokenHash).not.toBe(calls[0][0].update.webhookTokenHash);
    });

    it("returns 503 when WEBHOOK_ADMIN_TOKEN is not configured", async () => {
      delete process.env.WEBHOOK_ADMIN_TOKEN;

      const { statusCode } = await post({ repoUrl: REPO_URL, action: "register" }, ADMIN_TOKEN);

      expect(statusCode).toBe(503);
      expect(mockedPrisma.repo.upsert).not.toHaveBeenCalled();
    });

    it("returns 401 without a token", async () => {
      const { statusCode } = await post({ repoUrl: REPO_URL, action: "register" });

      expect(statusCode).toBe(401);
      expect(mockedPrisma.repo.upsert).not.toHaveBeenCalled();
    });

    it("returns 401 with a repository token instead of the admin token", async () => {
      const { statusCode } = await post({ repoUrl: REPO_URL, action: "register" }, REPO_TOKEN);

      expect(statusCode).toBe(401);
    });

    it("returns 400 for an unsupported repository URL", async () => {
      const { statusCode } = await post(
        { repoUrl: "https://example.com/a/b", action: "register" },
        ADMIN_TOKEN
      );

      expect(statusCode).toBe(400);
    });

    it("returns 400 for an interval outside the allowed values", async () => {
      const { statusCode } = await post(
        { repoUrl: REPO_URL, action: "register", checkIntervalHours: 2 },
        ADMIN_TOKEN
      );

      expect(statusCode).toBe(400);
    });
  });

  describe("rescan", () => {
    it("queues a rescan with the repository token through the scheduler", async () => {
      mockedPrisma.repo.findUnique.mockResolvedValue(storedRepo());

      const { statusCode, body } = await post({ repoUrl: REPO_URL, action: "rescan" }, REPO_TOKEN);

      expect(statusCode).toBe(202);
      expect(body).toEqual({
        repoId: "repo-id",
        status: "queued",
        nextCheckAt: NOW.toISOString(),
      });
      expect(mockedPrisma.repo.updateMany).toHaveBeenCalledWith({
        where: { id: "repo-id", OR: [{ nextCheckAt: null }, { nextCheckAt: { gt: NOW } }] },
        data: { nextCheckAt: NOW },
      });
      expect(runDue).toHaveBeenCalledWith({ repoId: "repo-id" });
    });

    it("accepts the admin token", async () => {
      mockedPrisma.repo.findUnique.mockResolvedValue(storedRepo());

      const { statusCode } = await post({ repoUrl: REPO_URL, action: "rescan" }, ADMIN_TOKEN);

      expect(statusCode).toBe(202);
    });

    it("answers already queued while a rescan is waiting", async () => {
      mockedPrisma.repo.findUnique.mockResolvedValue(
        storedRepo({ nextCheckAt: new Date("2026-11-11T11:59:00Z") })
      );
      mockedPrisma.repo.updateMany.mockResolvedValue({ count: 0 });

      const { statusCode, body } = await post({ repoUrl: REPO_URL, action: "rescan" }, REPO_TOKEN);

      expect(statusCode).toBe(202);
      expect(body).toEqual({
        repoId: "repo-id",
        status: "already queued",
        nextCheckAt: "2026-11-11T11:59:00.000Z",
      });
      expect(runDue).not.toHaveBeenCalled();
    });

    it("answers already queued while a scan of the repository is running", async () => {
      mockedPrisma.repo.findUnique.mockResolvedValue(storedRepo());
      vi.spyOn(app.scheduler, "isRunning").mockReturnValue(true);

      const { body } = await post({ repoUrl: REPO_URL, action: "rescan" }, REPO_TOKEN);

      expect(body.status).toBe("already queued");
      expect(mockedPrisma.repo.updateMany).not.toHaveBeenCalled();
      expect(runDue).not.toHaveBeenCalled();
    });

    it("returns 404 for an unknown repository", async () => {
      mockedPrisma.repo.findUnique.mockResolvedValue(null);

      const { statusCode } = await post(
        { repoUrl: "https://github.com/example/unknown", action: "rescan" },
        REPO_TOKEN
      );

      expect(statusCode).toBe(404);
    });

    it("returns 401 with a wrong token", async () => {
      mockedPrisma.repo.findUnique.mockResolvedValue(storedRepo());

      const { statusCode } = await post({ repoUrl: REPO_URL, action: "rescan" }, "wrong-token");

      expect(statusCode).toBe(401);
      expect(mockedPrisma.repo.updateMany).not.toHaveBeenCalled();
    });

    it("returns 401 for a repository that has no token yet", async () => {
      mockedPrisma.repo.findUnique.mockResolvedValue(storedRepo({ webhookTokenHash: null }));

      const { statusCode } = await post({ repoUrl: REPO_URL, action: "rescan" }, REPO_TOKEN);

      expect(statusCode).toBe(401);
    });

    it("returns 401 without a token", async () => {
      const { statusCode } = await post({ repoUrl: REPO_URL, action: "rescan" });

      expect(statusCode).toBe(401);
      expect(mockedPrisma.repo.findUnique).not.toHaveBeenCalled();
    });

    it("accepts the repository token when WEBHOOK_ADMIN_TOKEN is not configured", async () => {
      delete process.env.WEBHOOK_ADMIN_TOKEN;
      mockedPrisma.repo.findUnique.mockResolvedValue(storedRepo());

      const { statusCode } = await post({ repoUrl: REPO_URL, action: "rescan" }, REPO_TOKEN);

      expect(statusCode).toBe(202);
    });
  });

  it("returns 400 without repoUrl", async () => {
    const { statusCode } = await post({ action: "rescan" }, REPO_TOKEN);

    expect(statusCode).toBe(400);
  });

  it("returns 400 for an unknown action", async () => {
    const { statusCode, body } = await post({ repoUrl: REPO_URL, action: "delete" }, ADMIN_TOKEN);

    expect(statusCode).toBe(400);
    expect(body.error).toContain("register");
  });

  it("is described in the OpenAPI specification", async () => {
    const response = await app.inject({ method: "GET", url: "/api/openapi" });
    const spec = JSON.parse(response.payload) as { paths: Record<string, unknown> };

    expect(spec.paths).toHaveProperty("/api/webhook");
  });
});
