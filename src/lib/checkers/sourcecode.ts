import type { CheckResult } from "../types";

const SOURCE_CODE_EXTENSIONS = [
  // Python
  ".py",
  // JavaScript/TypeScript
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  // Java
  ".java",
  // C/C++/C#
  ".c",
  ".cpp",
  ".cc",
  ".cxx",
  ".h",
  ".hpp",
  ".cs",
  // Go
  ".go",
  // Rust
  ".rs",
  // PHP
  ".php",
  // Ruby
  ".rb",
  // Swift
  ".swift",
  // Kotlin
  ".kt",
  ".kts",
  // Scala
  ".scala",
  ".sc",
  // Groovy
  ".groovy",
  ".gradle",
  // Shell/Bash
  ".sh",
  ".bash",
  // Perl
  ".pl",
  ".pm",
  // R
  ".r",
  // MATLAB
  ".m",
  // Julia
  ".jl",
  // Lua
  ".lua",
  // Clojure
  ".clj",
  ".cljs",
  // Haskell
  ".hs",
  // Elixir
  ".ex",
  ".exs",
  // Erlang
  ".erl",
  // Coffeescript
  ".coffee",
  // Groovy
  ".groovy",
];

export function checkSourceCode(tree: string[]): CheckResult {
  const sourceFiles = tree.filter((path) => {
    const lower = path.toLowerCase();
    // Exclude common non-source directories and files
    if (
      lower.startsWith("node_modules/") ||
      lower.startsWith(".git/") ||
      lower.startsWith("dist/") ||
      lower.startsWith("build/") ||
      lower.startsWith(".next/") ||
      lower.includes("/__pycache__/") ||
      lower.includes("/.venv/") ||
      lower.includes("/venv/") ||
      lower.endsWith(".lock") ||
      lower.endsWith(".sum") ||
      lower === "package.json" ||
      lower === "package-lock.json" ||
      lower === "yarn.lock"
    ) {
      return false;
    }

    return SOURCE_CODE_EXTENSIONS.some((ext) => lower.endsWith(ext));
  });

  if (sourceFiles.length === 0) {
    return {
      id: "sourcecode",
      title: "Actual Source Code",
      description:
        "The repository must contain actual source code files, not just documentation, configuration, or configuration templates.",
      status: "fail",
      message:
        "No source code files detected in the repository. Consider whether this is truly a software component.",
      evidence: [],
      referenceUrl: "https://commonground.nl",
    };
  }

  return {
    id: "sourcecode",
    title: "Actual Source Code",
    description:
      "The repository must contain actual source code files, not just documentation, configuration, or configuration templates.",
    status: "pass",
    message: `Found ${sourceFiles.length} source code file(s).`,
    evidence: sourceFiles.slice(0, 10),
    referenceUrl: "https://commonground.nl",
  };
}
