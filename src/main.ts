import "./styles.css";

import { parseCommandScript } from "./core/commands";
import { evaluateWorld } from "./core/evaluation";
import { ModelRenderComponent, ZoneSpec, emptyWorld, makeVec3, resolveEntity } from "./core/schema";
import {
  defaultFlatWorldOptions,
  exampleCommandScript,
  makeFlatOutpostWorld,
  makeThirdPersonSurvivalWorld,
} from "./core/sampleWorld";
import { WorldStore } from "./core/worldStore";
import { createRuntimeModule, listRuntimeModules } from "./modules/registry";
import { InputController } from "./runtime/input";
import { PhysicsRuntime } from "./runtime/physicsRuntime";
import { SceneRuntime, SelectionTarget } from "./runtime/sceneRuntime";

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
          <label>
            <span>Game Mode</span>
            <select id="game-mode-template"></select>
          </label>
          <button id="load-empty" class="secondary">New Empty World</button>
          <button id="load-generated">Generate Flat Outpost</button>
          <button id="load-scale-test">Generate Scale Test</button>
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
            <label class="toggle">
              <input id="toggle-sectors" type="checkbox" />
              <span>Sector overlay</span>
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
          <div id="authoring-palette" class="prefab-palette"></div>
          <div class="controls">
            <button id="mode-play" class="secondary">Play</button>
            <button id="mode-place" class="secondary">Place</button>
            <button id="mode-move" class="secondary">Move</button>
            <button id="mode-resize" class="secondary">Resize</button>
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
            <h2>Sectors</h2>
            <span>Population/debug</span>
          </div>
          <pre id="sector-status"></pre>
        </section>
        <section class="section">
          <div class="section-head">
            <h2>Scene</h2>
            <span>Entities and zones</span>
          </div>
          <div class="generation-grid">
            <label>
              <span>Search</span>
              <input id="scene-search" placeholder="player, zombie, spawn..." />
            </label>
            <label>
              <span>Filter</span>
              <select id="scene-filter">
                <option value="all">all</option>
                <option value="entities">entities</option>
                <option value="zones">zones</option>
                <option value="actors">actors</option>
                <option value="buildings">buildings</option>
                <option value="loot">loot</option>
              </select>
            </label>
          </div>
          <div id="scene-inventory" class="scene-inventory"></div>
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
  const sectorStatusNode = root.querySelector<HTMLElement>("#sector-status");
  const sceneInventoryNode = root.querySelector<HTMLElement>("#scene-inventory");
  const authoringPaletteNode = root.querySelector<HTMLElement>("#authoring-palette");
  const sceneSearchInput = root.querySelector<HTMLInputElement>("#scene-search");
  const sceneFilterInput = root.querySelector<HTMLSelectElement>("#scene-filter");
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
  const gameModeTemplateInput = root.querySelector<HTMLSelectElement>("#game-mode-template");
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
  const toggleSectorsInput = root.querySelector<HTMLInputElement>("#toggle-sectors");

  if (
    !canvasRoot ||
    !shell ||
    !diagnosticsNode ||
    !evaluationNode ||
    !sessionNode ||
    !sectorStatusNode ||
    !sceneInventoryNode ||
    !authoringPaletteNode ||
    !sceneSearchInput ||
    !sceneFilterInput ||
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
    !gameModeTemplateInput ||
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
    !toggleAggroInput ||
    !toggleSectorsInput
  ) {
    throw new Error("UI bootstrap failed.");
  }

  const store = new WorldStore(makeFlatOutpostWorld());
  let authoringMode: "play" | "place" | "move" | "resize" | "zone" = "play";
  const scene = new SceneRuntime(canvasRoot, (selection: SelectionTarget) => {
    if (authoringMode !== "play") {
      return;
    }
    if (selection.type === "entity") {
      selectEntity(selection.id);
      return;
    }
    if (selection.type === "zone") {
      selectZone(selection.id);
      appendEvent(`Viewport selected zone '${selection.id}'.`);
      return;
    }
    selectEntity(null);
  });
  const physics = await PhysicsRuntime.create(store.getWorld().settings.gravity.y);
  const input = new InputController();
  let runtimeModule = createRuntimeModule(store.getWorld().gameMode);
  let lastFrameTime = performance.now();
  let sidebarCollapsed = false;
  let pendingWorldRebuild = false;
  let worldSwapState: "idle" | "queued" | "rebuilding" | "failed" = "idle";
  let stressCooldownFrames = 0;
  let modelTuningBoundEntityId: string | null = null;
  let selectedTransformBoundEntityId: string | null = null;
  let selectedZoneBoundZoneId: string | null = null;
  let placedEntityCounter = 1;
  let placedZoneCounter = 1;
  let moveDragActive = false;
  let resizeDragActive = false;
  let selectedZoneId: string | null = null;
  const stressActions: Array<() => void> = [];
  const runtimeEvents: string[] = [];
  const moduleDescriptors = listRuntimeModules();

  const appendEvent = (message: string): void => {
    const line = `${new Date().toLocaleTimeString()} | ${message}`;
    runtimeEvents.unshift(line);
    if (runtimeEvents.length > 40) {
      runtimeEvents.length = 40;
    }
  };

  const ensureRuntimeModule = (): void => {
    const nextMode = store.peekWorld().gameMode;
    if (runtimeModule.id === nextMode) {
      return;
    }
    runtimeModule = createRuntimeModule(nextMode);
    appendEvent(`Runtime module switched to '${runtimeModule.id}'.`);
  };

  const stampWorldMode = <T extends ReturnType<WorldStore["getWorld"]>>(world: T): T => {
    const gameMode = gameModeTemplateInput.value || world.gameMode;
    return {
      ...world,
      gameMode,
      metadata: {
        ...world.metadata,
        name:
          gameMode === world.gameMode
            ? world.metadata.name
            : `${world.metadata.name} [${gameMode}]`,
      },
    };
  };

  const getSelectedZone = (world = store.peekWorld()) =>
    selectedZoneId ? world.zones.find((zone) => zone.id === selectedZoneId) ?? null : null;

  const selectEntity = (entityId: string | null): void => {
    selectedZoneId = null;
    store.selectEntity(entityId);
  };

  const selectZone = (zoneId: string | null): void => {
    selectedZoneId = zoneId;
    if (store.getSelectedEntityId() !== null) {
      store.selectEntity(null);
      return;
    }
    syncSelectedZoneInputs();
    refreshSidebar();
  };

  const ensureValidSelection = (): void => {
    const world = store.peekWorld();
    if (selectedZoneId && !world.zones.some((zone) => zone.id === selectedZoneId)) {
      selectedZoneId = null;
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

  const syncSelectedZoneInputs = (force = false): void => {
    if (!force && selectedZoneId === selectedZoneBoundZoneId) {
      return;
    }
    selectedZoneBoundZoneId = selectedZoneId;
    const zone = getSelectedZone();
    if (!zone) {
      return;
    }

    authoringZoneKindInput.value = zone.kind;
    authoringZoneShapeInput.value = zone.shape.type;
    authoringZoneSizeInput.value = String(zone.shape.type === "sphere" ? zone.shape.radius : zone.shape.size.x);
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
    const selectedZone = getSelectedZone();
    if (!selectedEntityId && !selectedZone) {
      appendEvent("Transform apply skipped: no selected entity or zone.");
      return;
    }
    if (selectedZone) {
      const size = Math.max(1, readNumber(authoringZoneSizeInput.value, selectedZone.shape.type === "sphere" ? selectedZone.shape.radius : selectedZone.shape.size.x));
      store.apply([
        {
          op: "define_zone",
          zone: {
            ...selectedZone,
            kind: authoringZoneKindInput.value as "spawn" | "loot" | "safe" | "encounter" | "objective" | "trigger",
            shape:
              authoringZoneShapeInput.value === "sphere"
                ? {
                    type: "sphere",
                    radius: size,
                  }
                : {
                    type: "box",
                    size: makeVec3(size, selectedZone.shape.type === "box" ? selectedZone.shape.size.y : 2, size),
                  },
          },
        },
      ]);
      appendEvent(`Applied zone settings to '${selectedZone.id}'.`);
      return;
    }
    if (!selectedEntityId) {
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
    if (authoringMode !== "move" && authoringMode !== "resize") {
      stopAuthoringDrag();
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
    authoringPaletteNode.innerHTML = renderPrefabPalette(world, authoringPrefabInput.value);
  };

  const syncGameModeTemplate = (): void => {
    gameModeTemplateInput.innerHTML = moduleDescriptors
      .map(
        (descriptor) =>
          `<option value="${escapeHtml(descriptor.id)}">${escapeHtml(descriptor.label)}${descriptor.implemented ? "" : " (sandbox)"}</option>`,
      )
      .join("");
    const currentMode = store.peekWorld().gameMode;
    gameModeTemplateInput.value = moduleDescriptors.some((descriptor) => descriptor.id === currentMode)
      ? currentMode
      : "third_person_survival";
  };

  const placePrefabAt = (prefabId: string, x: number, z: number): void => {
    const prefab = store.peekWorld().prefabs[prefabId];
    if (!prefab) {
      appendEvent(`Cannot place unknown prefab '${prefabId}'.`);
      return;
    }
    const placementScale = readNumber(authoringScaleInput.value, 1);
    const placementHeight = (prefab.placement?.defaultHeight ?? inferPlacementHeight(prefabId)) * placementScale;

    const entityId = `${prefabId}.placed.${placedEntityCounter++}`;
    store.apply([
      {
        op: "spawn_entity",
        entity: {
          id: entityId,
          name: `${prefab.name} ${placedEntityCounter - 1}`,
          prefabId,
          transform: {
            position: makeVec3(x, placementHeight, z),
            rotation: makeVec3(0, (readNumber(authoringYawInput.value, 0) * Math.PI) / 180, 0),
            scale: makeVec3(
              placementScale,
              placementScale,
              placementScale,
            ),
          },
        },
      },
    ]);
    selectEntity(entityId);
    appendEvent(`Placed '${prefabId}' at (${x.toFixed(1)}, ${z.toFixed(1)}).`);
  };

  const moveSelectedEntityTo = (x: number, z: number): void => {
    const selectedEntityId = store.getSelectedEntityId();
    const selectedZone = getSelectedZone();
    if (!selectedEntityId && !selectedZone) {
      appendEvent("Move skipped: no selected entity or zone.");
      return;
    }
    if (selectedZone) {
      store.apply([
        {
          op: "define_zone",
          zone: {
            ...selectedZone,
            transform: {
              ...selectedZone.transform,
              position: {
                ...selectedZone.transform.position,
                x,
                z,
              },
            },
          },
        },
      ]);
      appendEvent(`Moved zone '${selectedZone.id}' to (${x.toFixed(1)}, ${z.toFixed(1)}).`);
      return;
    }
    if (!selectedEntityId) {
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

  const resizeSelectedToPoint = (x: number, z: number): void => {
    const selectedEntityId = store.getSelectedEntityId();
    const selectedZone = getSelectedZone();
    if (!selectedEntityId && !selectedZone) {
      appendEvent("Resize skipped: no selected entity or zone.");
      return;
    }

    if (selectedZone) {
      const dx = x - selectedZone.transform.position.x;
      const dz = z - selectedZone.transform.position.z;
      const distance = Math.max(1, Math.sqrt((dx * dx) + (dz * dz)));
      const nextZone: ZoneSpec = {
        ...selectedZone,
        shape: selectedZone.shape.type === "sphere"
          ? {
              type: "sphere",
              radius: distance,
            }
          : {
              type: "box",
              size: makeVec3(distance * 2, selectedZone.shape.size.y, distance * 2),
            },
      };
      store.apply([{ op: "define_zone", zone: nextZone }]);
      authoringZoneSizeInput.value = String(nextZone.shape.type === "sphere" ? nextZone.shape.radius : nextZone.shape.size.x);
      return;
    }

    if (!selectedEntityId) {
      return;
    }
    const entity = store.peekWorld().entities.find((item) => item.id === selectedEntityId);
    if (!entity) {
      appendEvent(`Resize skipped: missing entity '${selectedEntityId}'.`);
      return;
    }
    const dx = x - entity.transform.position.x;
    const dz = z - entity.transform.position.z;
    const uniformScale = Math.max(0.25, Math.sqrt((dx * dx) + (dz * dz)) / 2);
    store.updateEntityTransform(
      selectedEntityId,
      {
        scale: makeVec3(uniformScale, uniformScale, uniformScale),
      },
      true,
    );
    authoringScaleInput.value = uniformScale.toFixed(2);
  };

  const deleteSelectedEntity = (): void => {
    const selectedEntityId = store.getSelectedEntityId();
    const selectedZone = getSelectedZone();
    if (selectedZone) {
      store.apply([{ op: "delete_zone", zoneId: selectedZone.id }]);
      selectedZoneId = null;
      refreshSidebar();
      appendEvent(`Deleted zone '${selectedZone.id}'.`);
      return;
    }
    if (!selectedEntityId || selectedEntityId === "player" || selectedEntityId === "ground") {
      appendEvent("Delete skipped: select a non-core entity.");
      return;
    }
    store.apply([{ op: "delete_entity", entityId: selectedEntityId }]);
    selectEntity(null);
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
    selectZone(zoneId);
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
    if (authoringMode === "resize") {
      resizeDragActive = true;
      scene.setOrbitEnabled(false);
      resizeSelectedToPoint(groundPick.point.x, groundPick.point.z);
      return;
    }
    if (authoringMode === "zone") {
      placeZoneAt(groundPick.point.x, groundPick.point.z);
    }
  };

  const handleCanvasAuthoringMove = (event: PointerEvent): void => {
    const groundPick = scene.screenPointToGround(event.clientX, event.clientY);
    if (!groundPick) {
      return;
    }
    if (moveDragActive && authoringMode === "move") {
      moveSelectedEntityTo(groundPick.point.x, groundPick.point.z);
      return;
    }
    if (resizeDragActive && authoringMode === "resize") {
      resizeSelectedToPoint(groundPick.point.x, groundPick.point.z);
    }
  };

  const stopAuthoringDrag = (): void => {
    if (!moveDragActive && !resizeDragActive) {
      return;
    }
    moveDragActive = false;
    resizeDragActive = false;
    scene.setOrbitEnabled(true);
  };

  commandScript.value = exampleCommandScript;
  scene.setDebugOptions({
    showZones: toggleZonesInput.checked,
    showCombatRanges: toggleCombatInput.checked,
    showInteractionRanges: toggleInteractionInput.checked,
    showAggroRanges: toggleAggroInput.checked,
    showSectors: toggleSectorsInput.checked,
  });

  const refreshSidebar = (): void => {
    ensureRuntimeModule();
    const world = store.getWorld();
    const diagnostics = store.getDiagnostics();
    const evaluation = evaluateWorld(world);
    const currentModuleDescriptor =
      moduleDescriptors.find((descriptor) => descriptor.id === world.gameMode) ??
      moduleDescriptors.find((descriptor) => descriptor.id === "third_person_survival");
    const implementedModuleCount = moduleDescriptors.filter((descriptor) => descriptor.implemented).length;
    const runtimeFindings = runtimeModule.getDebugFindings?.() ?? [];
    const worldDebugLines = runtimeModule.getWorldDebug?.(world) ?? [];
    const sectorOverlay = runtimeModule.getSectorOverlay?.() ?? null;
    const moduleEvents = runtimeModule.getRecentEvents?.() ?? [];
    const selectedEntityId = store.getSelectedEntityId();
    const selectedZone = getSelectedZone(world);
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
    sectorStatusNode.textContent = worldDebugLines.join("\n") || "No sector debug available.";
    scene.setSectorOverlay(sectorOverlay);
    sessionNode.textContent += `\nModule label: ${currentModuleDescriptor?.label ?? runtimeModule.id}\nModule implemented: ${currentModuleDescriptor?.implemented ? "yes" : "sandbox fallback"}\nKnown modules: ${implementedModuleCount}/${moduleDescriptors.length}\nAuthoring mode: ${authoringMode}\nMove drag: ${moveDragActive}\nResize drag: ${resizeDragActive}\nAuthoring prefab: ${authoringPrefabInput.value}\nAuthoring scale: ${authoringScaleInput.value}\nAuthoring yaw: ${authoringYawInput.value}\nZone kind: ${authoringZoneKindInput.value}\nZone shape: ${authoringZoneShapeInput.value}\nZone size: ${authoringZoneSizeInput.value}\nScene filter: ${sceneFilterInput.value}\nScene search: ${sceneSearchInput.value}\nSelected zone: ${selectedZone?.id ?? "none"}`;
    inspectorNode.textContent = formatInspector(
      selectedEntityId,
      selectedZone,
      selectedRuntimeDebug,
      selectedVisualDebug,
      selectedPhysicsDebug,
    );
    sceneInventoryNode.innerHTML = renderSceneInventory(
      world,
      selectedEntityId,
      selectedZone?.id ?? null,
      sceneSearchInput.value,
      sceneFilterInput.value,
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
    selectionNode.textContent = selectedZone
      ? JSON.stringify(selectedZone, null, 2)
      : store.getSelectedEntityJson();
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
        `Sectors: ${diagnostics.occupiedSectorCount} occupied / ${diagnostics.simulatedSectorCount} tracked`,
        `Pooled actors: ${diagnostics.pooledActorCount}`,
        `Physics colliders: ${physics.getColliderCount()}`,
        `Physics syncs: ${physicsStats.syncCount}`,
        `Retired worlds: ${physicsStats.retiredWorlds}`,
      `Eval warnings: ${evaluation.counts.warn}`,
      `Eval errors: ${evaluation.counts.error}`,
      `Module: ${runtimeModule.id}`,
    ].join(" | ");
    syncGameModeTemplate();
    syncAuthoringPrefabs();
    syncSelectedZoneInputs();
  };

  const rebuildWorld = (): void => {
    const world = store.getWorld();
    try {
      ensureRuntimeModule();
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
      stampWorldMode(makeFlatOutpostWorld({
        seed: parseNumber(seedInput.value, defaultFlatWorldOptions.seed, 1),
        worldHalfExtent: parseNumber(sizeInput.value, defaultFlatWorldOptions.worldHalfExtent, 24),
        buildingCount: parseNumber(buildingInput.value, defaultFlatWorldOptions.buildingCount, 1),
        zombieCount: parseNumber(zombieInput.value, defaultFlatWorldOptions.zombieCount, 0),
        crateCount: parseNumber(crateInput.value, defaultFlatWorldOptions.crateCount, 0),
      })),
    );
    appendEvent("Requested generated flat outpost world.");
  };

  const buildScaleTestWorld = (): void => {
    const scaleSeed = parseNumber(seedInput.value, defaultFlatWorldOptions.seed, 1) + 1000;
    seedInput.value = String(scaleSeed);
    sizeInput.value = "180";
    buildingInput.value = "28";
    zombieInput.value = "240";
    crateInput.value = "18";
    store.setWorld(
      stampWorldMode(makeFlatOutpostWorld({
        seed: scaleSeed,
        worldHalfExtent: 180,
        buildingCount: 28,
        zombieCount: 240,
        crateCount: 18,
      })),
    );
    appendEvent("Requested scale-test outpost world.");
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
      ensureValidSelection();
      const selectedEntityId = store.getSelectedEntityId();
      if (selectedEntityId && !store.peekWorld().entities.some((entity) => entity.id === selectedEntityId)) {
        selectEntity(null);
      }
      pendingWorldRebuild = true;
      worldSwapState = "queued";
      appendEvent(`Store event: world -> ${store.peekWorld().metadata.id}`);
      return;
    }
    appendEvent(`Store event: selection -> ${store.getSelectedEntityId() ?? selectedZoneId ?? "none"}`);
    syncModelTuningInputs();
    syncSelectedTransformInputs();
    syncSelectedZoneInputs();
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

  root.querySelector<HTMLButtonElement>("#mode-resize")?.addEventListener("click", () => {
    authoringMode = "resize";
    syncAuthoringMode();
    appendEvent("Authoring mode set to resize selected entity or zone.");
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

  sceneInventoryNode.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const button = target.closest<HTMLElement>("[data-select-entity], [data-select-zone]");
    if (!button) {
      return;
    }
    const entityId = button.dataset.selectEntity;
    if (entityId !== undefined) {
      selectEntity(entityId || null);
      appendEvent(`Scene inventory selected entity '${entityId}'.`);
      return;
    }
    const zoneId = button.dataset.selectZone;
    if (zoneId !== undefined) {
      selectZone(zoneId || null);
      appendEvent(`Scene inventory selected zone '${zoneId}'.`);
    }
  });

  authoringPaletteNode.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const button = target.closest<HTMLElement>("[data-palette-prefab]");
    if (!button) {
      return;
    }
    const prefabId = button.dataset.palettePrefab;
    if (!prefabId) {
      return;
    }
    authoringPrefabInput.value = prefabId;
    syncAuthoringPrefabs();
    appendEvent(`Authoring palette selected prefab '${prefabId}'.`);
    refreshSidebar();
  });

  canvasRoot.addEventListener("pointerdown", handleCanvasAuthoring);
  canvasRoot.addEventListener("pointermove", handleCanvasAuthoringMove);
  canvasRoot.addEventListener("pointerup", stopAuthoringDrag);
  canvasRoot.addEventListener("pointerleave", stopAuthoringDrag);

  root.querySelector<HTMLButtonElement>("#load-generated")?.addEventListener("click", () => {
    buildGeneratedWorld();
  });

  root.querySelector<HTMLButtonElement>("#load-scale-test")?.addEventListener("click", () => {
    buildScaleTestWorld();
  });

  root.querySelector<HTMLButtonElement>("#load-empty")?.addEventListener("click", () => {
    store.setWorld(
      stampWorldMode({
        ...emptyWorld(),
        metadata: {
          id: "groundtruth.world.empty.authored",
          name: "Authored Empty World",
          description: "Blank semantic world for authoring from scratch.",
        },
      }),
    );
    appendEvent(`Requested empty world for '${gameModeTemplateInput.value}'.`);
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
      showSectors: toggleSectorsInput.checked,
    });
  };

  toggleZonesInput.addEventListener("change", syncDebugOptions);
  toggleCombatInput.addEventListener("change", syncDebugOptions);
  toggleInteractionInput.addEventListener("change", syncDebugOptions);
  toggleAggroInput.addEventListener("change", syncDebugOptions);
  toggleSectorsInput.addEventListener("change", syncDebugOptions);
  sceneSearchInput.addEventListener("input", refreshSidebar);
  sceneFilterInput.addEventListener("change", refreshSidebar);
  syncSidebarState();
  syncGameModeTemplate();
  syncAuthoringPrefabs();
  syncAuthoringMode();
  syncModelTuningInputs(true);
  syncSelectedTransformInputs(true);
  syncSelectedZoneInputs(true);

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
        ensureRuntimeModule();
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
  zone: ZoneSpec | null,
  runtimeLines: string[],
  visualLines: string[],
  physicsLines: string[],
): string {
  if (!entityId && !zone) {
    return "No entity or zone selected.";
  }

  if (zone) {
    const shapeSummary = zone.shape.type === "sphere"
      ? `sphere radius=${zone.shape.radius}`
      : `box size=${zone.shape.size.x}x${zone.shape.size.y}x${zone.shape.size.z}`;
    return [
      `Zone: ${zone.id}`,
      `Kind: ${zone.kind}`,
      `Shape: ${shapeSummary}`,
      `Position: ${zone.transform.position.x.toFixed(2)}, ${zone.transform.position.y.toFixed(2)}, ${zone.transform.position.z.toFixed(2)}`,
      `Tags: ${(zone.tags ?? []).join(", ") || "none"}`,
    ].join("\n");
  }

  return [
    `Entity: ${entityId}`,
    ...runtimeLines,
    ...visualLines,
    ...physicsLines,
  ].join("\n");
}

function renderSceneInventory(
  world: ReturnType<WorldStore["getWorld"]>,
  selectedEntityId: string | null,
  selectedZoneId: string | null,
  query: string,
  filter: string,
): string {
  const normalizedQuery = query.trim().toLowerCase();
  const matchesQuery = (value: string) => normalizedQuery.length === 0 || value.toLowerCase().includes(normalizedQuery);
  const entityMatchesFilter = (entity: ReturnType<WorldStore["getWorld"]>["entities"][number]) => {
    if (filter === "all" || filter === "entities") {
      return true;
    }
    if (filter === "actors") {
      return entity.id === "player" || entity.tags?.includes("enemy") || entity.prefabId?.includes("zombie") || entity.prefabId?.includes("player");
    }
    if (filter === "buildings") {
      const category = entity.prefabId ? world.prefabs[entity.prefabId]?.category : undefined;
      return category === "building" || entity.prefabId?.includes("building") || entity.name.toLowerCase().includes("building");
    }
    if (filter === "loot") {
      const category = entity.prefabId ? world.prefabs[entity.prefabId]?.category : undefined;
      return category === "loot" || entity.prefabId?.includes("crate") || entity.name.toLowerCase().includes("crate");
    }
    return false;
  };
  const zoneMatchesFilter = (zone: ZoneSpec) => filter === "all" || filter === "zones" || filter === zone.kind;

  const entityItems = world.entities
    .slice()
    .filter((entity) =>
      entityMatchesFilter(entity) &&
      matchesQuery(`${entity.id} ${entity.name} ${entity.prefabId ?? ""} ${(entity.tags ?? []).join(" ")}`))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entity) => {
      const isSelected = entity.id === selectedEntityId;
      const label = entity.prefabId ? `${entity.name} (${entity.prefabId})` : entity.name;
      return `
        <button
          type="button"
          class="inventory-item${isSelected ? " selected" : ""}"
          data-select-entity="${escapeHtml(entity.id)}"
        >
          <span class="inventory-label">${escapeHtml(label)}</span>
          <span class="inventory-meta">${escapeHtml(entity.id)}</span>
        </button>
      `;
    })
    .join("");

  const zoneItems = world.zones
    .slice()
    .filter((zone) => zoneMatchesFilter(zone) && matchesQuery(`${zone.id} ${zone.name} ${zone.kind} ${(zone.tags ?? []).join(" ")}`))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((zone) => {
      const isSelected = zone.id === selectedZoneId;
      const shapeLabel = zone.shape.type === "sphere"
        ? `r=${zone.shape.radius}`
        : `${zone.shape.size.x}x${zone.shape.size.z}`;
      return `
        <button
          type="button"
          class="inventory-item${isSelected ? " selected" : ""}"
          data-select-zone="${escapeHtml(zone.id)}"
        >
          <span class="inventory-label">${escapeHtml(zone.name)}</span>
          <span class="inventory-meta">${escapeHtml(`${zone.kind} | ${shapeLabel}`)}</span>
        </button>
      `;
    })
    .join("");

  return `
    <details class="inventory-group" open>
      <summary class="inventory-group-title">Entities (${world.entities.length})</summary>
      <div class="inventory-group-body">
        ${entityItems || '<div class="inventory-empty">No entities.</div>'}
      </div>
    </details>
    <details class="inventory-group" open>
      <summary class="inventory-group-title">Zones (${world.zones.length})</summary>
      <div class="inventory-group-body">
        ${zoneItems || '<div class="inventory-empty">No zones.</div>'}
      </div>
    </details>
  `;
}

