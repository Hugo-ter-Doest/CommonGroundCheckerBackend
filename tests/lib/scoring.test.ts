import { describe, expect, it } from "vitest";
import { DEFAULT_CRITERION_CONFIG_BY_CHECK_ID } from "@/lib/scoring";

describe("default criterion config", () => {
  it("includes the Maintained criterion as recommended, like the frontend", () => {
    expect(DEFAULT_CRITERION_CONFIG_BY_CHECK_ID.maintenance).toEqual({ weight: 1, requirementLevel: "recommended" });
  });
});
