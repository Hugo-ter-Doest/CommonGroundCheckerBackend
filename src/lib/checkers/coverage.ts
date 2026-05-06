import { getFileContent } from "../github";
import type { CheckResult } from "../types";

const COVERAGE_FILE_CANDIDATES = [
  "coverage/coverage-summary.json",
  "coverage-summary.json",
  "coverage/coverage.json",
  "coverage/coverage-final.json",
  "coverage/coverage.xml",
  "coverage.xml",
  "coverage/lcov.info",
  "lcov.info",
];

const README_FILENAMES = [
  "readme.md",
  "readme.txt",
  "readme.rst",
  "readme",
];

function parseCoverageSummaryJson(content: string): number | null {
  try {
    const data = JSON.parse(content);
    const total = data?.total;
    if (total && typeof total === "object") {
      const lines = total.lines;
      if (lines && typeof lines === "object" && typeof lines.pct === "number") {
        return Number(lines.pct);
      }
      const statements = total.statements;
      if (statements && typeof statements === "object" && typeof statements.pct === "number") {
        return Number(statements.pct);
      }
    }
  } catch {
    return null;
  }
  return null;
}

function parseCoverageXml(content: string): number | null {
  const match = content.match(/<coverage[^>]*\bline-rate\s*=\s*"([0-9.]+)"/i);
  if (match && Number.isFinite(Number(match[1]))) {
    return Number(match[1]) * 100;
  }

  const coveredMatch = content.match(/<coverage[^>]*\blines-covered\s*=\s*"(\d+)"/i);
  const validMatch = content.match(/<coverage[^>]*\blines-valid\s*=\s*"(\d+)"/i);
  if (coveredMatch && validMatch) {
    const covered = Number(coveredMatch[1]);
    const valid = Number(validMatch[1]);
    if (valid > 0) {
      return (covered / valid) * 100;
    }
  }

  return null;
}

function parseLcovInfo(content: string): number | null {
  let linesTotal = 0;
  let linesHit = 0;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("LF:")) {
      linesTotal += Number(line.slice(3));
    }
    if (line.startsWith("LH:")) {
      linesHit += Number(line.slice(3));
    }
  }

  if (linesTotal > 0) {
    return (linesHit / linesTotal) * 100;
  }

  return null;
}

function parseCoverageBanner(content: string): number | null {
  const badgeRegexes = [
    /badge\/(?:coverage|cov)-([0-9]{1,3}(?:\.[0-9]+)?)%/i,
    /coverage[^\d\n]{0,80}?([0-9]{1,3}(?:\.[0-9]+)?)%/i,
    /cov[^\d\n]{0,80}?([0-9]{1,3}(?:\.[0-9]+)?)%/i,
  ];

  for (const regex of badgeRegexes) {
    const match = content.match(regex);
    if (match) {
      const value = Number(match[1]);
      if (Number.isFinite(value) && value >= 0 && value <= 100) {
        return value;
      }
    }
  }

  return null;
}

function extractBadgeTextContent(content: string): string {
  const fragments: string[] = [];
  const textTag = /<text[^>]*>([^<]*)<\/text>/gi;
  let match: RegExpExecArray | null;

  while ((match = textTag.exec(content)) !== null) {
    fragments.push(match[1].trim());
  }

  const titleTag = /<title[^>]*>([^<]*)<\/title>/gi;
  while ((match = titleTag.exec(content)) !== null) {
    fragments.push(match[1].trim());
  }

  const ariaLabel = /aria-label=["']([^"']+)["']/gi;
  while ((match = ariaLabel.exec(content)) !== null) {
    fragments.push(match[1].trim());
  }

  const altLabel = /alt=["']([^"']+)["']/gi;
  while ((match = altLabel.exec(content)) !== null) {
    fragments.push(match[1].trim());
  }

  return fragments.filter(Boolean).join(" ");
}

function parseCoverageLabel(content: string): number | null {
  const coverageMatch = content.match(/(?:coverage|cov)[^\d%]{0,80}?([0-9]{1,3}(?:\.[0-9]+)?)%/i);
  if (!coverageMatch) {
    return null;
  }

  const value = Number(coverageMatch[1]);
  if (Number.isFinite(value) && value >= 0 && value <= 100) {
    return value;
  }

  return null;
}

function extractCoverageBadgeUrls(content: string): string[] {
  const urlRegex = /https?:\/\/[\w\-./?=&%]+/gi;
  const urls = new Set<string>();

  for (const match of content.match(urlRegex) ?? []) {
    const normalized = match.trim().replace(/[),.]+$/, "");
    if (/(?:codecov\.io|coveralls\.io)/i.test(normalized)) {
      if (/(?:\/|^)(?:badge(?:\.svg)?|graph\/badge|coverage|cov)(?:[-/\.]|$)/i.test(normalized)) {
        urls.add(normalized);
      }
      continue;
    }

    if (/(?:badge\/(?:coverage|cov)|\/coverage(?:[-/]|$)|\/cov(?:[-/]|$))/i.test(normalized)) {
      urls.add(normalized);
    }
  }

  return Array.from(urls);
}

async function parseCoverageFromBadgeUrl(url: string): Promise<number | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "image/svg+xml,text/html,*/*" },
    });
    if (!res.ok) return null;

    const text = await res.text();
    const bannerValue = parseCoverageBanner(text);
    if (bannerValue !== null) {
      return bannerValue;
    }

    const extracted = extractBadgeTextContent(text);
    const extractedBannerValue = parseCoverageBanner(extracted);
    if (extractedBannerValue !== null) {
      return extractedBannerValue;
    }

    if (/(?:codecov\.io|img\.shields\.io|coveralls\.io|badgen\.net|badge\.fury\.io)/i.test(url)) {
      return parseCoverageLabel(extracted);
    }

    return null;
  } catch {
    return null;
  }
}

