import { describe, it, expect } from "vitest";
import { parseScanRef, toFollowFields } from "@/lib/follow";

describe("parseScanRef", () => {
  it("reads null and an empty or blank string as the released version", () => {
    expect(parseScanRef(null)).toBeNull();
    expect(parseScanRef("")).toBeNull();
    expect(parseScanRef("   ")).toBeNull();
  });

  it("accepts latest-release and branch or tag names, trimmed", () => {
    expect(parseScanRef("latest-release")).toBe("latest-release");
    expect(parseScanRef("default-branch")).toBe("default-branch");
    expect(parseScanRef(" development ")).toBe("development");
    expect(parseScanRef("release/2.x")).toBe("release/2.x");
    expect(parseScanRef("v1.2.0")).toBe("v1.2.0");
  });

  it("rejects values git does not allow as a ref name", () => {
    for (const value of [
      "two words",
      "a..b",
      "-leading-dash",
      "/leading-slash",
      "trailing/",
      "trailing.",
      "x.lock",
      "a//b",
      "a/.hidden",
      "x@{1}",
      "what?",
      "x~1",
      "x^",
      "a:b",
      "a*",
      "a[b",
      "a\\b",
      "tab\there",
      "x".repeat(256),
    ]) {
      expect(parseScanRef(value), value).toBeUndefined();
    }
  });

  it("rejects values that are not strings", () => {
    expect(parseScanRef(42)).toBeUndefined();
    expect(parseScanRef({})).toBeUndefined();
    expect(parseScanRef(true)).toBeUndefined();
  });
});

describe("toFollowFields", () => {
  it("returns scanRef, null when the repository has none", () => {
    const base = { followed: true, checkIntervalHours: 24, lastCheckedAt: null, nextCheckAt: null };
    expect(toFollowFields(base).scanRef).toBeNull();
    expect(toFollowFields({ ...base, scanRef: "development" }).scanRef).toBe("development");
  });
});
