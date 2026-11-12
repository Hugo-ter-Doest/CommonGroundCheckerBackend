import { describe, it, expect } from "vitest";

import {
  DEFAULT_CATEGORY_WEIGHTS,
  migrateLegacyCategoryWeights,
} from "@/lib/scoring";

describe("DEFAULT_CATEGORY_WEIGHTS", () => {
  it("weights Maintainability at 0.15 and has no Software Quality category", () => {
    expect(DEFAULT_CATEGORY_WEIGHTS.Maintainability).toBe(0.15);
    expect(DEFAULT_CATEGORY_WEIGHTS).not.toHaveProperty("Software Quality");
    expect(Object.keys(DEFAULT_CATEGORY_WEIGHTS).sort()).toEqual([
      "Architecture",
      "Deployment & Operations",
      "Governance",
      "Maintainability",
      "Security",
    ]);
  });
});

describe("migrateLegacyCategoryWeights", () => {
  it("maps a Software Quality weight to Maintainability", () => {
    expect(
      migrateLegacyCategoryWeights({ Governance: 0.3, "Software Quality": 0.4 })
    ).toEqual({ Governance: 0.3, Maintainability: 0.4 });
  });

  it("keeps an existing Maintainability weight over the legacy one", () => {
    expect(
      migrateLegacyCategoryWeights({ Maintainability: 0.1, "Software Quality": 0.4 })
    ).toEqual({ Maintainability: 0.1 });
  });

  it("leaves weights without legacy keys unchanged", () => {
    const weights = { Governance: 0.2, Maintainability: 0.15 };
    expect(migrateLegacyCategoryWeights(weights)).toEqual(weights);
  });
});
