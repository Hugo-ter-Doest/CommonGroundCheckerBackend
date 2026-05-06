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

function extractMetrics(output: string): {
  totalLines: number;
  functionCount: number;
  fileCount: number;
} | null {
  const lines = output.split(/\r?\n/);
  const functionLines: number[] = [];
  const filePaths = new Set<string>();
  let totalLines = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^NLOC\s+CCN\s+token/i.test(line)) continue;
    if (/^\-+$/i.test(line)) continue;

    // Parse individual function lines: NLOC CCN token count ... filePath functionName
    const match = line.match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+)/);
    if (match) {
      const nloc = Number(match[1]);
      const filePath = match[6];
      if (Number.isFinite(nloc)) {
        functionLines.push(nloc);
      }
      if (filePath) {
        filePaths.add(filePath);
      }
      continue;
    }

    // Parse total line: Total nloc ... functions
    const totalMatch = line.match(/^Total\s+nloc\s+=\s+(\d+)/i);
    if (totalMatch) {
      totalLines = Number(totalMatch[1]);
    }
  }

  // If we found function lines but no total, sum them up
  if (!totalLines && functionLines.length > 0) {
    totalLines = functionLines.reduce((sum, val) => sum + val, 0);
  }

  if (totalLines === 0 || functionLines.length === 0) {
    return null;
  }

  return {
    totalLines,
    functionCount: functionLines.length,
    fileCount: filePaths.size,
  };
}

export async function checkCodeMetrics(
  owner: string,
  repo: string,
  localRepoPath?: string
): Promise<CheckResult> {
  const lizard = await detectLizardCommand();

  if (!lizard) {
    return {
      id: "codemetrics",
      title: "Code Metrics",
      description:
        "Informational metrics about code size and structure (lines of code, function count).",
      status: "info",
      message:
        "Lizard is not installed on the checker host. Install it (for example: py -m pip install lizard) to enable this metric.",
      evidence: [],
      referenceUrl: "https://github.com/terryyin/lizard",
    };
  }

  let tempRoot: string | undefined;
  let repoDir = localRepoPath;

  if (!repoDir) {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "cgchecker-metrics-"));
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
          id: "codemetrics",
          title: "Code Metrics",
          description:
            "Informational metrics about code size and structure (lines of code, function count).",
          status: "warn",
          message:
            "Could not clone repository for metrics analysis. This may happen for very large repositories or temporary network errors.",
          evidence: clone.stderr
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .slice(0, 5),
          referenceUrl: "https://github.com/terryyin/lizard",
        };
      }
    }

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
    const metrics = extractMetrics(combinedOutput);

    if (analysis.code !== 0 && metrics === null) {
      return {
        id: "codemetrics",
        title: "Code Metrics",
        description:
          "Informational metrics about code size and structure (lines of code, function count).",
        status: "warn",
        message: "Lizard could not complete metrics analysis for this repository.",
        evidence: [
          `Analyzer: ${lizard.command} ${lizard.argsPrefix.join(" ")}`.trim(),
          `Exit code: ${analysis.code}`,
        ].slice(0, 5),
        referenceUrl: "https://github.com/terryyin/lizard",
      };
    }

    if (metrics === null) {
      return {
        id: "codemetrics",
        title: "Code Metrics",
        description:
          "Informational metrics about code size and structure (lines of code, function count).",
        status: "info",
        message:
          "Lizard analysis ran, but no metrics could be extracted from output.",
        evidence: [
          `Analyzer: ${lizard.command} ${lizard.argsPrefix.join(" ")}`.trim(),
          "No analyzable functions were found.",
        ].slice(0, 5),
        referenceUrl: "https://github.com/terryyin/lizard",
      };
    }

    const { totalLines, functionCount, fileCount } = metrics;

    const formatter = new Intl.NumberFormat("en-US");

    return {
      id: "codemetrics",
      title: "Code Metrics",
      description:
        "Informational metrics about code size and structure (lines of code, function count, file count).",
      status: "info",
      message: `Code metrics collected: ${formatter.format(totalLines)} lines of code, ${formatter.format(functionCount)} functions across ${formatter.format(fileCount)} files.`,
      evidence: [
        `Analyzer: ${lizard.command} ${lizard.argsPrefix.join(" ")}`.trim(),
        `Total lines of code (NLOC): ${formatter.format(totalLines)}`,
        `Function count: ${formatter.format(functionCount)}`,
        `Files analyzed: ${formatter.format(fileCount)}`,
      ].slice(0, 10),
      referenceUrl: "https://github.com/terryyin/lizard",
    };
  } finally {
    if (!localRepoPath && tempRoot) {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }
}
