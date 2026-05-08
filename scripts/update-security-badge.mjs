import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const root = process.cwd();
const outputDir = path.join(root, "badges");
const outputPath = path.join(outputDir, "vulnerabilities.svg");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

let parsed;
function extractJsonPayload(value) {
  if (!value || typeof value !== "string") return null;
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return value.slice(start, end + 1);
}

let auditOutput = "";
try {
  auditOutput = execSync(`${npmCommand} audit --json`, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
} catch (error) {
  const maybe = error;
  const stdout = typeof maybe?.stdout === "string" ? maybe.stdout : "";
  const stderr = typeof maybe?.stderr === "string" ? maybe.stderr : "";
  auditOutput = `${stdout}\n${stderr}`;
}

const rawPayload = extractJsonPayload(auditOutput);

if (!rawPayload) {
  console.error("Could not read npm audit JSON output.");
  if (auditOutput.trim()) {
    console.error(auditOutput.trim());
  }
  process.exit(1);
}

try {
  parsed = JSON.parse(rawPayload);
} catch {
  console.error("npm audit returned non-JSON output.");
  process.exit(1);
}

const vulnerabilities = parsed?.metadata?.vulnerabilities ?? {};
const info = Number(vulnerabilities.info ?? 0);
const low = Number(vulnerabilities.low ?? 0);
const moderate = Number(vulnerabilities.moderate ?? 0);
const high = Number(vulnerabilities.high ?? 0);
const critical = Number(vulnerabilities.critical ?? 0);
const total = Number(vulnerabilities.total ?? info + low + moderate + high + critical);

const label = "vulnerabilities";
const message =
  total === 0
    ? "0"
    : `total:${total} h:${high} c:${critical}`;

let color = "#4c1";
if (critical > 0) color = "#e05d44";
else if (high > 0) color = "#fe7d37";
else if (moderate > 0 || low > 0) color = "#dfb317";

const labelWidth = 95;
const valueWidth = Math.max(54, message.length * 7 + 20);
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

console.log(
  `Security badge updated: ${path.relative(root, outputPath)} (${message})`
);