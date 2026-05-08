import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

const tsRecommendedRules = {
  ...tsPlugin.configs.recommended.rules,
  ...tsPlugin.configs["recommended-requiring-type-checking"].rules,
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
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        project: "./tsconfig.json",
      },
    },
    plugins: { "@typescript-eslint": tsPlugin },
    rules: tsRecommendedRules,
  },
];
