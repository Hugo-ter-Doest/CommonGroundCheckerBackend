import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    repo: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    $disconnect: vi.fn(),
  },
}));

import { prisma } from "@/lib/db";
import { createScheduler, readSchedulerConfig } from "@/lib/scheduler";

type MockFn = ReturnType<typeof vi.fn>;
const mockedPrisma = prisma as unknown as {
  repo: { findMany: MockFn; updateMany: MockFn };
};

const NOW = new Date("2026-11-11T12:00:00Z");

function dueRepo(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    repoUrl: `https://github.com/example/${id}`,
    followed: true,
    checkIntervalHours: 24,
    nextCheckAt: new Date("2026-11-11T11:00:00Z"),
    helmChartLocations: ["charts"],
    documentationLocations: ["docs"],
    dockerLocations: [],
    apiSpecificationLocations: ["api/openapi.yaml"],
    isRegister: true,
    ...overrides,
  };
}

function deferred() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const logger = { info: vi.fn(), error: vi.fn() };

function scheduler(fetchFn: MockFn, maxConcurrent = 2) {
  return createScheduler({
    checkerUrl: "http://checker.test",
    tickSeconds: 10,
    maxConcurrent,
    scanTimeoutSeconds: 900,
    logger,
    fetchFn: fetchFn as unknown as typeof fetch,
  });
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  vi.clearAllMocks();
  mockedPrisma.repo.updateMany.mockResolvedValue({ count: 1 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("scheduler", () => {
  it("selects repositories that are due and calls the checker with their stored options", async () => {
    mockedPrisma.repo.findMany.mockResolvedValue([dueRepo("a")]);
    const fetchFn = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    const s = scheduler(fetchFn);

    await s.tick();
    await s.idle();

    expect(mockedPrisma.repo.findMany).toHaveBeenCalledWith({
      where: { nextCheckAt: { lte: NOW }, AND: [] },
      orderBy: { nextCheckAt: "asc" },
      take: 2,
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://checker.test/api/check");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      repoUrl: "https://github.com/example/a",
      helmChartLocations: ["charts"],
      documentationLocations: ["docs"],
      dockerLocations: [],
      apiSpecificationLocations: ["api/openapi.yaml"],
      isRegister: true,
    });
  });

  it("claims a repository by moving nextCheckAt forward before calling the checker", async () => {
    const repo = dueRepo("a");
    mockedPrisma.repo.findMany.mockResolvedValue([repo]);
    const fetchFn = vi.fn().mockImplementation(() => {
      expect(mockedPrisma.repo.updateMany).toHaveBeenCalledTimes(1);
      return Promise.resolve(new Response("{}", { status: 200 }));
    });
    const s = scheduler(fetchFn);

    await s.tick();
    await s.idle();

    expect(mockedPrisma.repo.updateMany).toHaveBeenCalledWith({
      where: { id: "a", nextCheckAt: repo.nextCheckAt },
      data: { nextCheckAt: new Date("2026-11-12T12:00:00Z") },
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("skips a repository another instance has already claimed", async () => {
    mockedPrisma.repo.findMany.mockResolvedValue([dueRepo("a")]);
    mockedPrisma.repo.updateMany.mockResolvedValue({ count: 0 });
    const fetchFn = vi.fn();
    const s = scheduler(fetchFn);

    await s.tick();
    await s.idle();

    expect(fetchFn).not.toHaveBeenCalled();
    expect(s.isRunning("a")).toBe(false);
  });

  it("clears nextCheckAt when claiming a one-off rescan of an unfollowed repository", async () => {
    mockedPrisma.repo.findMany.mockResolvedValue([
      dueRepo("a", { followed: false, checkIntervalHours: null }),
    ]);
    const s = scheduler(vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));

    await s.runDue({ repoId: "a" });
    await s.idle();

    expect(mockedPrisma.repo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { nextCheckAt: { lte: NOW }, AND: [{ id: "a" }] } })
    );
    expect(mockedPrisma.repo.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { nextCheckAt: null } })
    );
  });

  it("runs at most SCHEDULER_MAX_CONCURRENT scans and never starts a running one twice", async () => {
    const first = deferred();
    const second = deferred();
    const fetchFn = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
      .mockResolvedValue(new Response("{}", { status: 200 }));
    mockedPrisma.repo.findMany.mockResolvedValueOnce([dueRepo("a"), dueRepo("b"), dueRepo("c")]);
    const s = scheduler(fetchFn, 2);

    await s.tick();
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(s.isRunning("a")).toBe(true);
    expect(s.isRunning("b")).toBe(true);
    expect(s.isRunning("c")).toBe(false);

    mockedPrisma.repo.findMany.mockClear();
    await s.tick();
    expect(mockedPrisma.repo.findMany).not.toHaveBeenCalled();

    first.resolve(new Response("{}", { status: 200 }));
    await vi.waitFor(() => expect(s.isRunning("a")).toBe(false));

    mockedPrisma.repo.findMany.mockResolvedValueOnce([dueRepo("c")]);
    await s.tick();
    expect(mockedPrisma.repo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ AND: [{ id: { notIn: ["b"] } }] }) as unknown,
        take: 1,
      })
    );
    expect(fetchFn).toHaveBeenCalledTimes(3);

    second.resolve(new Response("{}", { status: 200 }));
    await s.idle();
  });

  it("logs a failed scan, frees the slot and keeps scanning other repositories", async () => {
    mockedPrisma.repo.findMany.mockResolvedValue([dueRepo("a"), dueRepo("b")]);
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new Error("connection refused"))
      .mockResolvedValueOnce(new Response("{}", { status: 500 }));
    const s = scheduler(fetchFn);

    await s.tick();
    await s.idle();

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledTimes(2);
    expect(logger.error.mock.calls[0][0]).toMatchObject({ repoId: "a", error: "connection refused" });
    expect(logger.error.mock.calls[1][0]).toMatchObject({ repoId: "b", error: "Checker responded with HTTP 500" });
    expect(s.isRunning("a")).toBe(false);
    expect(s.isRunning("b")).toBe(false);
  });

  it("logs a failing tick without throwing", async () => {
    mockedPrisma.repo.findMany.mockRejectedValue(new Error("database down"));
    const s = scheduler(vi.fn());

    await expect(s.tick()).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith({ error: "database down" }, "Scheduler tick failed");
  });

  it("ticks every SCHEDULER_TICK_SECONDS once started and stops on stop()", async () => {
    mockedPrisma.repo.findMany.mockResolvedValue([]);
    const s = scheduler(vi.fn());

    s.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(mockedPrisma.repo.findMany).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(mockedPrisma.repo.findMany).toHaveBeenCalledTimes(2);

    s.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mockedPrisma.repo.findMany).toHaveBeenCalledTimes(2);
  });

  it("aborts a scan that exceeds the scan timeout", async () => {
    mockedPrisma.repo.findMany.mockResolvedValue([dueRepo("a")]);
    const fetchFn = vi.fn().mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        })
    );
    const s = scheduler(fetchFn);

    await s.tick();
    await vi.advanceTimersByTimeAsync(900_000);
    await s.idle();

    expect(logger.error.mock.calls[0][0]).toMatchObject({ repoId: "a", error: "aborted" });
  });
});

describe("readSchedulerConfig", () => {
  it("is disabled by default and uses the documented defaults", () => {
    expect(readSchedulerConfig({})).toEqual({
      enabled: false,
      checkerUrl: "",
      tickSeconds: 60,
      maxConcurrent: 2,
      scanTimeoutSeconds: 900,
    });
  });

  it("reads the environment variables", () => {
    expect(
      readSchedulerConfig({
        SCHEDULER_ENABLED: "true",
        CHECKER_URL: "http://checker.test/",
        SCHEDULER_TICK_SECONDS: "10",
        SCHEDULER_MAX_CONCURRENT: "4",
        SCHEDULER_SCAN_TIMEOUT_SECONDS: "60",
      })
    ).toEqual({
      enabled: true,
      checkerUrl: "http://checker.test",
      tickSeconds: 10,
      maxConcurrent: 4,
      scanTimeoutSeconds: 60,
    });
  });
});
