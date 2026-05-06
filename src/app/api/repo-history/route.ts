import type { FastifyInstance } from "fastify";
import { prisma } from "@/lib/db";

export async function registerRepoHistoryRoute(fastify: FastifyInstance) {
  fastify.get("/api/repo-history", async (request, reply) => {
    try {
      const query = request.query as {
        owner?: string;
        repo?: string;
        limit?: string;
      };
      const owner = query.owner?.trim() ?? "";
      const repo = query.repo?.trim() ?? "";

      if (!owner || !repo) {
        return reply
          .status(400)
          .send({ error: "Missing required query params: owner and repo." });
      }

      const parsedLimit = Number(query.limit ?? "50");
      const limit = Number.isFinite(parsedLimit)
        ? Math.max(1, Math.min(200, parsedLimit))
        : 50;

      const repository = await prisma.repo.findFirst({
        where: { owner, name: repo },
        include: {
          analyses: {
            orderBy: { checkedAt: "desc" },
            take: limit,
          },
        },
      });

      if (!repository) {
        return reply
          .status(404)
          .send({ error: "Repository not found in analysis history." });
      }

      const repoMeta = {
        description: repository.description,
        language: repository.language,
        stars: repository.stars,
        forks: repository.forks,
        defaultBranch: repository.defaultBranch,
        topics: repository.topics,
        license: repository.license,
        version: repository.version,
        versionEvidence: {
          source:
            repository.versionEvidenceSource === "release" ||
            repository.versionEvidenceSource === "tag" ||
            repository.versionEvidenceSource === "manifest" ||
            repository.versionEvidenceSource === "readme" ||
            repository.versionEvidenceSource === "none"
              ? repository.versionEvidenceSource
              : "none",
          detail: repository.versionEvidenceDetail ?? "",
        },
      };

      return {
        repository: {
          id: repository.id,
          repoUrl: repository.repoUrl,
          owner: repository.owner,
          name: repository.name,
          metadata: repoMeta,
          createdAt: repository.createdAt,
          updatedAt: repository.updatedAt,
        },
        analyses: repository.analyses,
      };
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "An unexpected error occurred.";
      return reply.status(500).send({ error: message });
    }
  });
}
