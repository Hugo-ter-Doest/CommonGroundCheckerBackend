import { getFileContent } from "../github";
import type { CheckResult } from "../types";

// OSI-approved licenses commonly seen in open-source Dutch gov projects
const OSI_LICENSES: Record<string, string> = {
  mit: "MIT License",
  apache2: "Apache License 2.0",
  "apache-2.0": "Apache License 2.0",
  // EUPL — European Union Public Licence (OSI-approved, preferred for NL/EU gov)
  eupl: "European Union Public Licence (EUPL)",
  "eupl-1.0": "European Union Public Licence (EUPL) 1.0",
  "eupl-1.1": "European Union Public Licence (EUPL) 1.1",
  "eupl-1.2": "European Union Public Licence (EUPL) 1.2",
  "gpl-2.0": "GNU General Public License v2.0",
  "gpl-3.0": "GNU General Public License v3.0",
  "agpl-3.0": "GNU Affero General Public License v3.0",
  "lgpl-2.1": "GNU Lesser General Public License v2.1",
  "lgpl-3.0": "GNU Lesser General Public License v3.0",
  bsd2: "BSD 2-Clause",
  "bsd-2-clause": "BSD 2-Clause",
  "bsd-3-clause": "BSD 3-Clause",
  mpl2: "Mozilla Public License 2.0",
  "mpl-2.0": "Mozilla Public License 2.0",
  cc0: "Creative Commons Zero v1.0",
  "cc0-1.0": "Creative Commons Zero v1.0",
  isc: "ISC License",
  eupl11: "European Union Public Licence (EUPL) 1.1", // non-hyphenated variant
  eupl12: "European Union Public Licence (EUPL) 1.2", // non-hyphenated variant
};

// Name substrings that unambiguously identify an OSI-approved license even when
// the SPDX ID is absent or uses an unexpected format (e.g. GitHub's "EUPL 1.1").
const OSI_NAME_SUBSTRINGS = [
  "european union public licen", // matches EUPL in any form
  "mit license",
  "apache license",
  "gnu general public license",
  "gnu lesser general public",
  "gnu affero general public",
  "mozilla public license",
  "bsd 2-clause",
  "bsd 3-clause",
  "isc license",
  "creative commons zero",
];

const LICENSE_TEXT_SIGNALS: Array<{ marker: string; name: string }> = [
  { marker: "spdx-license-identifier: eupl-1.2", name: "European Union Public Licence (EUPL) 1.2" },
  { marker: "spdx-license-identifier: eupl-1.1", name: "European Union Public Licence (EUPL) 1.1" },
  { marker: "spdx-license-identifier: eupl-1.0", name: "European Union Public Licence (EUPL) 1.0" },
  { marker: "spdx-license-identifier: mit", name: "MIT License" },
  { marker: "spdx-license-identifier: apache-2.0", name: "Apache License 2.0" },
  { marker: "spdx-license-identifier: gpl-3.0", name: "GNU General Public License v3.0" },
  { marker: "spdx-license-identifier: gpl-2.0", name: "GNU General Public License v2.0" },
  { marker: "spdx-license-identifier: agpl-3.0", name: "GNU Affero General Public License v3.0" },
  { marker: "spdx-license-identifier: lgpl-3.0", name: "GNU Lesser General Public License v3.0" },
  { marker: "spdx-license-identifier: mpl-2.0", name: "Mozilla Public License 2.0" },
  { marker: "spdx-license-identifier: bsd-3-clause", name: "BSD 3-Clause" },
  { marker: "spdx-license-identifier: bsd-2-clause", name: "BSD 2-Clause" },
  { marker: "spdx-license-identifier: isc", name: "ISC License" },
  { marker: "spdx-license-identifier: cc0-1.0", name: "Creative Commons Zero v1.0" },
];

function isOsiApproved(
  spdxId: string | null | undefined,
  licenseName?: string | null
): boolean {
  if (spdxId && spdxId.toLowerCase() in OSI_LICENSES) return true;
  // Fallback: check license name for well-known OSI substrings
  if (licenseName) {
    const lower = licenseName.toLowerCase();
    if (OSI_NAME_SUBSTRINGS.some((s) => lower.includes(s))) return true;
    // Also accept any "EUPL" mention in the name
    if (lower.includes("eupl")) return true;
  }
  return false;
}

