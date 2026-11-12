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
import { buildServer } from "@/server";

const mockedFindMany = (prisma as unknown as { repo: { findMany: ReturnType<typeof vi.fn> } })
  .repo.findMany;

const SCHEDULER_ENV = ["SCHEDULER_ENABLED", "CHECKER_URL", "SCHEDULER_TICK_SECONDS"];

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mockedFindMany.mockResolvedValue([]);
  for (const name of SCHEDULER_ENV) delete process.env[name];
});

afterEach(() => {
  vi.useRealTimers();
  for (const name of SCHEDULER_ENV) delete process.env[name];
});

describe("scheduler in the server", () => {
  it("is disabled by default", async () => {
    const app = buildServer();
    await app.ready();
    await vi.advanceTimersByTimeAsync(120_000);

    expect(mockedFindMany).not.toHaveBeenCalled();
    await app.close();
  });

  it("starts when SCHEDULER_ENABLED=true and stops ticking on close", async () => {
    process.env.SCHEDULER_ENABLED = "true";
    process.env.CHECKER_URL = "http://checker.test";
    process.env.SCHEDULER_TICK_SECONDS = "10";

    const app = buildServer();
    await app.ready();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(mockedFindMany).toHaveBeenCalledTimes(2);

    await app.close();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mockedFindMany).toHaveBeenCalledTimes(2);
  });

  it("does not start without CHECKER_URL", async () => {
    process.env.SCHEDULER_ENABLED = "true";

    const app = buildServer();
    await app.ready();
    await vi.advanceTimersByTimeAsync(120_000);

    expect(mockedFindMany).not.toHaveBeenCalled();
    await app.close();
  });
});