function parseCoveragePercentage(filePath: string, content: string): number | null {
  const lcPath = filePath.toLowerCase();
  if (lcPath.endsWith("coverage-summary.json") || lcPath.endsWith("coverage.json") || lcPath.endsWith("coverage-final.json")) {
    return parseCoverageSummaryJson(content);
  }
  if (lcPath.endsWith("coverage.xml") || lcPath.endsWith("cobertura.xml") || lcPath.endsWith("coverage-final.xml")) {
    return parseCoverageXml(content);
  }
  if (lcPath.endsWith("lcov.info")) {
    return parseLcovInfo(content);
  }
  return null;
}

async function parseCoverageFromReadme(owner: string, repo: string, tree: string[]): Promise<number | null> {
  const readmePath = tree.find((path) => README_FILENAMES.includes(path.toLowerCase()));
  if (!readmePath) return null;

  const content = await getFileContent(owner, repo, readmePath);
  if (!content) return null;

  const bannerValue = parseCoverageBanner(content);
  if (bannerValue !== null) {
    return bannerValue;
  }

  const badgeUrls = extractCoverageBadgeUrls(content);
  for (const badgeUrl of badgeUrls) {
    const remoteValue = await parseCoverageFromBadgeUrl(badgeUrl);
    if (remoteValue !== null) {
      return remoteValue;
    }
  }

  return null;
}

export async function checkCoverage(
  owner: string,
  repo: string,
  tree: string[]
): Promise<CheckResult> {
  const candidates = tree.filter((path) =>
    COVERAGE_FILE_CANDIDATES.includes(path.toLowerCase())
  );

  if (candidates.length === 0) {
    const readmePercentage = await parseCoverageFromReadme(owner, repo, tree);
    if (readmePercentage !== null) {
      const rounded = Math.round(readmePercentage * 100) / 100;
      return {
        id: "coverage",
        title: "Code coverage",
        description:
          "Code coverage should be reported and exceeded a minimum threshold to ensure test reliability.",
        status: rounded >= 80 ? "pass" : "fail",
        message: rounded >= 80
          ? `Code coverage badge reports ${rounded.toFixed(2)}%, which meets the 80% threshold.`
          : `Code coverage badge reports ${rounded.toFixed(2)}%, below the required 80% threshold.`,
        evidence: [`README coverage badge: ${rounded.toFixed(2)}%`],
        referenceUrl:
          "https://docs.github.com/en/actions/automating-builds-and-tests/about-code-coverage-reporting",
      };
    }

    return {
      id: "coverage",
      title: "Code coverage",
      description:
        "Code coverage should be reported and exceeded a minimum threshold to ensure test reliability.",
      status: "warn",
      message:
        "No coverage report file was found. Add coverage output such as coverage/coverage-summary.json, coverage.xml, or lcov.info.",
      evidence: [],
      referenceUrl:
        "https://docs.github.com/en/actions/automating-builds-and-tests/about-code-coverage-reporting",
    };
  }

  for (const candidate of candidates) {
    const content = await getFileContent(owner, repo, candidate);
    if (!content) continue;

    const percentage = parseCoveragePercentage(candidate, content);
    if (percentage === null || !Number.isFinite(percentage)) {
      continue;
    }

    const rounded = Math.round(percentage * 100) / 100;
    if (rounded >= 80) {
      return {
        id: "coverage",
        title: "Code coverage",
        description:
          "Code coverage should be reported and exceeded a minimum threshold to ensure test reliability.",
        status: "pass",
        message: `Code coverage is ${rounded.toFixed(2)}%, which meets the 80% threshold.`,
        evidence: [`${candidate}: ${rounded.toFixed(2)}%`],
        referenceUrl:
          "https://docs.github.com/en/actions/automating-builds-and-tests/about-code-coverage-reporting",
      };
    }

    return {
      id: "coverage",
      title: "Code coverage",
      description:
        "Code coverage should be reported and exceeded a minimum threshold to ensure test reliability.",
      status: "fail",
      message: `Code coverage is ${rounded.toFixed(2)}%, below the required 80% threshold.`,
      evidence: [`${candidate}: ${rounded.toFixed(2)}%`],
      referenceUrl:
        "https://docs.github.com/en/actions/automating-builds-and-tests/about-code-coverage-reporting",
    };
  }

  const readmePercentage = await parseCoverageFromReadme(owner, repo, tree);
  if (readmePercentage !== null) {
    const rounded = Math.round(readmePercentage * 100) / 100;
    return {
      id: "coverage",
      title: "Code coverage",
      description:
        "Code coverage should be reported and exceeded a minimum threshold to ensure test reliability.",
      status: rounded >= 80 ? "pass" : "fail",
      message: rounded >= 80
        ? `Code coverage badge reports ${rounded.toFixed(2)}%, which meets the 80% threshold.`
        : `Code coverage badge reports ${rounded.toFixed(2)}%, below the required 80% threshold.`,
      evidence: [`README coverage badge: ${rounded.toFixed(2)}%`],
      referenceUrl:
        "https://docs.github.com/en/actions/automating-builds-and-tests/about-code-coverage-reporting",
    };
  }

  return {
    id: "coverage",
    title: "Code coverage",
    description:
      "Code coverage should be reported and exceeded a minimum threshold to ensure test reliability.",
    status: "warn",
    message:
      "Coverage report files were found but a supported coverage percentage could not be determined.",
    evidence: candidates,
    referenceUrl:
      "https://docs.github.com/en/actions/automating-builds-and-tests/about-code-coverage-reporting",
  };
}
