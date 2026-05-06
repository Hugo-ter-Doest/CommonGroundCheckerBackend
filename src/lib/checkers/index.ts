import { getRepoMeta, getRepoTree, getRepoVersion, parseGitHubUrl } from "../github";
import type { CheckReport, CheckResult } from "../types";
import { checkOpenApi } from "./openapi";
import { checkLicense } from "./license";
import { checkPublicCode } from "./publiccode";
import { checkDocker } from "./docker";
import { checkDockerImage } from "./dockerImage";
import { checkCiConfig } from "./ciConfig";
import { checkFiveLayer } from "./fiveLayer";
import { checkHelmChart } from "./helmchart";
import { checkSbom } from "./sbom";
import { checkDocumentation } from "./documentation";
import { checkChangelog } from "./changelog";
import { checkContributing } from "./contributing";
import { checkCodeOfConduct } from "./codeofconduct";
import { checkSecurity } from "./security";
import { checkTests } from "./tests";
import { checkComplexity } from "./complexity";
import { checkCodeMetrics } from "./codeMetrics";
import { checkCoverage } from "./coverage";
import { checkAdrValidator } from "./adrValidator";
import { checkSourceCode } from "./sourcecode";
import { checkSemver } from "./semver";
import { checkCopyrightOwner } from "./copyrightOwner";
import { checkOwaspSecureCoding } from "./owaspSecureCoding";
import { checkEuplLicense } from "./eupl";
import {
  getActiveScoringConfig,
} from "./config";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

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

export type ProgressCallback = (step: string, pct: number) => void;

interface RunChecksOptions {
  helmChartLocations?: string[];
  documentationLocations?: string[];
  dockerLocations?: string[];
  apiSpecificationLocations?: string[];
  isRegister?: boolean;
}

