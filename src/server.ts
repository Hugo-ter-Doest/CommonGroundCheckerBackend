import Fastify from "fastify";
import { prisma } from "@/lib/db";
import { registerRepositoriesRoutes } from "./app/api/repositories/route";
import { registerRepoAnalysesRoute } from "./app/api/repositories/[repoId]/analyses/route";
import { registerRepoHistoryRoute } from "./app/api/repo-history/route";
import { registerRepositoriesExportRoute } from "./app/api/repositories/export/route";
import { registerOpenApiRoute } from "./app/api/openapi/route";
import { registerAdminScoringRoute } from "./app/api/admin/scoring/route";

export function buildServer() {
  const app = Fastify({ logger: true });

  app.register(registerRepositoriesRoutes);
  app.register(registerRepoAnalysesRoute);
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

  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });

  return app;
}

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOSTNAME ?? "0.0.0.0";

  buildServer()
    .listen({ port, host })
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error(error);
      process.exit(1);
    });
}
