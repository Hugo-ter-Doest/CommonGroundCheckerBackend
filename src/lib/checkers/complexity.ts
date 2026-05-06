import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import type { CheckResult } from "../types";

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runCommand(command: string, args: string[], env?: Partial<NodeJS.ProcessEnv>): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...env },
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (error) => {
      resolve({
        code: 127,
        stdout,
        stderr: `${stderr}\n${error.message}`,
      });
    });

    child.on("close", (code) => {
      resolve({
        code: code ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

async function detectLizardCommand(): Promise<{ command: string; argsPrefix: string[] } | null> {
  const direct = await runCommand("lizard", ["--version"]);
  if (direct.code === 0) {
    return { command: "lizard", argsPrefix: [] };
  }

  const pyLauncher = await runCommand("py", ["-m", "lizard", "--version"]);
  if (pyLauncher.code === 0) {
    return { command: "py", argsPrefix: ["-m", "lizard"] };
  }

  const python = await runCommand("python", ["-m", "lizard", "--version"]);
  if (python.code === 0) {
    return { command: "python", argsPrefix: ["-m", "lizard"] };
  }

  return null;
}

function extractThresholdBreaches(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /warning|error|[*!]{3}/i.test(line) || /CCN\s+\d+/i.test(line))
    .slice(0, 10);
}

function extractSummary(output: string): {
  averageCcn: number;
  maxCcn: number;
  functionCount: number;
} | null {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = 0; index < lines.length; index += 1) {
    if (!/AvgCCN/i.test(lines[index])) continue;

    for (let offset = 1; offset <= 3; offset += 1) {
      const candidate = lines[index + offset];
      if (!candidate) continue;

      const numericParts = candidate.match(/-?\d+(?:\.\d+)?/g);
      if (!numericParts || numericParts.length < 5) continue;

      const avgCcn = Number(numericParts[2]);
      const functionCount = Number(numericParts[4]);
      if (Number.isFinite(avgCcn) && Number.isFinite(functionCount)) {
        return { averageCcn: avgCcn, maxCcn: avgCcn, functionCount };
      }
    }
  }

  return null;
}

function extractAverageFromFunctionRows(output: string): {
  averageCcn: number;
  maxCcn: number;
  functionCount: number;
} | null {
  const lines = output.split(/\r?\n/);
  const ccnValues: number[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^NLOC\s+CCN\s+token/i.test(line)) continue;
    if (/^\-+$/i.test(line)) continue;
    if (/^Total\s+nloc/i.test(line)) continue;

    const match = line.match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+\S+/);
    if (!match) continue;

    const ccn = Number(match[2]);
    if (Number.isFinite(ccn)) {
      ccnValues.push(ccn);
    }
  }

  if (ccnValues.length === 0) {
    return null;
  }

  const total = ccnValues.reduce((sum, value) => sum + value, 0);
  const maxCcn = Math.max(...ccnValues);
  return {
    averageCcn: total / ccnValues.length,
    maxCcn,
    functionCount: ccnValues.length,
  };
}

