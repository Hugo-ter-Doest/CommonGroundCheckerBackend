import type { FastifyInstance } from "fastify";
import { prisma } from "@/lib/db";

export function registerRepoAnalysesRoute(fastify: FastifyInstance) {
  fastify.post(
    "/api/repositories/:repoId/analyses",
    async (request, reply) => {
      try {
        const params = request.params as { repoId?: string };
        const repoId = params.repoId;
        if (!repoId) {
          return reply
            .status(400)
            .send({ error: "Missing repository id in the request path." });
        }

        const repository = await prisma.repo.findUnique({ where: { id: repoId } });
        if (!repository) {
          return reply.status(404).send({ error: "Repository not found." });
        }

        const body = request.body as Record<string, unknown>;
        const checkedAt = typeof body?.checkedAt === "string" ? body.checkedAt : "";
        const score = typeof body?.score === "number" ? body.score : undefined;
        const results = body?.results;
        const scoringConfigId =
          typeof body?.scoringConfigId === "string"
            ? body.scoringConfigId
            : null;
        const version = typeof body?.version === "string" ? body.version : null;

        if (!checkedAt || Number.isNaN(Date.parse(checkedAt))) {
          return reply
            .status(400)
            .send({ error: "Missing or invalid checkedAt field." });
        }

        if (typeof score !== "number" || !Number.isFinite(score)) {
          return reply
            .status(400)
            .send({ error: "Missing or invalid score field." });
        }

        if (!Array.isArray(results)) {
          return reply
            .status(400)
            .send({ error: "Missing or invalid results field." });
        }

        const analysis = await prisma.repoAnalysis.create({
          data: {
            repoId,
            scoringConfigId,
            checkedAt: new Date(checkedAt),
            version,
            score,
            results,
          },
        });

        return reply.status(201).send(analysis);
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "An unexpected error occurred.";
        return reply.status(500).send({ error: message });
      }
    }
  );
}
