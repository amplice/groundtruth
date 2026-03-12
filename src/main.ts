import "./styles.css";

import { parseCommandScript } from "./core/commands";
import { evaluateWorld } from "./core/evaluation";
import {
  defaultFlatWorldOptions,
  exampleCommandScript,
  makeFlatOutpostWorld,
  makeThirdPersonSurvivalWorld,
} from "./core/sampleWorld";
import { WorldStore } from "./core/worldStore";
import { ThirdPersonSurvivalModule } from "./modules/thirdPersonSurvival";
import { InputController } from "./runtime/input";
import { PhysicsRuntime } from "./runtime/physicsRuntime";
import { SceneRuntime } from "./runtime/sceneRuntime";

async function bootstrap(): Promise<void> {
  const root = document.querySelector<HTMLDivElement>("#app");
  if (!root) {
    throw new Error("Missing #app mount point.");
  }

  root.innerHTML = `
    <div class="shell">
      <aside class="panel">
        <div class="brand">
          <span class="eyebrow">Groundtruth</span>
          <h1>Web Runtime</h1>
          <p>Browser-first semantic runtime for AI-native 3D games.</p>
        </div>
        <div class="controls">
          <button id="load-generated">Generate Flat Outpost</button>
          <button id="load-sample">Load Survival Slice</button>
          <button id="reset-world" class="secondary">Reset World</button>
          <button id="apply-commands">Apply Commands</button>
          <button id="export-world" class="secondary">Export Snapshot</button>
          <button id="import-world" class="secondary">Import Snapshot</button>
          <button id="capture-shot" class="secondary">Capture Screenshot</button>
        </div>
        <section class="section">
          <div class="section-head">
            <h2>Generation</h2>
            <span>Flat-world seed</span>
          </div>
          <div class="generation-grid">
            <label>
              <span>Seed</span>
              <input id="world-seed" type="number" value="${defaultFlatWorldOptions.seed}" />
            </label>
            <label>
              <span>Size</span>
              <input id="world-size" type="number" value="${defaultFlatWorldOptions.worldHalfExtent}" />
            </label>
            <label>
              <span>Buildings</span>
              <input id="building-count" type="number" value="${defaultFlatWorldOptions.buildingCount}" />
            </label>
            <label>
              <span>Zombies</span>
              <input id="zombie-count" type="number" value="${defaultFlatWorldOptions.zombieCount}" />
            </label>
            <label>
              <span>Crates</span>
              <input id="crate-count" type="number" value="${defaultFlatWorldOptions.crateCount}" />
            </label>
          </div>
        </section>
        <section class="section">
          <div class="section-head">
            <h2>Debug View</h2>
            <span>Human overlays</span>
          </div>
          <div class="toggle-grid">
            <label class="toggle">
              <input id="toggle-zones" type="checkbox" checked />
              <span>Zone volumes</span>
            </label>
            <label class="toggle">
              <input id="toggle-combat" type="checkbox" />
              <span>Combat ranges</span>
            </label>
            <label class="toggle">
              <input id="toggle-interaction" type="checkbox" checked />
              <span>Loot ranges</span>
            </label>
            <label class="toggle">
              <input id="toggle-aggro" type="checkbox" />
              <span>Aggro radii</span>
            </label>
          </div>
        </section>
        <section class="section">
          <div class="section-head">
            <h2>Command Script</h2>
            <span>Semantic JSON</span>
          </div>
          <textarea id="command-script" spellcheck="false"></textarea>
        </section>
        <section class="section">
          <div class="section-head">
            <h2>Diagnostics</h2>
            <span>Live state</span>
          </div>
          <pre id="diagnostics"></pre>
        </section>
        <section class="section">
          <div class="section-head">
            <h2>Evaluation</h2>
            <span>World checks</span>
          </div>
          <pre id="evaluation"></pre>
        </section>
        <section class="section">
          <div class="section-head">
            <h2>Session</h2>
            <span>Controls/runtime</span>
          </div>
          <pre id="session"></pre>
        </section>
        <section class="section">
          <div class="section-head">
            <h2>Inspector</h2>
            <span>Selected entity</span>
          </div>
          <pre id="inspector"></pre>
        </section>
        <section class="section">
          <div class="section-head">
            <h2>Assets</h2>
            <span>Validation/runtime</span>
          </div>
          <pre id="asset-status"></pre>
        </section>
        <section class="section">
          <div class="section-head">
            <h2>Selection</h2>
            <span>Entity JSON</span>
          </div>
          <pre id="selection"></pre>
        </section>
        <section class="section">
          <div class="section-head">
            <h2>Issues</h2>
            <span>Command/runtime</span>
          </div>
          <pre id="issues"></pre>
        </section>
      </aside>
      <main class="viewport">
        <div class="viewport-head">
          <div>
            <span class="eyebrow">Direction</span>
            <strong>Semantic world runtime first, genre modules second.</strong>
          </div>
          <div class="viewport-actions">
            <button id="toggle-sidebar" class="secondary chrome-toggle" type="button" aria-expanded="true">Hide Tools</button>
            <div id="runtime-stats" class="runtime-stats"></div>
          </div>
        </div>
        <div id="canvas-root" class="canvas-root">
          <div id="playtest-hud" class="playtest-hud"></div>
        </div>
        <img id="screenshot-preview" class="screenshot-preview" alt="Latest screenshot" />
      </main>
    </div>
    <input id="snapshot-file" type="file" accept="application/json" hidden />
  `;

  const canvasRoot = root.querySelector<HTMLElement>("#canvas-root");
  const shell = root.querySelector<HTMLElement>(".shell");
  const diagnosticsNode = root.querySelector<HTMLElement>("#diagnostics");
  const evaluationNode = root.querySelector<HTMLElement>("#evaluation");
  const sessionNode = root.querySelector<HTMLElement>("#session");
  const inspectorNode = root.querySelector<HTMLElement>("#inspector");
  const assetStatusNode = root.querySelector<HTMLElement>("#asset-status");
  const selectionNode = root.querySelector<HTMLElement>("#selection");
  const issuesNode = root.querySelector<HTMLElement>("#issues");
  const runtimeStatsNode = root.querySelector<HTMLElement>("#runtime-stats");
  const toggleSidebarButton = root.querySelector<HTMLButtonElement>("#toggle-sidebar");
  const commandScript = root.querySelector<HTMLTextAreaElement>("#command-script");
  const screenshotPreview = root.querySelector<HTMLImageElement>("#screenshot-preview");
  const playtestHud = root.querySelector<HTMLElement>("#playtest-hud");
  const snapshotFileInput = root.querySelector<HTMLInputElement>("#snapshot-file");
  const seedInput = root.querySelector<HTMLInputElement>("#world-seed");
  const sizeInput = root.querySelector<HTMLInputElement>("#world-size");
  const buildingInput = root.querySelector<HTMLInputElement>("#building-count");
  const zombieInput = root.querySelector<HTMLInputElement>("#zombie-count");
  const crateInput = root.querySelector<HTMLInputElement>("#crate-count");
  const toggleZonesInput = root.querySelector<HTMLInputElement>("#toggle-zones");
  const toggleCombatInput = root.querySelector<HTMLInputElement>("#toggle-combat");
  const toggleInteractionInput = root.querySelector<HTMLInputElement>("#toggle-interaction");
  const toggleAggroInput = root.querySelector<HTMLInputElement>("#toggle-aggro");

  if (
    !canvasRoot ||
    !shell ||
    !diagnosticsNode ||
    !evaluationNode ||
    !sessionNode ||
    !inspectorNode ||
    !assetStatusNode ||
    !selectionNode ||
    !issuesNode ||
    !runtimeStatsNode ||
    !toggleSidebarButton ||
    !commandScript ||
    !screenshotPreview ||
    !playtestHud ||
    !snapshotFileInput ||
    !seedInput ||
    !sizeInput ||
    !buildingInput ||
    !zombieInput ||
    !crateInput ||
    !toggleZonesInput ||
    !toggleCombatInput ||
    !toggleInteractionInput ||
    !toggleAggroInput
  ) {
    throw new Error("UI bootstrap failed.");
  }

  const store = new WorldStore(makeFlatOutpostWorld());
  const scene = new SceneRuntime(canvasRoot, (entityId) => store.selectEntity(entityId));
  const physics = await PhysicsRuntime.create(store.getWorld().settings.gravity.y);
  const input = new InputController();
  const runtimeModule = new ThirdPersonSurvivalModule();
  let lastFrameTime = performance.now();
  let sidebarCollapsed = false;
  let pendingWorldRebuild = false;

  commandScript.value = exampleCommandScript;
  scene.setDebugOptions({
    showZones: toggleZonesInput.checked,
    showCombatRanges: toggleCombatInput.checked,
    showInteractionRanges: toggleInteractionInput.checked,
    showAggroRanges: toggleAggroInput.checked,
  });

  const refreshSidebar = (): void => {
    const world = store.getWorld();
    const diagnostics = store.getDiagnostics();
    const evaluation = evaluateWorld(world);
    const runtimeFindings = runtimeModule.getDebugFindings?.() ?? [];
    const selectedEntityId = store.getSelectedEntityId();
    const selectedRuntimeDebug = selectedEntityId
      ? runtimeModule.getEntityDebug?.(world, selectedEntityId) ?? []
      : [];
    const selectedVisualDebug = selectedEntityId
      ? scene.getEntityVisualDebug(selectedEntityId)
      : [];
    const playerRuntimeDebug = runtimeModule.getEntityDebug?.(world, "player") ?? [];
    const playerVisualDebug = scene.getEntityVisualDebug("player");
    const assetReports = scene.getAssetReports();
    const assetFindings = assetReports.flatMap((report) => {
      const lines = report.warnings.map((warning) => `${report.entityId}: ${warning}`);
      if (report.error) {
        lines.unshift(`${report.entityId}: ${report.error}`);
      }
      return lines;
    });

    diagnosticsNode.textContent = JSON.stringify(diagnostics, null, 2);
    evaluationNode.textContent = formatEvaluation(evaluation.findings);
    sessionNode.textContent = runtimeModule.getStatusLines?.().join("\n") ?? "No session state.";
    inspectorNode.textContent = formatInspector(
      selectedEntityId,
      selectedRuntimeDebug,
      selectedVisualDebug,
    );
    assetStatusNode.textContent = formatAssetReports(assetReports);
    playtestHud.innerHTML = renderHud(
      runtimeModule.getStatusLines?.() ?? [],
      runtimeFindings,
      evaluation.findings.map((finding) => `[${finding.severity}] ${finding.message}`),
      [
        ...playerRuntimeDebug,
        ...playerVisualDebug,
      ],
    );
    selectionNode.textContent = store.getSelectedEntityJson();
    issuesNode.textContent =
      [
        ...runtimeFindings,
        ...assetFindings,
        ...evaluation.findings.map((finding) => `[${finding.severity}] ${finding.message}`),
        ...store.getCommandIssues(),
      ].join("\n") ||
      store.getCommandIssues().join("\n") ||
      "No command issues.\nUse Generate Flat Outpost for a procedural world seed, or load the authored survival slice.";
    const renderStats = scene.getStats();
    runtimeStatsNode.textContent = [
      `Mode: ${world.gameMode}`,
      `Draw calls: ${renderStats.drawCalls}`,
      `Triangles: ${renderStats.triangleCount}`,
      `Objects: ${renderStats.objectCount}`,
      `Physics colliders: ${physics.getColliderCount()}`,
      `Eval warnings: ${evaluation.counts.warn}`,
      `Eval errors: ${evaluation.counts.error}`,
      `Module: ${runtimeModule.id}`,
    ].join(" | ");
  };

  const rebuildWorld = (): void => {
    const world = store.getWorld();
    scene.setWorld(world);
    physics.syncWorld(world);
    refreshSidebar();
  };

  const buildGeneratedWorld = (): void => {
    store.setWorld(
      makeFlatOutpostWorld({
        seed: parseNumber(seedInput.value, defaultFlatWorldOptions.seed, 1),
        worldHalfExtent: parseNumber(sizeInput.value, defaultFlatWorldOptions.worldHalfExtent, 24),
        buildingCount: parseNumber(buildingInput.value, defaultFlatWorldOptions.buildingCount, 1),
        zombieCount: parseNumber(zombieInput.value, defaultFlatWorldOptions.zombieCount, 0),
        crateCount: parseNumber(crateInput.value, defaultFlatWorldOptions.crateCount, 0),
      }),
    );
  };

  store.subscribe((event) => {
    if (event === "world") {
      pendingWorldRebuild = true;
      return;
    }
    refreshSidebar();
  });
  pendingWorldRebuild = true;

  const syncSidebarState = (): void => {
    shell.classList.toggle("sidebar-collapsed", sidebarCollapsed);
    toggleSidebarButton.textContent = sidebarCollapsed ? "Show Tools" : "Hide Tools";
    toggleSidebarButton.setAttribute("aria-expanded", String(!sidebarCollapsed));
    requestAnimationFrame(() => scene.handleViewportResize());
  };

  toggleSidebarButton.addEventListener("click", () => {
    sidebarCollapsed = !sidebarCollapsed;
    syncSidebarState();
  });

  root.querySelector<HTMLButtonElement>("#load-generated")?.addEventListener("click", () => {
    buildGeneratedWorld();
  });

  root.querySelector<HTMLButtonElement>("#load-sample")?.addEventListener("click", () => {
    store.setWorld(makeThirdPersonSurvivalWorld());
  });

  root.querySelector<HTMLButtonElement>("#reset-world")?.addEventListener("click", () => {
    store.apply([{ op: "reset_world" }]);
  });

  root.querySelector<HTMLButtonElement>("#apply-commands")?.addEventListener("click", () => {
    try {
      store.apply(parseCommandScript(commandScript.value));
    } catch (error) {
      issuesNode.textContent =
        error instanceof Error ? error.message : String(error);
    }
  });

  root.querySelector<HTMLButtonElement>("#capture-shot")?.addEventListener("click", () => {
    screenshotPreview.src = scene.captureScreenshot();
    screenshotPreview.classList.add("visible");
  });

  root.querySelector<HTMLButtonElement>("#export-world")?.addEventListener("click", () => {
    const snapshot = {
      capturedAt: new Date().toISOString(),
      screenshot: scene.captureScreenshot(),
      world: store.getWorld(),
    };
    downloadJson(
      `${snapshot.world.metadata.id || "groundtruth-world"}.snapshot.json`,
      snapshot,
    );
    screenshotPreview.src = snapshot.screenshot;
    screenshotPreview.classList.add("visible");
  });

  root.querySelector<HTMLButtonElement>("#import-world")?.addEventListener("click", () => {
    snapshotFileInput.click();
  });

  snapshotFileInput.addEventListener("change", async () => {
    const file = snapshotFileInput.files?.[0];
    if (!file) {
      return;
    }

    try {
      const parsed = JSON.parse(await file.text()) as {
        world?: ReturnType<WorldStore["getWorld"]>;
        screenshot?: string;
      };
      if (!parsed.world) {
        throw new Error("Snapshot JSON does not contain a world document.");
      }
      store.setWorld(parsed.world);
      if (parsed.screenshot) {
        screenshotPreview.src = parsed.screenshot;
        screenshotPreview.classList.add("visible");
      }
    } catch (error) {
      issuesNode.textContent = error instanceof Error ? error.message : String(error);
    } finally {
      snapshotFileInput.value = "";
    }
  });

  const syncDebugOptions = (): void => {
    scene.setDebugOptions({
      showZones: toggleZonesInput.checked,
      showCombatRanges: toggleCombatInput.checked,
      showInteractionRanges: toggleInteractionInput.checked,
      showAggroRanges: toggleAggroInput.checked,
    });
  };

  toggleZonesInput.addEventListener("change", syncDebugOptions);
  toggleCombatInput.addEventListener("change", syncDebugOptions);
  toggleInteractionInput.addEventListener("change", syncDebugOptions);
  toggleAggroInput.addEventListener("change", syncDebugOptions);
  syncSidebarState();

  const animate = (): void => {
    const now = performance.now();
    const dtSeconds = Math.min((now - lastFrameTime) / 1000, 0.05);
    lastFrameTime = now;
    if (pendingWorldRebuild) {
      pendingWorldRebuild = false;
      rebuildWorld();
    }
    runtimeModule.update(dtSeconds, {
      store,
      scene,
      physics,
      input,
    });
    physics.step();
    scene.renderFrame(dtSeconds);
    refreshSidebar();
    requestAnimationFrame(animate);
  };
  animate();
}

