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

type FollowFieldsSource = {
  followed: boolean;
  checkIntervalHours: number | null;
  lastCheckedAt: Date | null;
  nextCheckAt: Date | null;
};

export function toFollowFields(repository: FollowFieldsSource) {
  return {
    followed: repository.followed,
    checkIntervalHours: repository.checkIntervalHours,
    lastCheckedAt: repository.lastCheckedAt,
    nextCheckAt: repository.nextCheckAt,
  };
}