export async function runChecks(
  repoUrl: string,
  options?: RunChecksOptions,
  onProgress?: ProgressCallback,
): Promise<CheckReport> {
  const parsed = parseGitHubUrl(repoUrl);
  if (!parsed) throw new Error("Invalid GitHub repository URL.");

  const { owner, repo } = parsed;

  // Fetch repo metadata first (needed to know default branch)
  onProgress?.("Fetching repository metadata\u2026", 15);
  const meta = await getRepoMeta(owner, repo);

  // Fetch file tree and version in parallel using the real default branch
  onProgress?.("Loading repository file tree\u2026", 30);
  const [tree, versionInfo] = await Promise.all([
    getRepoTree(owner, repo, meta.default_branch ?? "main"),
    getRepoVersion(owner, repo),
  ]);

  const version = versionInfo.version;
  const activeScoringConfig = await getActiveScoringConfig();
  const scoringConfig = activeScoringConfig.config;
  const isRegister = options?.isRegister === true;

  let tempRoot: string | undefined;
  let localRepoPath: string | undefined;

  try {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "cgchecker-repo-"));
    localRepoPath = path.join(tempRoot, "repo");
    const cloneUrl = `https://github.com/${owner}/${repo}.git`;
    const clone = await runCommand(
      "git",
      ["clone", "--depth", "1", cloneUrl, localRepoPath],
      { GIT_LFS_SKIP_SMUDGE: "1" }
    );

    if (clone.code !== 0) {
      localRepoPath = undefined;
    }

    const openApiCheckPromise: Promise<CheckResult> = isRegister
    ? checkOpenApi(owner, repo, tree, options?.apiSpecificationLocations ?? [])
    : Promise.resolve({
        id: "openapi",
        title: "API-first / OpenAPI Specification",
        description:
          "The component must expose a machine-readable OpenAPI (or Swagger) specification.",
        status: "pass",
        message:
          "Component is not marked as a register; OpenAPI specification check is not required.",
        evidence: [],
        referenceUrl: "https://commonground.nl/cms/view/54476259/api-designrules",
      });

  // Kick off network-dependent and slow checks immediately so they run concurrently
  const networkChecksPromise = Promise.all([
    openApiCheckPromise,
    checkLicense(owner, repo, meta, tree),
    checkCopyrightOwner(owner, repo, meta, tree),
    checkPublicCode(owner, repo, tree),
    checkFiveLayer(owner, repo, tree, meta),
    checkHelmChart(owner, repo, tree, options?.helmChartLocations ?? []),
  ]);
  const complexityPromise = checkComplexity(
    owner,
    repo,
    scoringConfig.complexityThreshold,
    scoringConfig.complexityMaxCcnThreshold,
    localRepoPath
  );
  const codeMetricsPromise = checkCodeMetrics(owner, repo, localRepoPath);
  const owaspSecureCodingPromise = checkOwaspSecureCoding(owner, repo, tree, localRepoPath);
  const adrValidatorPromise = checkAdrValidator(
    owner,
    repo,
    meta.default_branch ?? "main",
    tree,
    options?.apiSpecificationLocations ?? [],
    scoringConfig.spectralRulesetSource
  );

  // Instant checks — synchronous pure functions on the tree array
  onProgress?.("Running code structure checks\u2026", 45);
  let sourcecode = checkSourceCode(tree);
  const docker = checkDocker(tree);
  const dockerimage = checkDockerImage(options?.dockerLocations ?? []);
  const cicd = checkCiConfig(tree);
  const sbom = checkSbom(tree);
  const documentation = checkDocumentation(tree, options?.documentationLocations ?? []);
  const changelog = checkChangelog(tree);
  const tests = checkTests(tree);
  const coverage = await checkCoverage(owner, repo, tree);
  const contributing = checkContributing(tree);
  const codeofconduct = checkCodeOfConduct(tree);
  const security = checkSecurity(tree);
  const semver = checkSemver(version);

  // Instant checks done; emit next step while slower checks complete in parallel
  onProgress?.("Analysing API specs, licence & deployment files\u2026", 60);
  const [[openapi, license, copyrightowner, publiccode, fivelayer, helmchart], complexity, codemetrics, owaspsecurecoding, adrvalidator] = await Promise.all([
    networkChecksPromise,
    complexityPromise,
    codeMetricsPromise,
    owaspSecureCodingPromise,
    adrValidatorPromise,
  ]);

  // Always merge code metrics into Actual Source Code result if available
  if (sourcecode && codemetrics) {
    const metricsMsg = codemetrics.message || "";
    let lines = null, funcs = null, files = null;
    const match = metricsMsg.match(/([\d,]+) lines of code, ([\d,]+) functions across ([\d,]+) files/);
    if (match) {
      lines = match[1];
      funcs = match[2];
      files = match[3];
    }
    let metricsSummary = "";
    if (lines && funcs && files) {
      metricsSummary = `Code metrics: ${lines} lines of code, ${funcs} functions, ${files} files analyzed.`;
    } else if (metricsMsg) {
      metricsSummary = `Code metrics: ${metricsMsg}`;
    }
    sourcecode = {
      ...sourcecode,
      // Only show the code metrics summary, not the original file count
      message: metricsSummary ? metricsSummary : sourcecode.message,
      evidence: [
        ...(sourcecode.evidence || []),
        ...(codemetrics.evidence || []),
      ],
    };
  }
  const eupllicense = checkEuplLicense(meta, license.message);

  onProgress?.("Calculating compliance score\u2026", 90);

  const results = [
    sourcecode,
    openapi,
    license,
    eupllicense,
    copyrightowner,
    publiccode,
    docker,
    dockerimage,
    cicd,
    sbom,
    documentation,
    changelog,
    tests,
    coverage,
    complexity,
    // codemetrics is now merged into sourcecode, so do not include separately
    owaspsecurecoding,
    adrvalidator,
    contributing,
    codeofconduct,
    security,
    semver,
    fivelayer,
    helmchart,
  ];

  const totalCriterionWeight = results.reduce((sum, result) => {
    const requirementLevel =
      scoringConfig.criterionConfigByCheckId[result.id]?.requirementLevel ??
      "recommended";
    if (requirementLevel !== "mandatory") {
      return sum;
    }

    const criterionWeight =
      scoringConfig.criterionConfigByCheckId[result.id]?.weight ?? 1;
    return sum + Math.max(0, criterionWeight);
  }, 0);

  const weightedScoreSum = results.reduce((sum, result) => {
    const requirementLevel =
      scoringConfig.criterionConfigByCheckId[result.id]?.requirementLevel ??
      "recommended";
    if (requirementLevel !== "mandatory") {
      return sum;
    }

    const criterionWeight =
      scoringConfig.criterionConfigByCheckId[result.id]?.weight ?? 1;
    const statusScore = scoringConfig.statusScoreByStatus[result.status] ?? 0;
    return sum + statusScore * Math.max(0, criterionWeight);
  }, 0);

  const baseScore = totalCriterionWeight > 0
    ? Math.round((weightedScoreSum / totalCriterionWeight) * 100)
    : 0;
  const score = Math.min(100, baseScore);

  const resultsWithRequirementLevels = [
    sourcecode,
    openapi,
    license,
    eupllicense,
    copyrightowner,
    publiccode,
    docker,
    dockerimage,
    cicd,
    sbom,
    documentation,
    changelog,
    tests,
    coverage,
    complexity,
    // codemetrics is now merged into sourcecode, so do not include separately
    owaspsecurecoding,
    adrvalidator,
    contributing,
    codeofconduct,
    security,
    semver,
    fivelayer,
    helmchart,
  ].map((result) => ({
    ...result,
    requirementLevel:
      scoringConfig.criterionConfigByCheckId[result.id]?.requirementLevel ??
      "recommended",
  }));

  return {
    repoUrl,
    owner,
    repo,
    checkedAt: new Date().toISOString(),
    scoringConfigId: activeScoringConfig.id,
    score,
    results: resultsWithRequirementLevels,
    repoMeta: {
      description: meta.description ?? null,
      language: meta.language ?? null,
      stars: meta.stargazers_count ?? 0,
      forks: meta.forks_count ?? 0,
      defaultBranch: meta.default_branch ?? "main",
      topics: meta.topics ?? [],
      license: meta.license?.name ?? null,
      version,
      versionEvidence: versionInfo.evidence,
    },
  };
  } finally {
    if (tempRoot) {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }
}
