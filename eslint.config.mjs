import { fileURLToPath } from "node:url";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

const __dirname = fileURLToPath(new URL("./", import.meta.url));

const tsRecommendedRules = {
  ...tsPlugin.configs.recommended.rules,
  ...tsPlugin.configs["recommended-requiring-type-checking"].rules,
};

const jsRecommendedRules = {
  ...tsPlugin.configs.recommended.rules,
};

export default [
  {
    ignores: [
      "src/generated/**",
      "**/src/generated/**",
      "node_modules/**",
      "coverage/**",
      "badges/**",
    ],
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        project: ["./tsconfig.json"],
        tsconfigRootDir: __dirname,
      },
    },
    plugins: { "@typescript-eslint": tsPlugin },
    rules: tsRecommendedRules,
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: { "@typescript-eslint": tsPlugin },
    rules: jsRecommendedRules,
  },
];
