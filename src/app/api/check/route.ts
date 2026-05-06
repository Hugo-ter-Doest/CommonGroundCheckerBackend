import type { FastifyInstance } from "fastify";
import { runChecks } from "@/lib/checkers";
import { parseGitHubUrl } from "@/lib/github";
import { prisma } from "@/lib/db";

export async function registerCheckRoute(fastify: FastifyInstance) {
  fastify.post("/api/check", async (request, reply) => {
    try {
      const body = request.body as Record<string, unknown> | undefined;
      const repoUrl = typeof body?.repoUrl === "string" ? body.repoUrl : "";
      const helmChartLocations: string[] = Array.isArray(body?.helmChartLocations)
        ? body.helmChartLocations
            .filter((v: unknown) => typeof v === "string")
            .map((v: string) => v.trim().replace(/^\/+|\/+$/g, ""))
            .filter(Boolean)
        : [];
      const documentationLocations: string[] = Array.isArray(
        body?.documentationLocations
      )
        ? body.documentationLocations
            .filter((v: unknown) => typeof v === "string")
            .map((v: string) => v.trim())
            .filter(Boolean)
        : [];
      const dockerLocations: string[] = Array.isArray(body?.dockerLocations)
        ? body.dockerLocations
            .filter((v: unknown) => typeof v === "string")
            .map((v: string) => v.trim())
            .filter(Boolean)
        : [];
      const apiSpecificationLocations: string[] = Array.isArray(
        body?.apiSpecificationLocations
      )
        ? body.apiSpecificationLocations
            .filter((v: unknown) => typeof v === "string")
            .map((v: string) => v.trim())
            .filter(Boolean)
        : [];
      const isRegister = body?.isRegister === true;

      if (!repoUrl) {
        return reply
          .status(400)
          .send({ error: "Missing required field: repoUrl" });
      }

      if (!parseGitHubUrl(repoUrl)) {
        return reply.status(400).send({
          error:
            "Invalid GitHub URL. Please provide a URL like https://github.com/owner/repo",
        });
      }

      const report = await runChecks(repoUrl, {
        helmChartLocations,
        documentationLocations,
        dockerLocations,
        apiSpecificationLocations,
        isRegister,
      });

      const repoRecord = await prisma.repo.upsert({
        where: { repoUrl: report.repoUrl },
        update: {
          owner: report.owner,
          name: report.repo,
          description: report.repoMeta.description,
          language: report.repoMeta.language,
          stars: report.repoMeta.stars,
          forks: report.repoMeta.forks,
          defaultBranch: report.repoMeta.defaultBranch,
          topics: report.repoMeta.topics,
          license: report.repoMeta.license,
          version: report.repoMeta.version,
          versionEvidenceSource: report.repoMeta.versionEvidence.source,
          versionEvidenceDetail: report.repoMeta.versionEvidence.detail,
          helmChartLocations,
          dockerLocations,
          apiSpecificationLocations,
          documentationLocations,
        },
        create: {
          repoUrl: report.repoUrl,
          owner: report.owner,
          name: report.repo,
          description: report.repoMeta.description,
          language: report.repoMeta.language,
          stars: report.repoMeta.stars,
          forks: report.repoMeta.forks,
          defaultBranch: report.repoMeta.defaultBranch,
          topics: report.repoMeta.topics,
          license: report.repoMeta.license,
          version: report.repoMeta.version,
          versionEvidenceSource: report.repoMeta.versionEvidence.source,
          versionEvidenceDetail: report.repoMeta.versionEvidence.detail,
          helmChartLocations,
          dockerLocations,
          apiSpecificationLocations,
          documentationLocations,
        },
      });

      await prisma.repoAnalysis.create({
        data: {
          repoId: repoRecord.id,
          scoringConfigId: report.scoringConfigId,
          checkedAt: new Date(report.checkedAt),
          version: report.repoMeta.version ?? null,
          score: report.score,
          results: report.results as object[],
        },
      });

      return report;
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "An unexpected error occurred.";
      const isNotFound = message.includes("404");
      const isRateLimited = /rate limit exceeded|api rate limit exceeded/i.test(
        message
      );

      if (isRateLimited) {
        return reply
          .status(429)
          .send({
            error:
              "GitHub API rate limit reached. Add GITHUB_TOKEN in .env for higher limits, then restart the app.",
          });
      }

      return reply.status(isNotFound ? 404 : 500).send({
        error: isNotFound
          ? "Repository not found. Make sure it is public and the URL is correct."
          : message,
      });
    }
  });
}
