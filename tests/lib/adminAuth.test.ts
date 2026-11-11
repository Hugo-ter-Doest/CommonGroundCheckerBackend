import { describe, it, expect } from "vitest";
import { hashMatches, secretsMatch, sha256Hex } from "@/lib/adminAuth";

describe("adminAuth", () => {
  it("matches identical secrets", () => {
    expect(secretsMatch("s3cret", "s3cret")).toBe(true);
  });

  it("rejects different secrets, including prefixes", () => {
    expect(secretsMatch("s3cre", "s3cret")).toBe(false);
    expect(secretsMatch("other", "s3cret")).toBe(false);
  });

  it("compares a secret against a stored sha256 hash", () => {
    const hash = sha256Hex("repo-token");
    expect(hashMatches("repo-token", hash)).toBe(true);
    expect(hashMatches("repo-token-2", hash)).toBe(false);
  });

  it("rejects a malformed stored hash", () => {
    expect(hashMatches("repo-token", "not-hex")).toBe(false);
  });
});
