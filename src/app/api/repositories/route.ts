import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseGitHubUrl } from "@/lib/github";

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : [];
}

export async function GET(req: NextRequest) {
  try {
    const limitParam = req.nextUrl.searchParams.get("limit");
    const parsedLimit = Number(limitParam ?? "12");
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

    return NextResponse.json({
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
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "An unexpected error occurred.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const repoUrl = typeof body?.repoUrl === "string" ? body.repoUrl.trim() : "";
    if (!repoUrl) {
      return NextResponse.json(
        { error: "Missing required field: repoUrl" },
        { status: 400 }
      );
    }

    const parsed = parseGitHubUrl(repoUrl);
    if (!parsed) {
      return NextResponse.json(
        {
          error:
            "Invalid GitHub URL. Please provide a URL like https://github.com/owner/repo",
        },
        { status: 400 }
      );
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
    } = body as Record<string, unknown>;

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
        versionEvidenceSource: typeof versionEvidenceSource === "string" ? versionEvidenceSource : null,
        versionEvidenceDetail: typeof versionEvidenceDetail === "string" ? versionEvidenceDetail : null,
        helmChartLocations: normalizeStringArray(body?.helmChartLocations),
        dockerLocations: normalizeStringArray(body?.dockerLocations),
        apiSpecificationLocations: normalizeStringArray(body?.apiSpecificationLocations),
        documentationLocations: normalizeStringArray(body?.documentationLocations),
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
        versionEvidenceSource: typeof versionEvidenceSource === "string" ? versionEvidenceSource : null,
        versionEvidenceDetail: typeof versionEvidenceDetail === "string" ? versionEvidenceDetail : null,
        helmChartLocations: normalizeStringArray(body?.helmChartLocations),
        dockerLocations: normalizeStringArray(body?.dockerLocations),
        apiSpecificationLocations: normalizeStringArray(body?.apiSpecificationLocations),
        documentationLocations: normalizeStringArray(body?.documentationLocations),
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

    return NextResponse.json({
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
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
