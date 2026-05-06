import type { CheckResult } from "../types";

export function isEuplLicense(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  repoMeta: any,
  licenseResultMessage?: string
): boolean {
  const spdx = String(repoMeta?.license?.spdx_id ?? "").toLowerCase();
  const name = String(repoMeta?.license?.name ?? "").toLowerCase();
  const message = String(licenseResultMessage ?? "").toLowerCase();

  return (
    spdx.startsWith("eupl") ||
    name.includes("eupl") ||
    name.includes("european union public licen") ||
    message.includes("eupl") ||
    message.includes("european union public licen")
  );
}

export function checkEuplLicense(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  repoMeta: any,
  licenseResultMessage?: string
): CheckResult {
  const spdxId = String(repoMeta?.license?.spdx_id ?? "").trim();
  const licenseName = String(repoMeta?.license?.name ?? "").trim();

  if (isEuplLicense(repoMeta, licenseResultMessage)) {
    const detected = spdxId || licenseName || "EUPL";
    return {
      id: "eupllicense",
      title: "EUPL License",
      description:
        "The component should preferably use the European Union Public Licence (EUPL).",
      status: "pass",
      message: `EUPL detected (${detected}).`,
      evidence: [detected],
      referenceUrl: "https://interoperable-europe.ec.europa.eu/collection/eupl/eupl-text-eupl-12",
    };
  }

  return {
    id: "eupllicense",
    title: "EUPL License",
    description:
      "The component should preferably use the European Union Public Licence (EUPL).",
    status: "warn",
    message:
      "No EUPL license detected. This criterion is advisory; an OSI-approved license can still pass the license requirement.",
    evidence: [spdxId || licenseName || "No license metadata indicating EUPL"],
    referenceUrl: "https://interoperable-europe.ec.europa.eu/collection/eupl/eupl-text-eupl-12",
  };
}
