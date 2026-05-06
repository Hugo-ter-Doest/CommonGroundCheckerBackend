import type { FastifyInstance } from "fastify";
import { prisma } from "@/lib/db";

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

type NormalizedResult = {
  id: string;
  status: string;
  requirementLevel: string;
  message: string;
};

function normalizeResults(raw: unknown): NormalizedResult[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter(
      (item): item is Record<string, unknown> =>
        item !== null && typeof item === "object" && typeof item.id === "string"
    )
    .map((item) => ({
      id: String(item.id),
      status: typeof item.status === "string" ? item.status : "",
      requirementLevel: typeof item.requirementLevel === "string" ? item.requirementLevel : "",
      message: typeof item.message === "string" ? item.message : "",
    }));
}

export async function registerRepositoriesExportRoute(fastify: FastifyInstance) {
  fastify.get("/api/repositories/export", async (request, reply) => {
    const repositories = await prisma.repo.findMany({
      orderBy: [{ owner: "asc" }, { name: "asc" }],
      include: {
        analyses: {
          orderBy: { checkedAt: "desc" },
          take: 1,
          select: {
            checkedAt: true,
            score: true,
            version: true,
            results: true,
          },
        },
        _count: {
          select: { analyses: true },
        },
      },
    });

    const resultIds = new Set<string>();
    const rows = repositories
      .filter((repository) => repository.analyses[0] !== undefined)
      .map((repository) => {
        const latestAnalysis = repository.analyses[0]!;
        const results = normalizeResults(latestAnalysis.results);
        results.forEach((result) => resultIds.add(result.id));

        return {
          repository,
          latestAnalysis,
          results,
        };
      });

    const sortedResultIds = Array.from(resultIds).sort();
    const resultHeaders = sortedResultIds.flatMap((id) => [
      `result_${id}_status`,
      `result_${id}_requirementLevel`,
      `result_${id}_message`,
    ]);

    const header = [
      "owner",
      "name",
      "repoUrl",
      "latestCheckedAt",
      "latestScore",
      "latestVersion",
      "analysisCount",
      ...resultHeaders,
      "latestResultsJson",
    ].join(",");

    const csvRows = rows.map(({ repository, latestAnalysis, results }) => {
      const resultMap = new Map(results.map((result) => [result.id, result]));

      const rowCells = [
        escapeCsvCell(repository.owner),
        escapeCsvCell(repository.name),
        escapeCsvCell(repository.repoUrl),
        escapeCsvCell(latestAnalysis.checkedAt.toISOString()),
        escapeCsvCell(latestAnalysis.score),
        escapeCsvCell(latestAnalysis.version ?? ""),
        escapeCsvCell(repository._count.analyses),
        ...sortedResultIds.flatMap((id) => {
          const result = resultMap.get(id);
          return [
            escapeCsvCell(result?.status ?? ""),
            escapeCsvCell(result?.requirementLevel ?? ""),
            escapeCsvCell(result?.message ?? ""),
          ];
        }),
        escapeCsvCell(JSON.stringify(latestAnalysis.results ?? [])),
      ];

      return rowCells.join(",");
    });

    const csv = [header, ...csvRows].join("\r\n") + "\r\n";

    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header(
      "Content-Disposition",
      "attachment; filename=common-ground-checker-history.csv"
    );
    return reply.send(csv);
  });
}
