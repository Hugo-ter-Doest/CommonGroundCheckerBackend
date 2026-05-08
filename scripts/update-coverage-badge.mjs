import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const summaryPath = path.join(root, "coverage", "coverage-summary.json");
const outputDir = path.join(root, "badges");
const outputPath = path.join(outputDir, "coverage.svg");

if (!fs.existsSync(summaryPath)) {
  console.error(
    "coverage/coverage-summary.json not found. Run `npm run test:coverage` first."
  );
  process.exit(1);
}

const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
const linesPct = Number(summary?.total?.lines?.pct ?? 0);
const percentage = Number.isFinite(linesPct) ? linesPct : 0;
const message = `${percentage.toFixed(1)}%`;

let color = "#e05d44";
if (percentage >= 90) color = "#4c1";
else if (percentage >= 75) color = "#97CA00";
else if (percentage >= 60) color = "#dfb317";

const label = "coverage";
const labelWidth = 68;
const valueWidth = Math.max(50, message.length * 8 + 18);
const totalWidth = labelWidth + valueWidth;

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${label}: ${message}">
  <linearGradient id="smooth" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="round">
    <rect width="${totalWidth}" height="20" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#round)">
    <rect width="${labelWidth}" height="20" fill="#555"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="20" fill="${color}"/>
    <rect width="${totalWidth}" height="20" fill="url(#smooth)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="11">
    <text x="${labelWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${label}</text>
    <text x="${labelWidth / 2}" y="14">${label}</text>
    <text x="${labelWidth + valueWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${message}</text>
    <text x="${labelWidth + valueWidth / 2}" y="14">${message}</text>
  </g>
</svg>
`;

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputPath, svg, "utf8");

console.log(`Coverage badge updated: ${path.relative(root, outputPath)} (${message})`);