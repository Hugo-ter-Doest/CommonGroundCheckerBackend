import { NextRequest } from "next/server";
import { runChecks } from "@/lib/checkers";
import { parseGitHubUrl } from "@/lib/github";
import { prisma } from "@/lib/db";
import type { CheckReport } from "@/lib/types";

export interface ProgressEvent {
  step: string;
  pct: number;
  done?: true;
  result?: CheckReport;
  error?: string;
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  const repoUrl: string = body?.repoUrl ?? "";
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

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: ProgressEvent) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
        );
      };

      if (!repoUrl) {
        send({ step: "Error", pct: 0, error: "Missing required field: repoUrl" });
        controller.close();
        return;
      }

      if (!parseGitHubUrl(repoUrl)) {
        send({
          step: "Error",
          pct: 0,
          error:
            "Invalid GitHub URL. Please provide a URL like https://github.com/owner/repo",
        });
        controller.close();
        return;
      }

      try {
        send({ step: "Validating repository URL\u2026", pct: 5 });

        const report = await runChecks(
          repoUrl,
          {
            helmChartLocations,
            documentationLocations,
            dockerLocations,
            apiSpecificationLocations,
            isRegister,
          },
          (step, pct) => send({ step, pct })
        );

        send({ step: "Saving results\u2026", pct: 95 });

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

        send({ step: "Analysis complete", pct: 100, done: true, result: report });
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "An unexpected error occurred.";
        const isNotFound = message.includes("404");
        const isRateLimited =
          /rate limit exceeded|api rate limit exceeded/i.test(message);

        send({
          step: "Error",
          pct: 0,
          error: isRateLimited
            ? "GitHub API rate limit reached. Add GITHUB_TOKEN in .env for higher limits, then restart the app."
            : isNotFound
            ? "Repository not found. Make sure it is public and the URL is correct."
            : message,
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
