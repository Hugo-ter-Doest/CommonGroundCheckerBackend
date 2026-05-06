import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ repoId: string }> }
) {
  try {
    const params = await context.params;
    const repoId = params.repoId;
    if (!repoId) {
      return NextResponse.json(
        { error: "Missing repository id in the request path." },
        { status: 400 }
      );
    }

    const repository = await prisma.repo.findUnique({ where: { id: repoId } });
    if (!repository) {
      return NextResponse.json(
        { error: "Repository not found." },
        { status: 404 }
      );
    }

    const body = await req.json();
    const checkedAt = typeof body?.checkedAt === "string" ? body.checkedAt : "";
    const score = typeof body?.score === "number" ? body.score : undefined;
    const results = body?.results;
    const scoringConfigId =
      typeof body?.scoringConfigId === "string"
        ? body.scoringConfigId
        : null;
    const version = typeof body?.version === "string" ? body.version : null;

    if (!checkedAt || Number.isNaN(Date.parse(checkedAt))) {
      return NextResponse.json(
        { error: "Missing or invalid checkedAt field." },
        { status: 400 }
      );
    }

    if (typeof score !== "number" || !Number.isFinite(score)) {
      return NextResponse.json(
        { error: "Missing or invalid score field." },
        { status: 400 }
      );
    }

    if (!Array.isArray(results)) {
      return NextResponse.json(
        { error: "Missing or invalid results field." },
        { status: 400 }
      );
    }

    const analysis = await prisma.repoAnalysis.create({
      data: {
        repoId,
        scoringConfigId,
        checkedAt: new Date(checkedAt),
        version,
        score,
        results,
      },
    });

    return NextResponse.json(analysis, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