export async function checkComplexity(
  owner: string,
  repo: string,
  averageThreshold: number,
  maxCcnThreshold: number,
  localRepoPath?: string
): Promise<CheckResult> {
  const lizard = await detectLizardCommand();

  if (!lizard) {
    return {
      id: "complexity",
      title: "Cyclomatic complexity (Lizard)",
      description:
        "The repository should be analyzed with Lizard to track cyclomatic complexity across supported languages.",
      status: "warn",
      message:
        "Lizard is not installed on the checker host. Install it (for example: py -m pip install lizard) to enable this criterion.",
      evidence: [],
      referenceUrl: "https://github.com/terryyin/lizard",
    };
  }

  let tempRoot: string | undefined;
  let repoDir = localRepoPath;

  if (!repoDir) {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "cgchecker-lizard-"));
    repoDir = path.join(tempRoot, "repo");
  }

  const cloneUrl = `https://github.com/${owner}/${repo}.git`;

  try {
    if (!localRepoPath) {
      const clone = await runCommand(
        "git",
        ["clone", "--depth", "1", cloneUrl, repoDir],
        { GIT_LFS_SKIP_SMUDGE: "1" }
      );

      if (clone.code !== 0) {
        return {
          id: "complexity",
          title: "Cyclomatic complexity (Lizard)",
          description:
            "The repository should be analyzed with Lizard to track cyclomatic complexity across supported languages.",
          status: "warn",
          message:
            "Could not clone repository for complexity analysis. This may happen for very large repositories or temporary network errors.",
          evidence: clone.stderr
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .slice(0, 5),
          referenceUrl: "https://github.com/terryyin/lizard",
        };
      }
    }

    const averageThresholdText = String(Math.max(1, Math.round(averageThreshold)));
    const maxCcnThresholdText = String(Math.max(1, Math.round(maxCcnThreshold)));
    const args = [
      ...lizard.argsPrefix,
      "-x",
      "*/node_modules/*",
      "-x",
      "*/.next/*",
      "-x",
      "*/.git/*",
      repoDir,
    ];

    const analysis = await runCommand(lizard.command, args);
    const combinedOutput = `${analysis.stdout}\n${analysis.stderr}`;
    const evidence = extractThresholdBreaches(combinedOutput);
    const summary =
      extractAverageFromFunctionRows(combinedOutput) ??
      extractSummary(combinedOutput);

    if (analysis.code !== 0 && summary === null) {
      return {
        id: "complexity",
        title: "Cyclomatic complexity (Lizard)",
        description:
          "The repository should be analyzed with Lizard to track cyclomatic complexity across supported languages.",
        status: "warn",
        message:
          "Lizard could not complete complexity analysis for this repository.",
        evidence: [
          `Analyzer: ${lizard.command} ${lizard.argsPrefix.join(" ")}`.trim(),
          `Exit code: ${analysis.code}`,
          ...evidence,
        ].slice(0, 10),
        referenceUrl: "https://github.com/terryyin/lizard",
      };
    }

    if (summary === null) {
      return {
        id: "complexity",
        title: "Cyclomatic complexity (Lizard)",
        description:
          "The repository should be analyzed with Lizard to track cyclomatic complexity across supported languages.",
        status: "warn",
        message:
          "Lizard analysis ran, but average cyclomatic complexity could not be determined from output.",
        evidence: [
          `Analyzer: ${lizard.command} ${lizard.argsPrefix.join(" ")}`.trim(),
          ...(evidence.length > 0 ? evidence : ["No parseable AvgCCN summary found."]),
        ].slice(0, 10),
        referenceUrl: "https://github.com/terryyin/lizard",
      };
    }

    if (summary.functionCount === 0 || summary.averageCcn >= 999999) {
      return {
        id: "complexity",
        title: "Cyclomatic complexity (Lizard)",
        description:
          "The repository should be analyzed with Lizard to track cyclomatic complexity across supported languages.",
        status: "warn",
        message:
          "Lizard analysis ran, but no analyzable functions were found for complexity averaging.",
        evidence: [
          `Analyzer: ${lizard.command} ${lizard.argsPrefix.join(" ")}`.trim(),
          `Function count: ${summary.functionCount}`,
          ...evidence,
        ].slice(0, 10),
        referenceUrl: "https://github.com/terryyin/lizard",
      };
    }

    const averageCcn = summary.averageCcn;
    const maxCcn = summary.maxCcn;

    const passesAverage = averageCcn <= Number(averageThresholdText);
    const passesMax = maxCcn <= Number(maxCcnThresholdText);

    if (passesAverage && passesMax) {
      return {
        id: "complexity",
        title: "Cyclomatic complexity (Lizard)",
        description:
          "The repository should be analyzed with Lizard to track cyclomatic complexity across supported languages.",
        status: "pass",
        message:
          `Lizard analysis executed successfully. Avg CCN ${averageCcn.toFixed(
            2
          )} <= ${averageThresholdText} and Max CCN ${maxCcn.toFixed(
            2
          )} <= ${maxCcnThresholdText}.`,
        evidence: [
          `Analyzer: ${lizard.command} ${lizard.argsPrefix.join(" ")}`.trim(),
          ...(analysis.code !== 0
            ? [`Lizard returned non-zero exit code ${analysis.code}, but summary metrics were parsed.`]
            : []),
          `Average CCN: ${averageCcn.toFixed(2)} (threshold: ${averageThresholdText})`,
          `Max CCN: ${maxCcn.toFixed(2)} (threshold: ${maxCcnThresholdText})`,
          ...evidence,
        ].slice(0, 10),
        referenceUrl: "https://github.com/terryyin/lizard",
      };
    }

    const exceeded: string[] = [];
    if (!passesAverage) {
      exceeded.push(
        `AvgCCN ${averageCcn.toFixed(2)} > ${averageThresholdText}`
      );
    }
    if (!passesMax) {
      exceeded.push(`MaxCCN ${maxCcn.toFixed(2)} > ${maxCcnThresholdText}`);
    }

    return {
      id: "complexity",
      title: "Cyclomatic complexity (Lizard)",
      description:
        "The repository should be analyzed with Lizard to track cyclomatic complexity across supported languages.",
      status: "fail",
      message:
        `Lizard analysis ran. Avg CCN ${averageCcn.toFixed(2)} (threshold: ${averageThresholdText}); ` +
        `Max CCN ${maxCcn.toFixed(2)} (threshold: ${maxCcnThresholdText}). ` +
        `Threshold exceeded: ${exceeded.join("; ")}.`,
      evidence: [
        `Analyzer: ${lizard.command} ${lizard.argsPrefix.join(" ")}`.trim(),
        ...(analysis.code !== 0
          ? [`Lizard returned non-zero exit code ${analysis.code}, but summary metrics were parsed.`]
          : []),
        `Average CCN: ${averageCcn.toFixed(2)} (threshold: ${averageThresholdText})`,
        `Max CCN: ${maxCcn.toFixed(2)} (threshold: ${maxCcnThresholdText})`,
        ...(evidence.length > 0 ? evidence : ["See lizard output for details."]),
      ].slice(0, 10),
      referenceUrl: "https://github.com/terryyin/lizard",
    };
  } finally {
    if (!localRepoPath && tempRoot) {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }
}
