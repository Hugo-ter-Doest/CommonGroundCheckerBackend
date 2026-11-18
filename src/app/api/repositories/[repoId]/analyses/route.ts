import type { FastifyInstance } from "fastify";
import { prisma } from "@/lib/db";
import { computeNextCheckAt } from "@/lib/follow";

const SCANNED_REF_KINDS = ["default-branch", "branch", "release", "tag"];

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
        const scannedRef = typeof body?.scannedRef === "string" ? body.scannedRef : null;
        const scannedRefKind =
          typeof body?.scannedRefKind === "string" &&
          SCANNED_REF_KINDS.includes(body.scannedRefKind)
            ? body.scannedRefKind
            : null;
        const scannedCommit =
          typeof body?.scannedCommit === "string" ? body.scannedCommit : null;

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

        const checkedAtDate = new Date(checkedAt);
        const analysis = await prisma.repoAnalysis.create({
          data: {
            repoId,
            scoringConfigId,
            checkedAt: checkedAtDate,
            version,
            scannedRef,
            scannedRefKind,
            scannedCommit,
            score,
            results,
          },
        });

        await prisma.repo.update({
          where: { id: repoId },
          data: {
            lastCheckedAt: checkedAtDate,
            nextCheckAt: computeNextCheckAt(
              repository.followed,
              repository.checkIntervalHours,
              checkedAtDate
            ),
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
