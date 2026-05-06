/**
 * Minimal GitHub REST API client used by the checkers.
 * Supports an optional GITHUB_TOKEN env var for higher rate limits.
 */

const BASE = "https://api.github.com";

const README_CANDIDATES = [
  "README.md",
  "README.rst",
  "README.txt",
  "README.adoc",
  "Readme.md",
  "readme.md",
  "readme.rst",
  "readme.txt",
  "readme.adoc",
];

const MANIFEST_CANDIDATES = [
  "package.json",
  "pyproject.toml",
  "Chart.yaml",
];

export interface RepoVersionResult {
  version: string | null;
  evidence: {
    source: "release" | "tag" | "manifest" | "readme" | "none";
    detail: string;
  };
}

function headers() {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) {
    h["Authorization"] = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return h;
}

async function ghFetch(path: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: headers(),
    next: { revalidate: 60 },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

function extractVersionFromReadme(content: string): string | null {
  const patterns: RegExp[] = [
    /\bversion\s*[:=]\s*v?(\d+\.\d+\.\d+(?:[-+][\w.-]+)?)/i,
    /\brelease\s*[:=]\s*v?(\d+\.\d+\.\d+(?:[-+][\w.-]+)?)/i,
    /\bcurrent\s+version\s*[:=]?\s*v?(\d+\.\d+\.\d+(?:[-+][\w.-]+)?)/i,
    /img\.shields\.io\/[^\s)"']*\/(?:version|release)[^\s)"']*\/v?(\d+\.\d+\.\d+(?:[-+][\w.-]+)?)/i,
    /\bv(\d+\.\d+\.\d+(?:[-+][\w.-]+)?)\b/,
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match?.[1]) {
      const version = match[1].trim();
      if (version) return `v${version}`;
    }
  }

  return null;
}

