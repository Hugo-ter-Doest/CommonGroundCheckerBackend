import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@\//,
        replacement: `${path.resolve(__dirname, "src")}/`,
      },
    ],
  },
  test: {
    environment: "node",
    coverage: {
      reporter: ["text", "html", "json-summary"],
    },
  },
});
