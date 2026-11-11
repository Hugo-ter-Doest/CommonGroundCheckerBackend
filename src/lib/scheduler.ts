import { prisma } from "@/lib/db";
import { computeNextCheckAt } from "@/lib/follow";

type SchedulerLogger = {
  info: (obj: object, msg?: string) => void;
  error: (obj: object, msg?: string) => void;
};

export type SchedulerOptions = {
  checkerUrl: string;
  tickSeconds: number;
  maxConcurrent: number;
  scanTimeoutSeconds: number;
  logger: SchedulerLogger;
  fetchFn?: typeof fetch;
};

type DueRepository = {
  id: string;
  repoUrl: string;
  followed: boolean;
  checkIntervalHours: number | null;
  nextCheckAt: Date | null;
  helmChartLocations: string[];
  documentationLocations: string[];
  dockerLocations: string[];
  apiSpecificationLocations: string[];
  isRegister: boolean;
};

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function readSchedulerConfig(env: NodeJS.ProcessEnv = process.env) {
  return {
    enabled: env.SCHEDULER_ENABLED === "true",
    checkerUrl: (env.CHECKER_URL ?? "").replace(/\/$/, ""),
    tickSeconds: positiveNumber(env.SCHEDULER_TICK_SECONDS, 60),
    maxConcurrent: Math.floor(positiveNumber(env.SCHEDULER_MAX_CONCURRENT, 2)),
    scanTimeoutSeconds: positiveNumber(env.SCHEDULER_SCAN_TIMEOUT_SECONDS, 900),
  };
}

/**
 * Rescans repositories whose `nextCheckAt` has passed by calling the
 * checker's `POST /api/check`, which stores the analysis through this
 * backend. Before a scan starts, the repository is claimed in the database
 * by moving `nextCheckAt` forward, so concurrent ticks and other backend
 * instances never start the same scan twice. A failed scan is logged and
 * retried at the next interval.
 */
export function createScheduler(options: SchedulerOptions) {
  const fetchFn = options.fetchFn ?? fetch;
  const running = new Map<string, AbortController>();
  const inFlight = new Set<Promise<void>>();
  let timer: ReturnType<typeof setInterval> | null = null;

  async function claim(repository: DueRepository, now: Date): Promise<boolean> {
    const result = await prisma.repo.updateMany({
      where: { id: repository.id, nextCheckAt: repository.nextCheckAt },
      data: {
        nextCheckAt: computeNextCheckAt(
          repository.followed,
          repository.checkIntervalHours,
          now,
          now
        ),
      },
    });
    return result.count === 1;
  }

  async function scan(repository: DueRepository, controller: AbortController) {
    const timeout = setTimeout(() => controller.abort(), options.scanTimeoutSeconds * 1000);
    try {
      const response = await fetchFn(`${options.checkerUrl}/api/check`, {
        method: "POST",
        headers: { "content-type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          repoUrl: repository.repoUrl,
          helmChartLocations: repository.helmChartLocations,
          documentationLocations: repository.documentationLocations,
          dockerLocations: repository.dockerLocations,
          apiSpecificationLocations: repository.apiSpecificationLocations,
          isRegister: repository.isRegister,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Checker responded with HTTP ${response.status}`);
      }
      options.logger.info(
        { repoId: repository.id, repoUrl: repository.repoUrl },
        "Scheduled rescan finished"
      );
    } catch (err: unknown) {
      options.logger.error(
        {
          repoId: repository.id,
          repoUrl: repository.repoUrl,
          error: err instanceof Error ? err.message : String(err),
        },
        "Scheduled rescan failed; retrying at the next interval"
      );
    } finally {
      clearTimeout(timeout);
      running.delete(repository.id);
    }
  }

  /**
   * Starts a rescan for every due repository, up to the concurrency limit.
   * With `repoId`, only that repository is considered.
   */
  async function runDue(filter: { repoId?: string } = {}): Promise<void> {
    const capacity = options.maxConcurrent - running.size;
    if (capacity <= 0) return;

    const now = new Date();
    const due = (await prisma.repo.findMany({
      where: {
        nextCheckAt: { lte: now },
        AND: [
          ...(filter.repoId ? [{ id: filter.repoId }] : []),
          ...(running.size > 0 ? [{ id: { notIn: [...running.keys()] } }] : []),
        ],
      },
      orderBy: { nextCheckAt: "asc" },
      take: capacity,
    })) as DueRepository[];

    for (const repository of due) {
      if (running.size >= options.maxConcurrent || running.has(repository.id)) continue;
      const controller = new AbortController();
      running.set(repository.id, controller);

      let claimed = false;
      try {
        claimed = await claim(repository, now);
      } catch (err: unknown) {
        options.logger.error(
          { repoId: repository.id, error: err instanceof Error ? err.message : String(err) },
          "Claiming a scheduled rescan failed"
        );
      }
      if (!claimed) {
        running.delete(repository.id);
        continue;
      }

      const task = scan(repository, controller).finally(() => inFlight.delete(task));
      inFlight.add(task);
    }
  }

  async function tick() {
    try {
      await runDue();
    } catch (err: unknown) {
      options.logger.error(
        { error: err instanceof Error ? err.message : String(err) },
        "Scheduler tick failed"
      );
    }
  }

  return {
    runDue,
    tick,
    isRunning: (repoId: string) => running.has(repoId),
    /** Resolves once every scan started so far has finished. */
    idle: async () => {
      await Promise.all([...inFlight]);
    },
    start() {
      if (timer) return;
      timer = setInterval(() => void tick(), options.tickSeconds * 1000);
      void tick();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
      for (const controller of running.values()) controller.abort();
    },
  };
}

export type Scheduler = ReturnType<typeof createScheduler>;

declare module "fastify" {
  interface FastifyInstance {
    scheduler: Scheduler;
  }
}
