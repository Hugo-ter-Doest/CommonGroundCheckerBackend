import type { FastifyInstance } from "fastify";
import { readFileSync } from "node:fs";
import { load } from "js-yaml";

const openApiSpec = load(
  readFileSync(new URL("./openapi.yaml", import.meta.url), "utf8")
) as Record<string, unknown>;

export function registerOpenApiRoute(fastify: FastifyInstance) {
  fastify.get("/api/openapi", async () => openApiSpec);
}
