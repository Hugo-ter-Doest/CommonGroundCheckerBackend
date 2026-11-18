/** Check intervals an admin can choose: daily, weekly and monthly (30 days). */
export const ALLOWED_CHECK_INTERVAL_HOURS = [24, 168, 720] as const;

export const DEFAULT_CHECK_INTERVAL_HOURS = 168;

export function isAllowedCheckInterval(value: unknown): value is number {
  return (
    typeof value === "number" &&
    (ALLOWED_CHECK_INTERVAL_HOURS as readonly number[]).includes(value)
  );
}

/**
 * Computes when a repository is due for its next check. Unfollowed
 * repositories are never due. A followed repository that was never checked
 * is due immediately.
 */
export function computeNextCheckAt(
  followed: boolean,
  checkIntervalHours: number | null,
  lastCheckedAt: Date | null,
  now: Date = new Date()
): Date | null {
  if (!followed || !checkIntervalHours) return null;
  if (!lastCheckedAt) return now;
  return new Date(lastCheckedAt.getTime() + checkIntervalHours * 60 * 60 * 1000);
}

/** The `scanRef` value that scans the newest stable release instead of a branch. */
export const LATEST_RELEASE_SCAN_REF = "latest-release";

/**
 * Reads a `scanRef` setting. An empty string or null means the default
 * branch and is stored as null; otherwise the value is `latest-release` or a
 * branch or tag name that follows git's ref-name rules. Returns `undefined`
 * for a value that is not one of these.
 */
export function parseScanRef(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed === LATEST_RELEASE_SCAN_REF) return trimmed;
  const valid =
    trimmed.length <= 255 &&
    !/[\s~^:?*[\\\x00-\x1f\x7f]/.test(trimmed) &&
    !trimmed.includes("..") &&
    !trimmed.includes("@{") &&
    !trimmed.includes("//") &&
    !/^[-/.]|[/.]$|\.lock$|\/\./.test(trimmed);
  return valid ? trimmed : undefined;
}

type FollowFieldsSource = {
  followed: boolean;
  checkIntervalHours: number | null;
  scanRef?: string | null;
  lastCheckedAt: Date | null;
  nextCheckAt: Date | null;
};

export function toFollowFields(repository: FollowFieldsSource) {
  return {
    followed: repository.followed,
    checkIntervalHours: repository.checkIntervalHours,
    scanRef: repository.scanRef ?? null,
    lastCheckedAt: repository.lastCheckedAt,
    nextCheckAt: repository.nextCheckAt,
  };
}