void bootstrap();

function parseNumber(source: string, fallback: number, minimum: number): number {
  const value = Number.parseInt(source, 10);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(minimum, value);
}

function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function renderHud(
  statusLines: string[],
  findings: string[],
  evaluationLines: string[],
  debugLines: string[],
): string {
  const statusHtml = statusLines
    .map((line) => `<div>${escapeHtml(line)}</div>`)
    .join("");
  const findingsHtml = findings
    .map((line) => `<div>${escapeHtml(line)}</div>`)
    .join("");
  const evaluationHtml = evaluationLines
    .slice(0, 4)
    .map((line) => `<div>${escapeHtml(line)}</div>`)
    .join("");
  const debugHtml = debugLines
    .slice(0, 6)
    .map((line) => `<div>${escapeHtml(line)}</div>`)
    .join("");
  return `
    <div class="hud-card">
      <div class="hud-title">Playtest HUD</div>
      ${statusHtml}
    </div>
    <div class="hud-card hud-findings">
      <div class="hud-title">Runtime Findings</div>
      ${findingsHtml}
    </div>
    <div class="hud-card hud-evaluation">
      <div class="hud-title">World Evaluation</div>
      ${evaluationHtml}
    </div>
    <div class="hud-card hud-debug">
      <div class="hud-title">Player Debug</div>
      ${debugHtml}
    </div>
  `;
}

