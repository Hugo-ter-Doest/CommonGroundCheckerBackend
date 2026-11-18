import Fastify from "fastify";
import { prisma } from "@/lib/db";
import { createScheduler, readSchedulerConfig } from "@/lib/scheduler";
import { registerRepositoriesRoutes } from "./app/api/repositories/route";
import { registerRepoAnalysesRoute } from "./app/api/repositories/[repoId]/analyses/route";
import { registerRepoFollowRoute } from "./app/api/repositories/[repoId]/follow/route";
import { registerRepoHistoryRoute } from "./app/api/repo-history/route";
import { registerRepositoriesExportRoute } from "./app/api/repositories/export/route";
import { registerOpenApiRoute } from "./app/api/openapi/route";
import { registerAdminScoringRoute } from "./app/api/admin/scoring/route";

export function buildServer() {
  const app = Fastify({ logger: true });
  const schedulerConfig = readSchedulerConfig();
  const scheduler = createScheduler({ ...schedulerConfig, logger: app.log });
  app.decorate("scheduler", scheduler);

  app.register(registerRepositoriesRoutes);
  app.register(registerRepoAnalysesRoute);
  app.register(registerRepoFollowRoute);
  app.register(registerRepositoriesExportRoute);
  app.register(registerRepoHistoryRoute);
  app.register(registerOpenApiRoute);
  app.register(registerAdminScoringRoute);

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({ error: "Not found" });
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    const typedError = error as { statusCode?: unknown; message?: unknown };
    const statusCode =
      typeof typedError.statusCode === "number" ? typedError.statusCode : 500;
    const message =
      typeof typedError.message === "string"
        ? typedError.message
        : "Internal server error";

    reply.status(statusCode).send({ error: message });
  });

  app.addHook("onReady", () => {
    if (!schedulerConfig.enabled) return Promise.resolve();
    if (!schedulerConfig.checkerUrl) {
      app.log.error("SCHEDULER_ENABLED is true but CHECKER_URL is not set; scheduler not started");
      return Promise.resolve();
    }
    scheduler.start();
    app.log.info(
      {
        checkerUrl: schedulerConfig.checkerUrl,
        tickSeconds: schedulerConfig.tickSeconds,
        maxConcurrent: schedulerConfig.maxConcurrent,
      },
      "Scheduler started"
    );
    return Promise.resolve();
  });

  app.addHook("onClose", async () => {
    scheduler.stop();
    const disconnect = (prisma as unknown as { $disconnect?: unknown }).$disconnect;
    if (typeof disconnect === "function") {
      await disconnect.call(prisma);
    }
  });

  return app;
}

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOSTNAME ?? "0.0.0.0";

  const app = buildServer();
  app.listen({ port, host }).catch((error) => {
    console.error(error);
    process.exit(1);
  });

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      app.close().then(
        () => process.exit(0),
        () => process.exit(1)
      );
    });
  }
}
