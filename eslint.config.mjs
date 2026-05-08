import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      "src/generated/**",
      "**/src/generated/**",
      ".next/**",
      "node_modules/**",
      "coverage/**",
      "badges/**",
    ],
  },
];

export default config;