function normalizeVersion(value: string): string | null {
  const cleaned = value.trim().replace(/^['"]|['"]$/g, "");
  if (!cleaned) return null;
  return cleaned.startsWith("v") ? cleaned : `v${cleaned}`;
}

function parseSemverParts(value: string): [number, number, number] | null {
  const match = value.trim().match(/^v?(\d+)\.(\d+)\.(\d+)/i);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareSemverDesc(a: string, b: string): number {
  const aParts = parseSemverParts(a);
  const bParts = parseSemverParts(b);

  if (!aParts && !bParts) return 0;
  if (!aParts) return 1;
  if (!bParts) return -1;

  for (let i = 0; i < 3; i += 1) {
    if (aParts[i] !== bParts[i]) {
      return bParts[i] - aParts[i];
    }
  }

  return 0;
}

function pickBestTagName(tags: string[]): string | null {
  const cleaned = tags
    .map((tag) => tag.trim())
    .filter(Boolean)
    .filter((tag) => !/alpha|beta|rc/i.test(tag));

  if (cleaned.length === 0) return null;

  const semverLike = cleaned.filter((tag) => parseSemverParts(tag) !== null);
  if (semverLike.length > 0) {
    const sorted = [...semverLike].sort(compareSemverDesc);
    return normalizeVersion(sorted[0]);
  }

  return normalizeVersion(cleaned[0]);
}

function extractVersionFromPackageJson(content: string): string | null {
  try {
    const parsed = JSON.parse(content) as { version?: unknown };
    if (typeof parsed.version !== "string") return null;
    return normalizeVersion(parsed.version);
  } catch {
    return null;
  }
}

function extractVersionFromPyproject(content: string): string | null {
  const patterns: RegExp[] = [
    /^version\s*=\s*["']([^"']+)["']/m,
    /^\s*project\.version\s*=\s*["']([^"']+)["']/m,
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match?.[1]) {
      return normalizeVersion(match[1]);
    }
  }

  return null;
}

function extractVersionFromChartYaml(content: string): string | null {
  const match = content.match(/^version\s*:\s*([\w.+-]+)/m);
  if (!match?.[1]) return null;
  return normalizeVersion(match[1]);
}

/** Flat list of all file paths in the repo tree (up to 100k nodes). */
export async function getRepoTree(
  owner: string,
  repo: string,
  branch: string
): Promise<string[]> {
  const data = await ghFetch(
    `/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data.tree ?? []).map((n: any) => n.path as string);
}

/** Fetch raw file content as text (base64-decoded). Returns null if not found. */
export async function getFileContent(
  owner: string,
  repo: string,
  path: string
): Promise<string | null> {
  try {
    const data = await ghFetch(`/repos/${owner}/${repo}/contents/${path}`);
    if (data.encoding === "base64") {
      return Buffer.from(data.content, "base64").toString("utf-8");
    }
    return data.content ?? null;
  } catch {
    return null;
  }
}

/** Fetch repository metadata. */
export async function getRepoMeta(owner: string, repo: string) {
  return ghFetch(`/repos/${owner}/${repo}`);
}

/** Fetch latest repository version (release tag or latest git tag). */
export async function getRepoVersion(
  owner: string,
  repo: string
): Promise<RepoVersionResult> {
  try {
    const latestRelease = await ghFetch(`/repos/${owner}/${repo}/releases/latest`);
    const latestTag =
      typeof latestRelease?.tag_name === "string"
        ? latestRelease.tag_name.trim()
        : "";
    if (latestTag) {
      return {
        version: normalizeVersion(latestTag) ?? latestTag,
        evidence: {
          source: "release",
          detail: `latest release tag: ${latestTag}`,
        },
      };
    }
  } catch {
    // ignore and continue with /releases list fallback
  }

  try {
    const releases = await ghFetch(`/repos/${owner}/${repo}/releases?per_page=20`);
    if (Array.isArray(releases) && releases.length > 0) {

      type ReleaseLike = {
        tag_name?: unknown;
        name?: unknown;
        draft?: unknown;
        prerelease?: unknown;
        published_at?: unknown;
        created_at?: unknown;
      };

      const normalized = releases
        .map((entry) => entry as ReleaseLike)
        .filter((entry) => entry?.draft !== true);

      const stable = normalized.filter((entry) => entry?.prerelease !== true);
      const pool = stable.length > 0 ? stable : normalized;

      if (pool.length > 0) {
        const sorted = [...pool].sort((a, b) => {
          const aDate = Date.parse(
            String(a.published_at ?? a.created_at ?? "1970-01-01T00:00:00Z")
          );
          const bDate = Date.parse(
            String(b.published_at ?? b.created_at ?? "1970-01-01T00:00:00Z")
          );
          return bDate - aDate;
        });

        const best = sorted[0];
        const tag = typeof best?.tag_name === "string" ? best.tag_name.trim() : "";
        if (tag) {
          return {
            version: normalizeVersion(tag) ?? tag,
            evidence: {
              source: "release",
              detail: `release list tag: ${tag}`,
            },
          };
        }

        const name = typeof best?.name === "string" ? best.name.trim() : "";
        const normalizedName = name ? normalizeVersion(name) : null;
        if (normalizedName) {
          return {
            version: normalizedName,
            evidence: {
              source: "release",
              detail: `release name: ${name}`,
            },
          };
        }
      }
    }
  } catch {
    // ignore and return null when no releases or repository blocks this endpoint
  }

  try {
    const tags = await ghFetch(`/repos/${owner}/${repo}/tags?per_page=50`);
    if (Array.isArray(tags) && tags.length > 0) {
      const tagNames = tags
        .map((entry) => {
          const t = entry as { name?: unknown };
          return typeof t.name === "string" ? t.name : "";
        })
        .filter(Boolean);

      const bestTag = pickBestTagName(tagNames);
      if (bestTag) {
        return {
          version: bestTag,
          evidence: {
            source: "tag",
            detail: `best matching git tag: ${bestTag}`,
          },
        };
      }
    }
  } catch {
    // ignore and continue with file-based fallback
  }

  for (const filePath of MANIFEST_CANDIDATES) {
    const content = await getFileContent(owner, repo, filePath);
    if (!content) continue;

    if (filePath === "package.json") {
      const version = extractVersionFromPackageJson(content);
      if (version) {
        return {
          version,
          evidence: {
            source: "manifest",
            detail: `root manifest ${filePath}`,
          },
        };
      }
      continue;
    }

    if (filePath === "pyproject.toml") {
      const version = extractVersionFromPyproject(content);
      if (version) {
        return {
          version,
          evidence: {
            source: "manifest",
            detail: `root manifest ${filePath}`,
          },
        };
      }
      continue;
    }

    if (filePath === "Chart.yaml") {
      const version = extractVersionFromChartYaml(content);
      if (version) {
        return {
          version,
          evidence: {
            source: "manifest",
            detail: `root manifest ${filePath}`,
          },
        };
      }
    }
  }

  try {
    const meta = await getRepoMeta(owner, repo);
    const branch = String(meta?.default_branch ?? "main");
    const tree = await getRepoTree(owner, repo, branch);
    const lowerTree = tree.map((path) => path.toLowerCase());

    for (const manifest of MANIFEST_CANDIDATES) {
      const manifestLower = manifest.toLowerCase();
      const matches = tree.filter((_, index) =>
        lowerTree[index].endsWith(`/${manifestLower}`) ||
        lowerTree[index] === manifestLower
      );

      for (const candidatePath of matches.slice(0, 5)) {
        const content = await getFileContent(owner, repo, candidatePath);
        if (!content) continue;

        if (manifest === "package.json") {
          const version = extractVersionFromPackageJson(content);
          if (version) {
            return {
              version,
              evidence: {
                source: "manifest",
                detail: `manifest ${candidatePath}`,
              },
            };
          }
          continue;
        }

        if (manifest === "pyproject.toml") {
          const version = extractVersionFromPyproject(content);
          if (version) {
            return {
              version,
              evidence: {
                source: "manifest",
                detail: `manifest ${candidatePath}`,
              },
            };
          }
          continue;
        }

        if (manifest === "Chart.yaml") {
          const version = extractVersionFromChartYaml(content);
          if (version) {
            return {
              version,
              evidence: {
                source: "manifest",
                detail: `manifest ${candidatePath}`,
              },
            };
          }
        }
      }
    }
  } catch {
    // ignore deep tree manifest lookup errors
  }

  for (const readmePath of README_CANDIDATES) {
    const content = await getFileContent(owner, repo, readmePath);
    if (!content) continue;

    const version = extractVersionFromReadme(content);
    if (version) {
      return {
        version,
        evidence: {
          source: "readme",
          detail: `README pattern in ${readmePath}`,
        },
      };
    }
  }

  return {
    version: null,
    evidence: {
      source: "none",
      detail: "No release, tag, manifest, or README version pattern found",
    },
  };
}

/** Parse a GitHub URL into { owner, repo }. Returns null if not a valid GitHub URL. */
export function parseGitHubUrl(
  url: string
): { owner: string; repo: string } | null {
  try {
    const u = new URL(url.trim());
    if (u.hostname !== "github.com") return null;
    const parts = u.pathname.replace(/^\//, "").split("/");
    if (parts.length < 2) return null;
    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/, "");
    if (!owner || !repo) return null;
    return { owner, repo };
  } catch {
    return null;
  }
}

/**
 * Parse a GitHub tree/blob URL into { owner, repo, branch, path }.
 * Example: https://github.com/org/repo/tree/main/charts/mychart
 */
export function parseGitHubTreeUrl(
  url: string
): { owner: string; repo: string; branch: string; path: string } | null {
  try {
    const u = new URL(url.trim());
    if (u.hostname !== "github.com") return null;
    const parts = u.pathname.replace(/^\//, "").split("/");
    if (parts.length < 5) return null;

    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/, "");
    const mode = parts[2]; // tree | blob
    const branch = parts[3];
    const path = parts.slice(4).join("/").replace(/^\/+|\/+$/g, "");

    if (!owner || !repo || !branch || !path) return null;
    if (mode !== "tree" && mode !== "blob") return null;

    return { owner, repo, branch, path };
  } catch {
    return null;
  }
}
