import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { prisma } from "@/lib/db";
import { extractBearerToken, hashMatches, secretsMatch, sha256Hex } from "@/lib/adminAuth";
import {
  ALLOWED_CHECK_INTERVAL_HOURS,
  DEFAULT_CHECK_INTERVAL_HOURS,
  isAllowedCheckInterval,
} from "@/lib/follow";
import { parseRepositoryUrl } from "@/lib/repo";

type WebhookOptions = {
  helmChartLocations?: string[];
  documentationLocations?: string[];
  dockerLocations?: string[];
  apiSpecificationLocations?: string[];
  isRegister?: boolean;
};

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractOptions(value: unknown): WebhookOptions {
  if (!value || typeof value !== "object") return {};
  const raw = value as Record<string, unknown>;
  return {
    helmChartLocations: normalizeStringArray(raw.helmChartLocations),
    documentationLocations: normalizeStringArray(raw.documentationLocations),
    dockerLocations: normalizeStringArray(raw.dockerLocations),
    apiSpecificationLocations: normalizeStringArray(raw.apiSpecificationLocations),
    isRegister: typeof raw.isRegister === "boolean" ? raw.isRegister : undefined,
  };
}

function generateRepositoryToken(): string {
  return randomBytes(32).toString("base64url");
}

export function registerWebhookRoute(fastify: FastifyInstance) {
  fastify.post("/api/webhook", async (request, reply) => {
    try {
      const body = (request.body ?? {}) as Record<string, unknown>;
      const repoUrl = typeof body.repoUrl === "string" ? body.repoUrl.trim() : "";
      const action = body.action;

      if (!repoUrl) {
        return reply.status(400).send({ error: "Missing required field: repoUrl" });
      }
      if (action !== "register" && action !== "rescan") {
        return reply
          .status(400)
          .send({ error: 'Invalid action: expected "register" or "rescan".' });
      }

      const adminToken = process.env.WEBHOOK_ADMIN_TOKEN;
      const provided = extractBearerToken(request);
      const isAdmin = !!adminToken && !!provided && secretsMatch(provided, adminToken);

      if (action === "register") {
        if (!adminToken) {
          return reply.status(503).send({
            error: "Registration is disabled: WEBHOOK_ADMIN_TOKEN is not configured.",
          });
        }
        if (!isAdmin) {
          return reply.status(401).send({ error: "Missing or invalid admin token." });
        }

        const parsed = parseRepositoryUrl(repoUrl);
        if (!parsed) {
          return reply.status(400).send({
            error:
              "Invalid GitHub or GitLab URL. Please provide a URL like https://github.com/owner/repo or https://gitlab.com/group/project",
          });
        }

        if (
          body.checkIntervalHours !== undefined &&
          !isAllowedCheckInterval(body.checkIntervalHours)
        ) {
          return reply.status(400).send({
            error: `Invalid checkIntervalHours: expected one of ${ALLOWED_CHECK_INTERVAL_HOURS.join(", ")}.`,
          });
        }
        const checkIntervalHours = isAllowedCheckInterval(body.checkIntervalHours)
          ? body.checkIntervalHours
          : DEFAULT_CHECK_INTERVAL_HOURS;

        const options = extractOptions(body.options);
        const token = generateRepositoryToken();
        const now = new Date();
        const settings = {
          followed: true,
          checkIntervalHours,
          nextCheckAt: now,
          webhookTokenHash: sha256Hex(token),
          ...(options.helmChartLocations ? { helmChartLocations: options.helmChartLocations } : {}),
          ...(options.documentationLocations
            ? { documentationLocations: options.documentationLocations }
            : {}),
          ...(options.dockerLocations ? { dockerLocations: options.dockerLocations } : {}),
          ...(options.apiSpecificationLocations
            ? { apiSpecificationLocations: options.apiSpecificationLocations }
            : {}),
          ...(options.isRegister !== undefined ? { isRegister: options.isRegister } : {}),
        };

        const repository = await prisma.repo.upsert({
          where: { repoUrl },
          update: settings,
          create: {
            repoUrl,
            owner: parsed.owner,
            name: parsed.repo,
            helmChartLocations: [],
            documentationLocations: [],
            dockerLocations: [],
            apiSpecificationLocations: [],
            ...settings,
          },
        });

        await fastify.scheduler.runDue({ repoId: repository.id });

        return reply.status(202).send({
          repoId: repository.id,
          status: "queued",
          nextCheckAt: now,
          token,
        });
      }

      if (!provided) {
        return reply.status(401).send({ error: "Missing or invalid repository token." });
      }

      const repository = await prisma.repo.findUnique({ where: { repoUrl } });
      if (!repository) {
        return reply.status(404).send({ error: "Repository not found." });
      }

      const isRepositoryToken =
        !!repository.webhookTokenHash && hashMatches(provided, repository.webhookTokenHash);
      if (!isAdmin && !isRepositoryToken) {
        return reply.status(401).send({ error: "Missing or invalid repository token." });
      }

      const now = new Date();
      const queued = fastify.scheduler.isRunning(repository.id)
        ? { count: 0 }
        : await prisma.repo.updateMany({
            where: {
              id: repository.id,
              OR: [{ nextCheckAt: null }, { nextCheckAt: { gt: now } }],
            },
            data: { nextCheckAt: now },
          });

      if (queued.count === 0) {
        return reply.status(202).send({
          repoId: repository.id,
          status: "already queued",
          nextCheckAt: repository.nextCheckAt,
        });
      }

      await fastify.scheduler.runDue({ repoId: repository.id });

      return reply.status(202).send({
        repoId: repository.id,
        status: "queued",
        nextCheckAt: now,
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "An unexpected error occurred.";
      return reply.status(500).send({ error: message });
    }
  });
}
