import type { FastifyInstance } from "fastify";
import { prisma } from "@/lib/db";
import { parseRepositoryUrl } from "@/lib/repo";

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : [];
}

export function registerRepositoriesRoutes(fastify: FastifyInstance) {
  fastify.get("/api/repositories", async (request, reply) => {
    try {
      const query = request.query as { limit?: string };
      const parsedLimit = Number(query.limit ?? "12");
      const limit = Number.isFinite(parsedLimit)
        ? Math.max(1, Math.min(50, parsedLimit))
        : 12;

      const repositories = await prisma.repo.findMany({
        orderBy: { updatedAt: "desc" },
        take: limit,
        include: {
          analyses: {
            orderBy: { checkedAt: "desc" },
            take: 1,
            select: {
              checkedAt: true,
              score: true,
            },
          },
          _count: {
            select: { analyses: true },
          },
        },
      });

      return {
        repositories: repositories.map((repository) => ({
          id: repository.id,
          owner: repository.owner,
          name: repository.name,
          repoUrl: repository.repoUrl,
          helmChartLocations: repository.helmChartLocations,
          dockerLocations: repository.dockerLocations,
          apiSpecificationLocations: repository.apiSpecificationLocations,
          documentationLocations: repository.documentationLocations,
          updatedAt: repository.updatedAt,
          analysisCount: repository._count.analyses,
          latestAnalysis: repository.analyses[0]
            ? {
                checkedAt: repository.analyses[0].checkedAt,
                score: repository.analyses[0].score,
              }
            : null,
        })),
      };
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "An unexpected error occurred.";
      return reply.status(500).send({ error: message });
    }
  });

  fastify.post("/api/repositories", async (request, reply) => {
    try {
      const body = request.body as Record<string, unknown>;
      const repoUrl = typeof body?.repoUrl === "string" ? body.repoUrl.trim() : "";
      if (!repoUrl) {
        return reply.status(400).send({ error: "Missing required field: repoUrl" });
      }

      const parsed = parseRepositoryUrl(repoUrl);
      if (!parsed) {
        return reply.status(400).send({
          error:
            "Invalid GitHub or GitLab URL. Please provide a URL like https://github.com/owner/repo or https://gitlab.com/group/project",
        });
      }

      const {
        description,
        language,
        stars,
        forks,
        defaultBranch,
        topics,
        license,
        version,
        versionEvidenceSource,
        versionEvidenceDetail,
      } = body;

      const repoRecord = await prisma.repo.upsert({
        where: { repoUrl },
        update: {
          owner: parsed.owner,
          name: parsed.repo,
          description: typeof description === "string" ? description : null,
          language: typeof language === "string" ? language : null,
          stars: typeof stars === "number" && Number.isFinite(stars) ? stars : 0,
          forks: typeof forks === "number" && Number.isFinite(forks) ? forks : 0,
          defaultBranch: typeof defaultBranch === "string" ? defaultBranch : null,
          topics: Array.isArray(topics)
            ? topics.filter((item): item is string => typeof item === "string")
            : [],
          license: typeof license === "string" ? license : null,
          version: typeof version === "string" ? version : null,
          versionEvidenceSource:
            typeof versionEvidenceSource === "string"
              ? versionEvidenceSource
              : null,
          versionEvidenceDetail:
            typeof versionEvidenceDetail === "string"
              ? versionEvidenceDetail
              : null,
          helmChartLocations: normalizeStringArray(body?.helmChartLocations),
          dockerLocations: normalizeStringArray(body?.dockerLocations),
          apiSpecificationLocations: normalizeStringArray(
            body?.apiSpecificationLocations
          ),
          documentationLocations: normalizeStringArray(
            body?.documentationLocations
          ),
        },
        create: {
          repoUrl,
          owner: parsed.owner,
          name: parsed.repo,
          description: typeof description === "string" ? description : null,
          language: typeof language === "string" ? language : null,
          stars: typeof stars === "number" && Number.isFinite(stars) ? stars : 0,
          forks: typeof forks === "number" && Number.isFinite(forks) ? forks : 0,
          defaultBranch: typeof defaultBranch === "string" ? defaultBranch : null,
          topics: Array.isArray(topics)
            ? topics.filter((item): item is string => typeof item === "string")
            : [],
          license: typeof license === "string" ? license : null,
          version: typeof version === "string" ? version : null,
          versionEvidenceSource:
            typeof versionEvidenceSource === "string"
              ? versionEvidenceSource
              : null,
          versionEvidenceDetail:
            typeof versionEvidenceDetail === "string"
              ? versionEvidenceDetail
              : null,
          helmChartLocations: normalizeStringArray(body?.helmChartLocations),
          dockerLocations: normalizeStringArray(body?.dockerLocations),
          apiSpecificationLocations: normalizeStringArray(
            body?.apiSpecificationLocations
          ),
          documentationLocations: normalizeStringArray(
            body?.documentationLocations
          ),
        },
        include: {
          _count: { select: { analyses: true } },
          analyses: {
            orderBy: { checkedAt: "desc" },
            take: 1,
            select: { checkedAt: true, score: true },
          },
        },
      });

      return {
        id: repoRecord.id,
        owner: repoRecord.owner,
        name: repoRecord.name,
        repoUrl: repoRecord.repoUrl,
        helmChartLocations: repoRecord.helmChartLocations,
        dockerLocations: repoRecord.dockerLocations,
        apiSpecificationLocations: repoRecord.apiSpecificationLocations,
        documentationLocations: repoRecord.documentationLocations,
        updatedAt: repoRecord.updatedAt,
        analysisCount: repoRecord._count.analyses,
        latestAnalysis: repoRecord.analyses[0]
          ? {
              checkedAt: repoRecord.analyses[0].checkedAt,
              score: repoRecord.analyses[0].score,
            }
          : null,
      };
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "An unexpected error occurred.";
      return reply.status(500).send({ error: message });
    }
  });
}