function detectLicenseFromText(content: string): string | null {
  const lower = content.toLowerCase();

  for (const signal of LICENSE_TEXT_SIGNALS) {
    if (lower.includes(signal.marker)) return signal.name;
  }

  if (
    lower.includes("european union public licence") ||
    lower.includes("european union public license") ||
    lower.includes("eupl")
  ) {
    if (lower.includes("1.2")) return "European Union Public Licence (EUPL) 1.2";
    if (lower.includes("1.1")) return "European Union Public Licence (EUPL) 1.1";
    if (lower.includes("1.0")) return "European Union Public Licence (EUPL) 1.0";
    return "European Union Public Licence (EUPL)";
  }

  const generic = OSI_NAME_SUBSTRINGS.find((s) => lower.includes(s));
  if (!generic) return null;

  // Map generic substring matches to human-friendly license names.
  if (generic === "mit license") return "MIT License";
  if (generic === "apache license") return "Apache License 2.0";
  if (generic === "gnu general public license") return "GNU General Public License";
  if (generic === "gnu lesser general public") return "GNU Lesser General Public License";
  if (generic === "gnu affero general public") return "GNU Affero General Public License";
  if (generic === "mozilla public license") return "Mozilla Public License 2.0";
  if (generic === "bsd 2-clause") return "BSD 2-Clause";
  if (generic === "bsd 3-clause") return "BSD 3-Clause";
  if (generic === "isc license") return "ISC License";
  if (generic === "creative commons zero") return "Creative Commons Zero v1.0";
  if (generic === "european union public licen") return "European Union Public Licence (EUPL)";

  return generic;
}

export async function checkLicense(
  owner: string,
  repo: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  repoMeta: any,
  tree: string[]
): Promise<CheckResult> {
  const licenseFile = tree.find((p) =>
    ["license", "license.md", "license.txt", "copying"].includes(
      p.toLowerCase()
    )
  );

  const spdxId: string | null = repoMeta?.license?.spdx_id ?? null;
  const licenseName: string | null = repoMeta?.license?.name ?? null;

  if (!licenseFile && !spdxId) {
    return {
      id: "license",
      title: "Open Source License (OSI-approved)",
      description:
        "The component must be published under an OSI-approved open-source license.",
      status: "fail",
      message:
        "No LICENSE file and no license detected by GitHub. The component does not appear to be open-source.",
      evidence: [],
      referenceUrl: "https://opensource.org/licenses",
    };
  }

  const licenseContent = licenseFile
    ? await getFileContent(owner, repo, licenseFile)
    : null;
  const detectedFromText = licenseContent
    ? detectLicenseFromText(licenseContent)
    : null;

  const approvedByMetadata = isOsiApproved(spdxId, licenseName);
  const approvedByText = detectedFromText
    ? isOsiApproved(null, detectedFromText)
    : false;

  if (!approvedByMetadata && !approvedByText) {
    return {
      id: "license",
      title: "Open Source License (OSI-approved)",
      description:
        "The component must be published under an OSI-approved open-source license.",
      status: "warn",
      message: licenseName
        ? `A LICENSE file is present (detected: "${licenseName}") but it could not be confirmed as an OSI-approved license. Please verify manually.`
        : "A LICENSE file is present but the license type was not recognised. Please verify it is OSI-approved.",
      evidence: licenseFile ? [licenseFile] : [],
      referenceUrl: "https://opensource.org/licenses",
    };
  }

  const normalizedLicenseName =
    licenseName && licenseName.toLowerCase() !== "other" ? licenseName : null;

  const name =
    (spdxId ? OSI_LICENSES[spdxId.toLowerCase()] : null) ??
    detectedFromText ??
    normalizedLicenseName ??
    "Recognized OSI-approved license";
  const source = approvedByMetadata ? "GitHub metadata" : "LICENSE file content";
  return {
    id: "license",
    title: "Open Source License (OSI-approved)",
    description:
      "The component must be published under an OSI-approved open-source license.",
    status: "pass",
    message: `License detected: ${name}. This is OSI-approved. Detection source: ${source}${spdxId ? ` (SPDX: ${spdxId})` : ""}.`,
    evidence: licenseFile ? [licenseFile] : [],
    referenceUrl: "https://opensource.org/licenses",
  };
}
