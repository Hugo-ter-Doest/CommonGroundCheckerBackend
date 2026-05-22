/**
 * Repository URL parser for supported git hosts.
 *
 * Currently accepts GitHub and GitLab repository URLs.
 */

export function parseRepositoryUrl(
  url: string
): { owner: string; repo: string } | null {
  try {
    const u = new URL(url.trim());
    const hostname = u.hostname.toLowerCase();
    if (hostname !== "github.com" && hostname !== "gitlab.com") return null;
    const parts = u.pathname.replace(/^\//, "").replace(/\/$/, "").split("/");
    if (parts.length < 2) return null;
    const repo = parts.pop()!.replace(/\.git$/, "");
    const owner = parts.join("/");
    if (!owner || !repo) return null;
    return { owner, repo };
  } catch {
    return null;
  }
}
