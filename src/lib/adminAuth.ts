import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Compares two secrets in constant time by comparing their sha256 hashes,
 * so neither the content nor the length of the expected value leaks.
 */
export function secretsMatch(provided: string, expected: string): boolean {
  return hashMatches(provided, sha256Hex(expected));
}

/** Compares a secret against a stored sha256 hex hash in constant time. */
export function hashMatches(provided: string, expectedHashHex: string): boolean {
  const providedHash = createHash("sha256").update(provided).digest();
  const expectedHash = Buffer.from(expectedHashHex, "hex");
  if (expectedHash.length !== providedHash.length) return false;
  return timingSafeEqual(providedHash, expectedHash);
}

export function extractBearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (typeof header !== "string") return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

/**
 * Guards an admin route with the `ADMIN_TOKEN` environment variable.
 * Replies 503 when no token is configured and 401 when the bearer token
 * is missing or wrong. Returns true when the request may proceed.
 */
export function requireAdminToken(
  request: FastifyRequest,
  reply: FastifyReply
): boolean {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken) {
    reply
      .status(503)
      .send({ error: "Admin actions are disabled: ADMIN_TOKEN is not configured." });
    return false;
  }

  const provided = extractBearerToken(request);
  if (!provided || !secretsMatch(provided, adminToken)) {
    reply.status(401).send({ error: "Missing or invalid admin token." });
    return false;
  }

  return true;
}