function formatEvaluation(
  findings: Array<{ severity: string; message: string }>,
): string {
  return findings
    .map((finding) => `[${finding.severity}] ${finding.message}`)
    .join("\n");
}

function formatInspector(
  entityId: string | null,
  runtimeLines: string[],
  visualLines: string[],
): string {
  if (!entityId) {
    return "No entity selected.";
  }

  return [
    `Entity: ${entityId}`,
    ...runtimeLines,
    ...visualLines,
  ].join("\n");
}

function formatAssetReports(
  reports: ReturnType<SceneRuntime["getAssetReports"]>,
): string {
  if (reports.length === 0) {
    return "No model assets in current world.";
  }

  return reports
    .map((report) => {
      const clipSummary = report.clips
        .map((clip) => `${clip.state}:${clip.status}${clip.durationSeconds ? ` (${clip.durationSeconds.toFixed(2)}s)` : ""}`)
        .join(", ");
      const warningSummary = report.warnings.length > 0
        ? ` | warnings: ${report.warnings.join(" | ")}`
        : "";
      const errorSummary = report.error ? ` | error: ${report.error}` : "";
      return `${report.entityId} -> ${report.status} ${report.format.toUpperCase()} | ${clipSummary}${warningSummary}${errorSummary}`;
    })
    .join("\n");
}

function escapeHtml(source: string): string {
  return source
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
