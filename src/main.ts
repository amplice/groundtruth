import "./styles.css";

import { parseCommandScript } from "./core/commands";
import { evaluateWorld } from "./core/evaluation";
import { ModelRenderComponent, makeVec3, resolveEntity } from "./core/schema";
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
          <button id="stress-world" class="secondary">Stress Test Swaps</button>
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
            <h2>Authoring</h2>
            <span>In-world editing</span>
          </div>
          <div class="generation-grid">
            <label>
              <span>Mode</span>
              <input id="authoring-mode" value="play" readonly />
            </label>
            <label>
              <span>Prefab</span>
              <select id="authoring-prefab"></select>
            </label>
            <label>
              <span>Place scale</span>
              <input id="authoring-scale" type="number" step="0.1" value="1" />
            </label>
            <label>
              <span>Place yaw deg</span>
              <input id="authoring-yaw" type="number" step="15" value="0" />
            </label>
            <label>
              <span>Zone kind</span>
              <select id="authoring-zone-kind">
                <option value="spawn">spawn</option>
                <option value="safe">safe</option>
                <option value="loot">loot</option>
                <option value="encounter">encounter</option>
                <option value="objective">objective</option>
                <option value="trigger">trigger</option>
              </select>
            </label>
            <label>
              <span>Zone shape</span>
              <select id="authoring-zone-shape">
                <option value="sphere">sphere</option>
                <option value="box">box</option>
              </select>
            </label>
            <label>
              <span>Zone size</span>
              <input id="authoring-zone-size" type="number" step="1" value="10" />
            </label>
          </div>
          <div class="controls">
            <button id="mode-play" class="secondary">Play</button>
            <button id="mode-place" class="secondary">Place</button>
            <button id="mode-move" class="secondary">Move</button>
            <button id="mode-zone" class="secondary">Zone</button>
            <button id="apply-selected-transform" class="secondary">Apply To Selected</button>
            <button id="delete-selected" class="secondary">Delete Selected</button>
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
            <h2>Model Tuning</h2>
            <span>Selected model</span>
          </div>
          <div class="generation-grid">
            <label>
              <span>Scale</span>
              <input id="model-scale" type="number" step="0.01" value="1" />
            </label>
            <label>
              <span>Yaw deg</span>
              <input id="model-yaw" type="number" step="1" value="0" />
            </label>
            <label>
              <span>Offset Y</span>
              <input id="model-offset-y" type="number" step="0.01" value="0" />
            </label>
          </div>
          <div class="controls">
            <button id="apply-model-tuning">Apply Tuning</button>
            <button id="refresh-model-tuning" class="secondary">Load Selected</button>
          </div>
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
        <section class="section">
          <div class="section-head">
            <h2>Events</h2>
            <span>Recent runtime log</span>
          </div>
          <pre id="event-log"></pre>
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
  const modelScaleInput = root.querySelector<HTMLInputElement>("#model-scale");
  const modelYawInput = root.querySelector<HTMLInputElement>("#model-yaw");
  const modelOffsetYInput = root.querySelector<HTMLInputElement>("#model-offset-y");
  const selectionNode = root.querySelector<HTMLElement>("#selection");
  const issuesNode = root.querySelector<HTMLElement>("#issues");
  const eventLogNode = root.querySelector<HTMLElement>("#event-log");
  const runtimeStatsNode = root.querySelector<HTMLElement>("#runtime-stats");
  const toggleSidebarButton = root.querySelector<HTMLButtonElement>("#toggle-sidebar");
  const commandScript = root.querySelector<HTMLTextAreaElement>("#command-script");
  const screenshotPreview = root.querySelector<HTMLImageElement>("#screenshot-preview");
  const playtestHud = root.querySelector<HTMLElement>("#playtest-hud");
  const snapshotFileInput = root.querySelector<HTMLInputElement>("#snapshot-file");
  const authoringModeInput = root.querySelector<HTMLInputElement>("#authoring-mode");
  const authoringPrefabInput = root.querySelector<HTMLSelectElement>("#authoring-prefab");
  const authoringScaleInput = root.querySelector<HTMLInputElement>("#authoring-scale");
  const authoringYawInput = root.querySelector<HTMLInputElement>("#authoring-yaw");
  const authoringZoneKindInput = root.querySelector<HTMLSelectElement>("#authoring-zone-kind");
  const authoringZoneShapeInput = root.querySelector<HTMLSelectElement>("#authoring-zone-shape");
  const authoringZoneSizeInput = root.querySelector<HTMLInputElement>("#authoring-zone-size");
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
    !modelScaleInput ||
    !modelYawInput ||
    !modelOffsetYInput ||
    !selectionNode ||
    !issuesNode ||
    !eventLogNode ||
    !runtimeStatsNode ||
    !toggleSidebarButton ||
    !commandScript ||
    !screenshotPreview ||
    !playtestHud ||
    !snapshotFileInput ||
    !authoringModeInput ||
    !authoringPrefabInput ||
    !authoringScaleInput ||
    !authoringYawInput ||
    !authoringZoneKindInput ||
    !authoringZoneShapeInput ||
    !authoringZoneSizeInput ||
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
  let authoringMode: "play" | "place" | "move" | "zone" = "play";
  const scene = new SceneRuntime(canvasRoot, (entityId) => {
    if (authoringMode !== "play") {
      return;
    }
    store.selectEntity(entityId);
  });
  const physics = await PhysicsRuntime.create(store.getWorld().settings.gravity.y);
  const input = new InputController();
  const runtimeModule = new ThirdPersonSurvivalModule();
  let lastFrameTime = performance.now();
  let sidebarCollapsed = false;
  let pendingWorldRebuild = false;
  let worldSwapState: "idle" | "queued" | "rebuilding" | "failed" = "idle";
  let stressCooldownFrames = 0;
  let modelTuningBoundEntityId: string | null = null;
  let selectedTransformBoundEntityId: string | null = null;
  let placedEntityCounter = 1;
  let placedZoneCounter = 1;
  let moveDragActive = false;
  const stressActions: Array<() => void> = [];
  const runtimeEvents: string[] = [];

  const appendEvent = (message: string): void => {
    const line = `${new Date().toLocaleTimeString()} | ${message}`;
    runtimeEvents.unshift(line);
    if (runtimeEvents.length > 40) {
      runtimeEvents.length = 40;
    }
  };

  const syncModelTuningInputs = (force = false): void => {
    const selectedEntityId = store.getSelectedEntityId();
    if (!force && selectedEntityId === modelTuningBoundEntityId) {
      return;
    }
    modelTuningBoundEntityId = selectedEntityId;
    if (!selectedEntityId) {
      modelScaleInput.value = "1";
      modelYawInput.value = "0";
      modelOffsetYInput.value = "0";
      return;
    }

    const entity = store.peekWorld().entities.find((item) => item.id === selectedEntityId);
    if (!entity) {
      return;
    }
    const resolved = resolveEntity(store.peekWorld(), entity);
    const render = resolved.components.render;
    if (!render || render.type !== "model") {
      modelScaleInput.value = "1";
      modelYawInput.value = "0";
      modelOffsetYInput.value = "0";
      return;
    }

    modelScaleInput.value = String(render.modelScale?.x ?? 1);
    modelYawInput.value = String(((render.modelRotation?.y ?? 0) * 180) / Math.PI);
    modelOffsetYInput.value = String(render.modelOffset?.y ?? 0);
  };

  const syncSelectedTransformInputs = (force = false): void => {
    const selectedEntityId = store.getSelectedEntityId();
    if (!force && selectedEntityId === selectedTransformBoundEntityId) {
      return;
    }
    selectedTransformBoundEntityId = selectedEntityId;
    if (!selectedEntityId) {
      return;
    }

    const entity = store.peekWorld().entities.find((item) => item.id === selectedEntityId);
    if (!entity) {
      return;
    }
    const resolved = resolveEntity(store.peekWorld(), entity);
    authoringScaleInput.value = String(resolved.transform.scale?.x ?? 1);
    authoringYawInput.value = String(((resolved.transform.rotation?.y ?? 0) * 180) / Math.PI);
  };

  const applySelectedModelTuning = (): void => {
    const selectedEntityId = store.getSelectedEntityId();
    if (!selectedEntityId) {
      appendEvent("Model tuning skipped: no selected entity.");
      return;
    }
    const entity = store.peekWorld().entities.find((item) => item.id === selectedEntityId);
    if (!entity) {
      appendEvent(`Model tuning skipped: missing entity '${selectedEntityId}'.`);
      return;
    }

    const resolved = resolveEntity(store.peekWorld(), entity);
    const render = resolved.components.render;
    if (!render || render.type !== "model") {
      appendEvent(`Model tuning skipped: '${selectedEntityId}' is not a model entity.`);
      return;
    }

    const currentScale = render.modelScale ?? makeVec3(1, 1, 1);
    const currentOffset = render.modelOffset ?? makeVec3(0, 0, 0);
    const nextScale = readNumber(modelScaleInput.value, currentScale.x);
    const nextOffsetY = readNumber(modelOffsetYInput.value, currentOffset.y);
    const nextYawDegrees = readNumber(modelYawInput.value, (render.modelRotation?.y ?? 0) * (180 / Math.PI));
    const nextRender: ModelRenderComponent = {
      ...render,
      modelScale: makeVec3(
        nextScale,
        nextScale,
        nextScale,
      ),
      modelOffset: makeVec3(
        currentOffset.x,
        nextOffsetY,
        currentOffset.z,
      ),
      modelRotation: {
        x: render.modelRotation?.x ?? 0,
        y: (nextYawDegrees * Math.PI) / 180,
        z: render.modelRotation?.z ?? 0,
      },
    };

    store.updateEntityComponents(selectedEntityId, { render: nextRender }, true);
    appendEvent(`Applied model tuning to '${selectedEntityId}'.`);
  };

  const applySelectedEntityTransform = (): void => {
    const selectedEntityId = store.getSelectedEntityId();
    if (!selectedEntityId) {
      appendEvent("Transform apply skipped: no selected entity.");
      return;
    }
    const entity = store.peekWorld().entities.find((item) => item.id === selectedEntityId);
    if (!entity) {
      appendEvent(`Transform apply skipped: missing entity '${selectedEntityId}'.`);
      return;
    }
    const scale = readNumber(authoringScaleInput.value, entity.transform.scale?.x ?? 1);
    const yawDegrees = readNumber(authoringYawInput.value, ((entity.transform.rotation?.y ?? 0) * 180) / Math.PI);
    store.updateEntityTransform(
      selectedEntityId,
      {
        rotation: makeVec3(
          entity.transform.rotation?.x ?? 0,
          (yawDegrees * Math.PI) / 180,
          entity.transform.rotation?.z ?? 0,
        ),
        scale: makeVec3(scale, scale, scale),
      },
      true,
    );
    appendEvent(`Applied transform to '${selectedEntityId}'.`);
  };

  const syncAuthoringMode = (): void => {
    authoringModeInput.value = authoringMode;
    if (authoringMode !== "move") {
      stopMoveDrag();
    }
  };

  const syncAuthoringPrefabs = (): void => {
    const world = store.peekWorld();
    const prefabIds = Object.keys(world.prefabs).sort();
    const currentValue = authoringPrefabInput.value || prefabIds[0] || "";
    authoringPrefabInput.innerHTML = prefabIds
      .map((prefabId) => `<option value="${escapeHtml(prefabId)}">${escapeHtml(prefabId)}</option>`)
      .join("");
    authoringPrefabInput.value = prefabIds.includes(currentValue) ? currentValue : prefabIds[0] ?? "";
  };

  const placePrefabAt = (prefabId: string, x: number, z: number): void => {
    const prefab = store.peekWorld().prefabs[prefabId];
    if (!prefab) {
      appendEvent(`Cannot place unknown prefab '${prefabId}'.`);
      return;
    }

    const entityId = `${prefabId}.placed.${placedEntityCounter++}`;
    store.apply([
      {
        op: "spawn_entity",
        entity: {
          id: entityId,
          name: `${prefab.name} ${placedEntityCounter - 1}`,
          prefabId,
          transform: {
            position: makeVec3(x, inferPlacementHeight(prefabId), z),
            rotation: makeVec3(0, (readNumber(authoringYawInput.value, 0) * Math.PI) / 180, 0),
            scale: makeVec3(
              readNumber(authoringScaleInput.value, 1),
              readNumber(authoringScaleInput.value, 1),
              readNumber(authoringScaleInput.value, 1),
            ),
          },
        },
      },
    ]);
    store.selectEntity(entityId);
    appendEvent(`Placed '${prefabId}' at (${x.toFixed(1)}, ${z.toFixed(1)}).`);
  };

  const moveSelectedEntityTo = (x: number, z: number): void => {
    const selectedEntityId = store.getSelectedEntityId();
    if (!selectedEntityId) {
      appendEvent("Move skipped: no selected entity.");
      return;
    }
    const entity = store.peekWorld().entities.find((item) => item.id === selectedEntityId);
    if (!entity) {
      appendEvent(`Move skipped: missing entity '${selectedEntityId}'.`);
      return;
    }
    store.updateEntityTransform(
      selectedEntityId,
      {
        position: {
          ...entity.transform.position,
          x,
          z,
        },
      },
      true,
    );
    appendEvent(`Moved '${selectedEntityId}' to (${x.toFixed(1)}, ${z.toFixed(1)}).`);
  };

  const deleteSelectedEntity = (): void => {
    const selectedEntityId = store.getSelectedEntityId();
    if (!selectedEntityId || selectedEntityId === "player" || selectedEntityId === "ground") {
      appendEvent("Delete skipped: select a non-core entity.");
      return;
    }
    store.apply([{ op: "delete_entity", entityId: selectedEntityId }]);
    store.selectEntity(null);
    appendEvent(`Deleted '${selectedEntityId}'.`);
  };

  const placeZoneAt = (x: number, z: number): void => {
    const size = Math.max(1, readNumber(authoringZoneSizeInput.value, 10));
    const zoneId = `${authoringZoneKindInput.value}.placed.${placedZoneCounter++}`;
    store.apply([
      {
        op: "define_zone",
        zone: {
          id: zoneId,
          name: `${authoringZoneKindInput.value} zone ${placedZoneCounter - 1}`,
          kind: authoringZoneKindInput.value as "spawn" | "loot" | "safe" | "encounter" | "objective" | "trigger",
          shape:
            authoringZoneShapeInput.value === "sphere"
              ? {
                  type: "sphere",
                  radius: size,
                }
              : {
                  type: "box",
                  size: makeVec3(size, 2, size),
                },
          transform: {
            position: makeVec3(x, 1, z),
          },
          tags: ["authored"],
        },
      },
    ]);
    appendEvent(`Placed ${authoringZoneKindInput.value} zone at (${x.toFixed(1)}, ${z.toFixed(1)}).`);
  };

  const handleCanvasAuthoring = (event: PointerEvent): void => {
    if (authoringMode === "play") {
      return;
    }
    if (event.button !== 0) {
      return;
    }

    const groundPick = scene.screenPointToGround(event.clientX, event.clientY);
    if (!groundPick) {
      return;
    }
    if (authoringMode === "place") {
      placePrefabAt(authoringPrefabInput.value, groundPick.point.x, groundPick.point.z);
      return;
    }
    if (authoringMode === "move") {
      moveDragActive = true;
      scene.setOrbitEnabled(false);
      moveSelectedEntityTo(groundPick.point.x, groundPick.point.z);
      return;
    }
    if (authoringMode === "zone") {
      placeZoneAt(groundPick.point.x, groundPick.point.z);
    }
  };

  const handleCanvasAuthoringMove = (event: PointerEvent): void => {
    if (!moveDragActive || authoringMode !== "move") {
      return;
    }
    const groundPick = scene.screenPointToGround(event.clientX, event.clientY);
    if (!groundPick) {
      return;
    }
    moveSelectedEntityTo(groundPick.point.x, groundPick.point.z);
  };

  const stopMoveDrag = (): void => {
    if (!moveDragActive) {
      return;
    }
    moveDragActive = false;
    scene.setOrbitEnabled(true);
  };

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
    const moduleEvents = runtimeModule.getRecentEvents?.() ?? [];
    const selectedEntityId = store.getSelectedEntityId();
    const selectedRuntimeDebug = selectedEntityId
      ? runtimeModule.getEntityDebug?.(world, selectedEntityId) ?? []
      : [];
    const selectedVisualDebug = selectedEntityId
      ? scene.getEntityVisualDebug(selectedEntityId)
      : [];
    const selectedPhysicsDebug = selectedEntityId
      ? physics.getEntityDebug(selectedEntityId)
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
    const physicsStats = physics.getRuntimeStats();

    diagnosticsNode.textContent = JSON.stringify(diagnostics, null, 2);
    evaluationNode.textContent = formatEvaluation(evaluation.findings);
    sessionNode.textContent = runtimeModule.getStatusLines?.().join("\n") ?? "No session state.";
    sessionNode.textContent += `\nAuthoring mode: ${authoringMode}\nMove drag: ${moveDragActive}\nAuthoring prefab: ${authoringPrefabInput.value}\nAuthoring scale: ${authoringScaleInput.value}\nAuthoring yaw: ${authoringYawInput.value}\nZone kind: ${authoringZoneKindInput.value}\nZone shape: ${authoringZoneShapeInput.value}\nZone size: ${authoringZoneSizeInput.value}`;
    inspectorNode.textContent = formatInspector(
      selectedEntityId,
      selectedRuntimeDebug,
      selectedVisualDebug,
      selectedPhysicsDebug,
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
    eventLogNode.textContent = [...moduleEvents, ...runtimeEvents].slice(0, 40).join("\n") || "No runtime events yet.";
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
      `Swap: ${worldSwapState}`,
      `Draw calls: ${renderStats.drawCalls}`,
      `Triangles: ${renderStats.triangleCount}`,
      `Objects: ${renderStats.objectCount}`,
      `Physics colliders: ${physics.getColliderCount()}`,
      `Physics syncs: ${physicsStats.syncCount}`,
      `Retired worlds: ${physicsStats.retiredWorlds}`,
      `Eval warnings: ${evaluation.counts.warn}`,
      `Eval errors: ${evaluation.counts.error}`,
      `Module: ${runtimeModule.id}`,
    ].join(" | ");
    syncAuthoringPrefabs();
  };

  const rebuildWorld = (): void => {
    const world = store.getWorld();
    try {
      worldSwapState = "rebuilding";
      physics.syncWorld(world);
      scene.setWorld(world);
      worldSwapState = "idle";
      appendEvent(`World rebuilt: ${world.metadata.id}`);
      refreshSidebar();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      worldSwapState = "failed";
      appendEvent(`World rebuild failed: ${message}`);
      issuesNode.textContent = `World rebuild failed: ${message}`;
    }
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
    appendEvent("Requested generated flat outpost world.");
  };

  const enqueueStressTest = (): void => {
    stressActions.length = 0;
    for (let index = 0; index < 12; index += 1) {
      stressActions.push(() => {
        store.setWorld(
          index % 2 === 0
            ? makeFlatOutpostWorld({
                seed: defaultFlatWorldOptions.seed + index,
                worldHalfExtent: defaultFlatWorldOptions.worldHalfExtent,
                buildingCount: defaultFlatWorldOptions.buildingCount,
                zombieCount: defaultFlatWorldOptions.zombieCount,
                crateCount: defaultFlatWorldOptions.crateCount,
              })
            : makeThirdPersonSurvivalWorld(),
        );
      });
      stressActions.push(() => {
        store.selectEntity(index % 2 === 0 ? "player" : `zombie.${(index % 3) + 1}`);
      });
      stressActions.push(() => {
        store.apply([{ op: "reset_world" }]);
      });
    }
    appendEvent(`Queued stress test with ${stressActions.length} swap operations.`);
  };

  store.subscribe((event) => {
    if (event === "world") {
      pendingWorldRebuild = true;
      worldSwapState = "queued";
      appendEvent(`Store event: world -> ${store.peekWorld().metadata.id}`);
      return;
    }
    appendEvent(`Store event: selection -> ${store.getSelectedEntityId() ?? "none"}`);
    syncModelTuningInputs();
    syncSelectedTransformInputs();
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

  root.querySelector<HTMLButtonElement>("#mode-play")?.addEventListener("click", () => {
    authoringMode = "play";
    syncAuthoringMode();
    appendEvent("Authoring mode set to play.");
  });

  root.querySelector<HTMLButtonElement>("#mode-place")?.addEventListener("click", () => {
    authoringMode = "place";
    syncAuthoringMode();
    appendEvent(`Authoring mode set to place '${authoringPrefabInput.value}'.`);
  });

  root.querySelector<HTMLButtonElement>("#mode-move")?.addEventListener("click", () => {
    authoringMode = "move";
    syncAuthoringMode();
    appendEvent("Authoring mode set to move selected entity.");
  });

  root.querySelector<HTMLButtonElement>("#mode-zone")?.addEventListener("click", () => {
    authoringMode = "zone";
    syncAuthoringMode();
    appendEvent(`Authoring mode set to zone '${authoringZoneKindInput.value}'.`);
  });

  root.querySelector<HTMLButtonElement>("#apply-selected-transform")?.addEventListener("click", () => {
    applySelectedEntityTransform();
  });

  root.querySelector<HTMLButtonElement>("#delete-selected")?.addEventListener("click", () => {
    deleteSelectedEntity();
  });

  canvasRoot.addEventListener("pointerdown", handleCanvasAuthoring);
  canvasRoot.addEventListener("pointermove", handleCanvasAuthoringMove);
  canvasRoot.addEventListener("pointerup", stopMoveDrag);
  canvasRoot.addEventListener("pointerleave", stopMoveDrag);

  root.querySelector<HTMLButtonElement>("#load-generated")?.addEventListener("click", () => {
    buildGeneratedWorld();
  });

  root.querySelector<HTMLButtonElement>("#load-sample")?.addEventListener("click", () => {
    store.setWorld(makeThirdPersonSurvivalWorld());
    appendEvent("Requested authored survival slice.");
  });

  root.querySelector<HTMLButtonElement>("#reset-world")?.addEventListener("click", () => {
    store.apply([{ op: "reset_world" }]);
    appendEvent("Requested reset_world command.");
  });

  root.querySelector<HTMLButtonElement>("#stress-world")?.addEventListener("click", () => {
    enqueueStressTest();
  });

  root.querySelector<HTMLButtonElement>("#apply-model-tuning")?.addEventListener("click", () => {
    applySelectedModelTuning();
  });

  root.querySelector<HTMLButtonElement>("#refresh-model-tuning")?.addEventListener("click", () => {
    syncModelTuningInputs(true);
    appendEvent("Loaded model tuning from selected entity.");
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
  syncAuthoringPrefabs();
  syncAuthoringMode();
  syncModelTuningInputs(true);
  syncSelectedTransformInputs(true);

  const animate = (): void => {
    const now = performance.now();
    const dtSeconds = Math.min((now - lastFrameTime) / 1000, 0.05);
    lastFrameTime = now;
    if (stressCooldownFrames > 0) {
      stressCooldownFrames -= 1;
    } else if (stressActions.length > 0) {
      const next = stressActions.shift();
      next?.();
      stressCooldownFrames = 3;
    }
    if (pendingWorldRebuild) {
      pendingWorldRebuild = false;
      rebuildWorld();
    }
    if (worldSwapState === "failed") {
      scene.renderFrame(dtSeconds);
      refreshSidebar();
      requestAnimationFrame(animate);
      return;
    }
    try {
      runtimeModule.update(dtSeconds, {
        store,
        scene,
        physics,
        input,
      });
      physics.step();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      appendEvent(`Runtime step failed: ${message}`);
      issuesNode.textContent = `Runtime step failed: ${message}`;
    }
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

function readNumber(source: string, fallback: number): number {
  const value = Number.parseFloat(source);
  return Number.isFinite(value) ? value : fallback;
}

function inferPlacementHeight(prefabId: string): number {
  if (prefabId.includes("building")) {
    return 1.6;
  }
  if (prefabId.includes("crate")) {
    return 0.5;
  }
  if (prefabId.includes("zombie") || prefabId.includes("player")) {
    return 1.1;
  }
  return 0.5;
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
  physicsLines: string[],
): string {
  if (!entityId) {
    return "No entity selected.";
  }

  return [
    `Entity: ${entityId}`,
    ...runtimeLines,
    ...visualLines,
    ...physicsLines,
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
