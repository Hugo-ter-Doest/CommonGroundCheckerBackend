import { getFileContent } from "../github";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CheckResult } from "../types";

const SOURCE_FILE_PATTERN = /\.(ts|tsx|js|jsx|mjs|cjs|py|java|go|cs|php|rb|vue)$/i;
const EXCLUDED_PATH_PATTERN = /(^|\/)(node_modules|dist|build|coverage|vendor|\.next|generated)(\/|$)/i;
const MAX_FILES_TO_SCAN = 20;

const RISKY_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "Dynamic code execution", pattern: /\beval\s*\(|\bFunction\s*\(|setTimeout\s*\(\s*["'`]|setInterval\s*\(\s*["'`]/i },
  { label: "Unsafe HTML injection", pattern: /innerHTML\s*=|dangerouslySetInnerHTML/i },
  { label: "Shell command execution", pattern: /subprocess\.(run|call|Popen)\([^\n]*shell\s*=\s*True|os\.system\s*\(|child_process\.(exec|execSync)\s*\(/i },
  { label: "Insecure deserialization", pattern: /pickle\.loads\s*\(|yaml\.load\s*\(/i },
  { label: "Weak hash algorithm", pattern: /hashlib\.(md5|sha1)\s*\(|createHash\s*\(\s*["'](?:md5|sha1)["']|MessageDigest\.getInstance\(\s*["'](?:MD5|SHA-1)["']/i },
  { label: "TLS verification disabled", pattern: /verify\s*=\s*False|rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*["']?0|sslverify\s*=\s*false/i },
  { label: "Possible hardcoded secret", pattern: /(?:api[_-]?key|secret|password|token)\s*[:=]\s*["'][^"'\n]{8,}["']/i },
];

function getScannableFiles(tree: string[], scanAllFiles: boolean): string[] {
  const filtered = tree
    .filter((path) => SOURCE_FILE_PATTERN.test(path))
    .filter((path) => !EXCLUDED_PATH_PATTERN.test(path));

  return scanAllFiles ? filtered : filtered.slice(0, MAX_FILES_TO_SCAN);
}

export async function checkOwaspSecureCoding(
  owner: string,
  repo: string,
  tree: string[],
  localRepoPath?: string
): Promise<CheckResult> {
  const filesToScan = getScannableFiles(tree, Boolean(localRepoPath));

  if (filesToScan.length === 0) {
    return {
      id: "owaspsecurecoding",
      title: "OWASP Secure Coding",
      description:
        "Performs a heuristic static scan for common risky coding patterns aligned with OWASP secure coding concerns.",
      status: "info",
      message:
        "No supported source files were found for the OWASP secure coding heuristic scan.",
      evidence: [],
      referenceUrl:
        "https://cheatsheetseries.owasp.org/IndexTopTen.html",
    };
  }

  const contents = await Promise.all(
    filesToScan.map(async (relativePath) => {
      const content = localRepoPath
        ? await readFile(path.join(localRepoPath, relativePath), "utf-8").catch(() => "")
        : await getFileContent(owner, repo, relativePath);
      return { path: relativePath, content };
    })
  );

  const findings: string[] = [];
  let scannedFileCount = 0;

  for (const item of contents) {
    if (!item.content) continue;
    scannedFileCount += 1;

    for (const rule of RISKY_PATTERNS) {
      if (rule.pattern.test(item.content)) {
        findings.push(`${rule.label}: ${item.path}`);
      }
    }
  }

  if (scannedFileCount === 0) {
    return {
      id: "owaspsecurecoding",
      title: "OWASP Secure Coding",
      description:
        "Performs a heuristic static scan for common risky coding patterns aligned with OWASP secure coding concerns.",
      status: "warn",
      message:
        "Source files were found, but their contents could not be analyzed for the OWASP secure coding check.",
      evidence: filesToScan.slice(0, 10),
      referenceUrl:
        "https://cheatsheetseries.owasp.org/IndexTopTen.html",
    };
  }

  if (findings.length === 0) {
    return {
      id: "owaspsecurecoding",
      title: "OWASP Secure Coding",
      description:
        "Performs a heuristic static scan for common risky coding patterns aligned with OWASP secure coding concerns.",
      status: "pass",
      message:
        `No obvious OWASP-style risky coding patterns were detected in ${scannedFileCount} scanned source files.`,
      evidence: filesToScan.slice(0, 10),
      referenceUrl:
        "https://cheatsheetseries.owasp.org/IndexTopTen.html",
    };
  }

  const status = findings.length >= 4 ? "fail" : "warn";

  return {
    id: "owaspsecurecoding",
    title: "OWASP Secure Coding",
    description:
      "Performs a heuristic static scan for common risky coding patterns aligned with OWASP secure coding concerns.",
    status,
    message:
      findings.length >= 4
        ? `Multiple risky coding patterns were detected (${findings.length} findings across ${scannedFileCount} scanned source files). Review them against OWASP secure coding guidance.`
        : `Potential OWASP secure coding issues were detected (${findings.length} findings across ${scannedFileCount} scanned source files).`,
    evidence: findings,
    referenceUrl:
      "https://cheatsheetseries.owasp.org/IndexTopTen.html",
  };
}
