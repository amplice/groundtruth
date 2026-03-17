import fs from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const distDir = path.join(repoRoot, "dist");

const args = parseArgs(process.argv.slice(2));
if (!args.project || !args.out) {
  console.error("Usage: node scripts/export-playable-build.mjs --project <project-json> --out <output-dir>");
  process.exit(1);
}

const inputPath = path.resolve(args.project);
const outputDir = path.resolve(args.out);
const rawInput = JSON.parse(await fs.readFile(inputPath, "utf8"));
const playable = normalizePlayableBuild(rawInput);

await ensureDistExists();
await fs.rm(outputDir, { recursive: true, force: true });
await fs.mkdir(outputDir, { recursive: true });
await fs.cp(distDir, outputDir, { recursive: true });

const gameJsonPath = path.join(outputDir, "game.json");
await fs.writeFile(gameJsonPath, JSON.stringify(playable, null, 2), "utf8");

const indexPath = path.join(outputDir, "index.html");
const indexHtml = await fs.readFile(indexPath, "utf8");
const bootScript = `<script>window.__GROUNDTRUTH_BOOT__={mode:"player",manifest:"./game.json"};</script>`;
const nextIndexHtml = indexHtml.includes("</head>")
  ? indexHtml.replace("</head>", `  ${bootScript}\n</head>`)
  : `${bootScript}\n${indexHtml}`;
await fs.writeFile(indexPath, nextIndexHtml, "utf8");

console.log(`Playable build exported to ${outputDir}`);

function parseArgs(argv) {
  const parsed = {};
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    parsed[token.slice(2)] = argv[index + 1];
    index += 1;
  }
  if (!parsed.project && positional[0]) {
    parsed.project = positional[0];
  }
  if (!parsed.out && positional[1]) {
    parsed.out = positional[1];
  }
  return parsed;
}

function normalizePlayableBuild(value) {
  if (value?.kind === "groundtruth_playable" && value?.project) {
    return value;
  }
  const project = value?.kind === "groundtruth_project" && value?.project
    ? value.project
    : value?.project
      ? value.project
      : value;
  if (!project?.metadata || !project?.worlds || !project?.currentWorldId) {
    throw new Error("Input file does not contain a valid Groundtruth project or playable build.");
  }
  return {
    kind: "groundtruth_playable",
    version: 1,
    builtAt: new Date().toISOString(),
    manifest: {
      title: project.metadata.name,
      startupWorldId: project.currentWorldId,
      defaultGameMode: project.metadata.defaultGameMode,
    },
    project,
  };
}

async function ensureDistExists() {
  try {
    await fs.access(distDir);
  } catch {
    throw new Error("Missing dist/ output. Run `npm run build` before exporting a playable build.");
  }
}
