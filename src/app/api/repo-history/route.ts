import type { FastifyInstance, FastifyRequest } from "fastify";
import { prisma } from "@/lib/db";

type RepoHistoryRepository = {
  id: string;
  repoUrl: string;
  owner: string;
  name: string;
  description: string | null;
  language: string | null;
  stars: number | null;
  forks: number | null;
  defaultBranch: string | null;
  topics: string[];
  license: string | null;
  version: string | null;
  versionEvidenceSource: string | null;
  versionEvidenceDetail: string | null;
  createdAt: string;
  updatedAt: string;
  analyses: Array<{ checkedAt: Date; score: number }>;
};

export function registerRepoHistoryRoute(fastify: FastifyInstance) {
  fastify.get(
    "/api/repo-history",
    async (
      request: FastifyRequest<{ Querystring: { owner?: string; repo?: string; limit?: string } }>,
      reply
    ) => {
      try {
        const owner = request.query.owner?.trim() ?? "";
        const repo = request.query.repo?.trim() ?? "";

        if (!owner || !repo) {
          return reply
            .status(400)
            .send({ error: "Missing required query params: owner and repo." });
        }

        const parsedLimit = Number(request.query.limit ?? "50");
        const limit = Number.isFinite(parsedLimit)
          ? Math.max(1, Math.min(200, parsedLimit))
          : 50;

        const repository = (await prisma.repo.findFirst({
          where: { owner, name: repo },
          include: {
            analyses: {
              orderBy: { checkedAt: "desc" },
              take: limit,
            },
          },
        })) as RepoHistoryRepository | null;

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
      let message = "An unexpected error occurred.";
      if (err instanceof Error) {
        message = err.message;
      }
      return reply.status(500).send({ error: message });
    }
  });
}
