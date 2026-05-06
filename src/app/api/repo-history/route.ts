import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const owner = req.nextUrl.searchParams.get("owner")?.trim() ?? "";
    const repo = req.nextUrl.searchParams.get("repo")?.trim() ?? "";

    if (!owner || !repo) {
      return NextResponse.json(
        { error: "Missing required query params: owner and repo." },
        { status: 400 }
      );
    }

    const limitParam = req.nextUrl.searchParams.get("limit");
    const parsedLimit = Number(limitParam ?? "50");
    const limit = Number.isFinite(parsedLimit)
      ? Math.max(1, Math.min(200, parsedLimit))
      : 50;

    const repository = await prisma.repo.findFirst({
      where: {
        owner,
        name: repo,
      },
      include: {
        analyses: {
          orderBy: { checkedAt: "desc" },
          take: limit,
        },
      },
    });

    if (!repository) {
      return NextResponse.json(
        { error: "Repository not found in analysis history." },
        { status: 404 }
      );
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

    return NextResponse.json({
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
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "An unexpected error occurred.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
