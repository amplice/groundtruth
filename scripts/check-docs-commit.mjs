import { execFileSync } from "node:child_process";

const DOC_FILES = new Set([
  "docs/README.md",
  "docs/USER_GUIDE.md",
  "docs/AI_OPERATOR_GUIDE.md",
  "src/docs/helpContent.ts",
]);

const SOURCE_PREFIXES = [
  "src/",
  "docs/",
];

function getStagedFiles() {
  const output = execFileSync(
    "git",
    ["diff", "--cached", "--name-only", "--diff-filter=ACMR"],
    { encoding: "utf8" },
  );
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function isDocFile(path) {
  return DOC_FILES.has(path);
}

function isRelevantSourceFile(path) {
  if (isDocFile(path)) {
    return false;
  }
  return SOURCE_PREFIXES.some((prefix) => path.startsWith(prefix));
}

const stagedFiles = getStagedFiles();
const stagedDocFiles = stagedFiles.filter(isDocFile);
const stagedRelevantSourceFiles = stagedFiles.filter(isRelevantSourceFile);

if (stagedRelevantSourceFiles.length === 0) {
  process.exit(0);
}

if (stagedDocFiles.length > 0) {
  process.exit(0);
}

console.error(
  [
    "Commit blocked: source/runtime changes are staged, but the required user-facing docs were not updated.",
    "Update and stage at least one of:",
    "  - docs/USER_GUIDE.md",
    "  - docs/AI_OPERATOR_GUIDE.md",
    "  - docs/README.md",
    "  - src/docs/helpContent.ts",
  ].join("\n"),
);

process.exit(1);