function renderPrefabPalette(
  world: ReturnType<WorldStore["getWorld"]>,
  selectedPrefabId: string,
): string {
  const groups = new Map<string, string[]>();
  for (const prefabId of Object.keys(world.prefabs).sort()) {
    const group = categorizePrefab(world.prefabs[prefabId]?.category, prefabId);
    const bucket = groups.get(group) ?? [];
    bucket.push(prefabId);
    groups.set(group, bucket);
  }

  return Array.from(groups.entries())
    .map(([group, prefabIds]) => `
      <details class="palette-group" open>
        <summary class="palette-group-title">${escapeHtml(group)}</summary>
        <div class="palette-chip-grid">
          ${prefabIds
            .map((prefabId) => `
              <button
                type="button"
                class="palette-chip${prefabId === selectedPrefabId ? " selected" : ""}"
                data-palette-prefab="${escapeHtml(prefabId)}"
              >
                ${escapeHtml(world.prefabs[prefabId]?.name ?? prefabId)}
              </button>
            `)
            .join("")}
        </div>
      </details>
    `)
    .join("");
}

function categorizePrefab(category: string | undefined, prefabId: string): string {
  switch (category) {
    case "actor":
      return "Actors";
    case "building":
      return "Buildings";
    case "loot":
      return "Loot";
    case "terrain":
    case "road":
      return "Environment";
    case "prop":
      return "Props";
    default:
      break;
  }
  const normalized = prefabId.toLowerCase();
  if (normalized.includes("player") || normalized.includes("zombie") || normalized.includes("npc")) {
    return "Actors";
  }
  if (normalized.includes("building") || normalized.includes("house") || normalized.includes("shack") || normalized.includes("warehouse")) {
    return "Buildings";
  }
  if (normalized.includes("crate") || normalized.includes("loot") || normalized.includes("item")) {
    return "Loot";
  }
  return "Other";
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
