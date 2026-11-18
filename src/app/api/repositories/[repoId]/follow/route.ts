import type { FastifyInstance } from "fastify";
import { prisma } from "@/lib/db";
import { requireAdminToken } from "@/lib/adminAuth";
import {
  ALLOWED_CHECK_INTERVAL_HOURS,
  DEFAULT_CHECK_INTERVAL_HOURS,
  computeNextCheckAt,
  isAllowedCheckInterval,
  toFollowFields,
} from "@/lib/follow";

export function registerRepoFollowRoute(fastify: FastifyInstance) {
  fastify.put("/api/repositories/:repoId/follow", async (request, reply) => {
    try {
      if (!requireAdminToken(request, reply)) return reply;

      const { repoId } = request.params as { repoId: string };
      const body = (request.body ?? {}) as Record<string, unknown>;

      if (typeof body.followed !== "boolean") {
        return reply
          .status(400)
          .send({ error: "Missing or invalid followed field: expected a boolean." });
      }

      if (
        body.checkIntervalHours !== undefined &&
        body.checkIntervalHours !== null &&
        !isAllowedCheckInterval(body.checkIntervalHours)
      ) {
        return reply.status(400).send({
          error: `Invalid checkIntervalHours: expected one of ${ALLOWED_CHECK_INTERVAL_HOURS.join(", ")}.`,
        });
      }

      const repository = await prisma.repo.findUnique({ where: { id: repoId } });
      if (!repository) {
        return reply.status(404).send({ error: "Repository not found." });
      }

      const followed = body.followed;
      const requestedInterval = isAllowedCheckInterval(body.checkIntervalHours)
        ? body.checkIntervalHours
        : null;
      const checkIntervalHours =
        requestedInterval ??
        repository.checkIntervalHours ??
        (followed ? DEFAULT_CHECK_INTERVAL_HOURS : null);

      const updated = await prisma.repo.update({
        where: { id: repoId },
        data: {
          followed,
          checkIntervalHours,
          nextCheckAt: computeNextCheckAt(
            followed,
            checkIntervalHours,
            repository.lastCheckedAt
          ),
        },
      });

      return { id: updated.id, ...toFollowFields(updated) };
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "An unexpected error occurred.";
      return reply.status(500).send({ error: message });
    }
  });
}
