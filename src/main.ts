import "./styles.css";

import { AppCommand, isWorldCommand, parseCommandScript } from "./core/commands";
import {
  createPlayableBuildDocument,
  createProjectExportEnvelope,
  isPlayableBuildDocument,
  resolveImportedProject,
} from "./core/exportFormat";
import { buildIterationSuggestions, IterationSuggestion } from "./core/iteration";
import {
  EmptyContainerMode,
  LootTransferMode,
  RespawnMode,
  ThirdPersonFacingMode,
  ThirdPersonIdleFacingMode,
  ThirdPersonActionGameplayPolicyPatch,
} from "./core/policies";
import { getProjectTemplate, listProjectTemplates } from "./core/projectTemplates";
import { getWorldRecipe, listWorldRecipes } from "./core/worldRecipes";
import { HelpAudience, HelpSection, helpContentByAudience } from "./docs/helpContent";
import { evaluatePlaytest, evaluateWorld } from "./core/evaluation";
import {
  GameMode,
  ModelRenderComponent,
  ProjectDocument,
  WorldDocument,
  ZoneSpec,
  emptyWorld,
  makeVec3,
  projectFromWorld,
  resolveEntity,
} from "./core/schema";
import {
  defaultFlatWorldOptions,
  exampleCommandScript,
  makeFlatOutpostWorld,
  makeTownGridWorld,
  makeThirdPersonSurvivalWorld,
} from "./core/sampleWorld";
import { applyWorldStamp, listWorldStamps } from "./core/worldStamps";
import {
  getActionModulePreset,
  policyCameraRig,
  resolvePresetGameplayPolicy,
} from "./modules/actionModulePresets";
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
        <section class="overview-card">
          <div class="overview-head">
            <h2 class="overview-title">Overview</h2>
            <span class="overview-subtitle">Current workspace</span>
          </div>
          <div id="overview" class="overview-copy"></div>
        </section>
        <div class="panel-tabs" role="tablist" aria-label="Sidebar workspace">
          <button class="tab-button active" type="button" data-pane-target="build" aria-pressed="true">Build</button>
          <button class="tab-button" type="button" data-pane-target="inspect" aria-pressed="false">Inspect</button>
          <button class="tab-button" type="button" data-pane-target="runtime" aria-pressed="false">Runtime</button>
        </div>
        <div class="panel-stack">
        <details class="section tool-section" data-pane="build" open>
          <summary class="section-head">
            <h2>Project</h2>
            <span>Template-driven start</span>
          </summary>
          <div class="section-body">
            <div class="generation-grid">
              <label class="wide">
                <span>Project Name</span>
                <input id="project-name" value="Groundtruth Project" />
              </label>
              <label class="wide">
                <span>Template</span>
                <select id="project-template"></select>
              </label>
            </div>
            <div id="project-template-summary" class="inline-summary"></div>
            <div class="generation-grid">
              <label class="wide">
                <span>Project Worlds</span>
                <select id="project-world"></select>
              </label>
            </div>
            <div id="project-world-summary" class="inline-summary"></div>
            <div class="controls">
              <button id="start-project">Start Project From Template</button>
              <button id="save-project-world" class="secondary">Save Current World Copy</button>
              <button id="open-project-world" class="secondary">Open Project World</button>
              <button id="export-project" class="secondary">Export Project</button>
              <button id="export-playable" class="secondary">Build Playable Export</button>
              <button id="import-project" class="secondary">Import Project</button>
              <button id="import-playable" class="secondary">Import Playable Export</button>
            </div>
          </div>
        </details>
        <details class="section tool-section" data-pane="build" open>
          <summary class="section-head">
            <h2>World</h2>
            <span>Mode, generation, snapshots</span>
          </summary>
          <div class="section-body">
            <div class="generation-grid single-span">
              <label class="wide">
                <span>Game Mode</span>
                <select id="game-mode-template"></select>
              </label>
            </div>
            <div class="controls quick-actions">
              <button id="load-generated">Generate Flat Outpost</button>
              <button id="load-town">Generate Town Grid</button>
              <button id="load-scale-test">Generate Scale Test</button>
              <button id="load-empty" class="secondary">New Empty World</button>
              <button id="load-sample">Load Survival Slice</button>
              <button id="reset-world" class="secondary">Reset World</button>
              <button id="stress-world" class="secondary">Stress Test Swaps</button>
              <button id="export-world" class="secondary">Export Snapshot</button>
              <button id="import-world" class="secondary">Import Snapshot</button>
              <button id="capture-shot" class="secondary">Capture Screenshot</button>
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
          </div>
        </details>
        <details class="section tool-section" data-pane="runtime" open>
          <summary class="section-head">
            <h2>Debug View</h2>
            <span>Human overlays</span>
          </summary>
          <div class="section-body">
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
          </div>
        </details>
        <details class="section tool-section" data-pane="build" open>
          <summary class="section-head">
            <h2>Authoring</h2>
            <span>In-world editing</span>
          </summary>
          <div class="section-body">
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
          </div>
        </details>
        <details class="section tool-section" data-pane="build" open>
          <summary class="section-head">
            <h2>Stamps</h2>
            <span>Reusable world chunks</span>
          </summary>
          <div class="section-body">
            <div class="generation-grid">
              <label class="wide">
                <span>Stamp</span>
                <select id="world-stamp"></select>
              </label>
            </div>
            <div id="world-stamp-summary" class="inline-summary"></div>
            <div class="controls compact-controls">
              <button id="apply-world-stamp" class="secondary">Apply Stamp To Current World</button>
            </div>
          </div>
        </details>
        <details class="section tool-section" data-pane="build">
          <summary class="section-head">
            <h2>Recipes</h2>
            <span>Coherent game slices</span>
          </summary>
          <div class="section-body">
            <div class="generation-grid">
              <label class="wide">
                <span>Recipe</span>
                <select id="world-recipe"></select>
              </label>
            </div>
            <div id="world-recipe-summary" class="inline-summary"></div>
            <div class="controls compact-controls">
              <button id="start-world-recipe">Start Project From Recipe</button>
            </div>
          </div>
        </details>
        <details class="section tool-section" data-pane="build">
          <summary class="section-head">
            <h2>Features</h2>
            <span>Project capability toggles</span>
          </summary>
          <div class="section-body">
            <div id="feature-toggles" class="feature-toggle-list"></div>
          </div>
        </details>
        <details class="section tool-section" data-pane="build">
          <summary class="section-head">
            <h2>Gameplay Policy</h2>
            <span>Third-person action rules</span>
          </summary>
          <div class="section-body">
            <div class="generation-grid">
              <label>
                <span>Facing</span>
                <select id="policy-facing-mode">
                  <option value="move_vector">move_vector</option>
                  <option value="cursor_aim">cursor_aim</option>
                  <option value="camera_forward">camera_forward</option>
                </select>
              </label>
              <label>
                <span>Idle facing</span>
                <select id="policy-idle-facing-mode">
                  <option value="keep_last">keep_last</option>
                  <option value="cursor_aim">cursor_aim</option>
                  <option value="camera_forward">camera_forward</option>
                </select>
              </label>
              <label>
                <span>Camera distance</span>
                <input id="policy-camera-distance" type="number" step="0.1" value="10.5" />
              </label>
              <label>
                <span>Camera pitch</span>
                <input id="policy-camera-pitch" type="number" step="0.01" value="0.78" />
              </label>
              <label>
                <span>Attack targeting</span>
                <select id="policy-targeting-mode">
                  <option value="nearest_hostile">nearest_hostile</option>
                  <option value="none">none</option>
                </select>
              </label>
              <label class="toggle inline-toggle">
                <input id="policy-attack-lock" type="checkbox" checked />
                <span>Lock movement on attack</span>
              </label>
              <label>
                <span>Loot transfer</span>
                <select id="policy-loot-transfer">
                  <option value="take_one">take_one</option>
                  <option value="take_all">take_all</option>
                </select>
              </label>
              <label>
                <span>Empty container</span>
                <select id="policy-empty-container">
                  <option value="persist">persist</option>
                  <option value="despawn">despawn</option>
                </select>
              </label>
              <label>
                <span>Respawn mode</span>
                <select id="policy-respawn-mode">
                  <option value="manual">manual</option>
                  <option value="disabled">disabled</option>
                </select>
              </label>
              <label>
                <span>Respawn key</span>
                <input id="policy-respawn-key" value="KeyR" />
              </label>
              <label>
                <span>Aggro scale</span>
                <input id="policy-aggro-scale" type="number" step="0.05" value="1" />
              </label>
              <label>
                <span>Leash scale</span>
                <input id="policy-leash-scale" type="number" step="0.05" value="1.1" />
              </label>
            </div>
            <div id="gameplay-policy-summary" class="inline-summary"></div>
            <div class="controls compact-controls">
              <button id="apply-gameplay-policy" class="secondary">Apply Policy</button>
              <button id="reset-gameplay-policy" class="secondary">Reset To Preset</button>
            </div>
          </div>
        </details>
        <details class="section tool-section" data-pane="build">
          <summary class="section-head">
            <h2>Command Script</h2>
            <span>Semantic JSON</span>
          </summary>
          <div class="section-body">
            <div class="controls compact-controls">
              <button id="apply-commands">Apply Commands</button>
            </div>
            <textarea id="command-script" spellcheck="false"></textarea>
          </div>
        </details>
        <details class="section tool-section" data-pane="inspect">
          <summary class="section-head">
            <h2>Inspector</h2>
            <span>Selected entity or zone</span>
          </summary>
          <div class="section-body">
            <pre id="inspector"></pre>
          </div>
        </details>
        <details class="section tool-section" data-pane="inspect" open>
          <summary class="section-head">
            <h2>Scene</h2>
            <span>Entities and zones</span>
          </summary>
          <div class="section-body">
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
          </div>
        </details>
        <details class="section tool-section" data-pane="inspect" open>
          <summary class="section-head">
            <h2>Evaluation</h2>
            <span>World checks</span>
          </summary>
          <div class="section-body">
            <pre id="evaluation"></pre>
          </div>
        </details>
        <details class="section tool-section" data-pane="inspect">
          <summary class="section-head">
            <h2>Diagnostics</h2>
            <span>Live state</span>
          </summary>
          <div class="section-body">
            <pre id="diagnostics"></pre>
          </div>
        </details>
        <details class="section tool-section" data-pane="runtime">
          <summary class="section-head">
            <h2>Session</h2>
            <span>Advanced runtime details</span>
          </summary>
          <div class="section-body">
            <pre id="session"></pre>
          </div>
        </details>
        <details class="section tool-section" data-pane="runtime" open>
          <summary class="section-head">
            <h2>Sectors</h2>
            <span>Population/debug</span>
          </summary>
          <div class="section-body">
            <pre id="sector-status"></pre>
          </div>
        </details>
        <details class="section tool-section" data-pane="inspect">
          <summary class="section-head">
            <h2>Assets</h2>
            <span>Validation/runtime</span>
          </summary>
          <div class="section-body">
            <pre id="asset-status"></pre>
          </div>
        </details>
        <details class="section tool-section" data-pane="inspect">
          <summary class="section-head">
            <h2>Model Tuning</h2>
            <span>Selected model</span>
          </summary>
          <div class="section-body">
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
          </div>
        </details>
        <details class="section tool-section" data-pane="inspect">
          <summary class="section-head">
            <h2>Selection</h2>
            <span>Entity JSON</span>
          </summary>
          <div class="section-body">
            <pre id="selection"></pre>
          </div>
        </details>
        <details class="section tool-section" data-pane="runtime" open>
          <summary class="section-head">
            <h2>Issues</h2>
            <span>Command/runtime</span>
          </summary>
          <div class="section-body">
            <pre id="issues"></pre>
          </div>
        </details>
        <details class="section tool-section" data-pane="runtime">
          <summary class="section-head">
            <h2>Iteration</h2>
            <span>Suggested next actions</span>
          </summary>
          <div class="section-body">
            <div id="iteration-suggestions" class="iteration-suggestions"></div>
          </div>
        </details>
        <details class="section tool-section" data-pane="runtime">
          <summary class="section-head">
            <h2>Playtest</h2>
            <span>Session reports</span>
          </summary>
          <div class="section-body">
            <div class="generation-grid">
              <label class="wide">
                <span>Session Label</span>
                <input id="playtest-label" value="Playtest Session" />
              </label>
              <label class="wide">
                <span>Note</span>
                <input id="playtest-note" placeholder="Observed issue, readability problem, combat note..." />
              </label>
            </div>
            <div class="controls">
              <button id="start-playtest">Start Session</button>
              <button id="stop-playtest" class="secondary">Stop Session</button>
              <button id="add-playtest-note" class="secondary">Add Note</button>
              <button id="export-playtest-report" class="secondary">Export Report</button>
            </div>
            <pre id="playtest-status"></pre>
          </div>
        </details>
        <details class="section tool-section" data-pane="runtime">
          <summary class="section-head">
            <h2>Events</h2>
            <span>Recent runtime log</span>
          </summary>
          <div class="section-body">
            <pre id="event-log"></pre>
          </div>
        </details>
        </div>
      </aside>
      <main class="viewport">
        <div class="viewport-head">
          <div>
            <span class="eyebrow">Direction</span>
            <strong>Semantic world runtime first, genre modules second.</strong>
          </div>
          <div class="viewport-actions">
            <button id="open-docs" class="secondary chrome-toggle" type="button">Docs</button>
            <button id="toggle-sidebar" class="secondary chrome-toggle" type="button" aria-expanded="true">Hide Tools</button>
            <div id="runtime-stats" class="runtime-stats"></div>
          </div>
        </div>
        <div id="canvas-root" class="canvas-root" tabindex="0" aria-label="Groundtruth viewport">
          <div id="playtest-hud" class="playtest-hud"></div>
        </div>
        <img id="screenshot-preview" class="screenshot-preview" alt="Latest screenshot" />
      </main>
    </div>
    <input id="snapshot-file" type="file" accept="application/json" hidden />
    <input id="project-file" type="file" accept="application/json" hidden />
    <input id="playable-file" type="file" accept="application/json" hidden />
    <div id="docs-modal" class="docs-modal hidden" aria-hidden="true">
      <div class="docs-shell" role="dialog" aria-modal="true" aria-labelledby="docs-title">
        <div class="docs-head">
          <div>
            <span class="eyebrow">Guide</span>
            <h2 id="docs-title">How To Use Groundtruth</h2>
          </div>
          <div class="docs-head-actions">
            <div class="docs-audience-tabs" role="tablist" aria-label="Docs audience">
              <button id="docs-human" class="docs-audience-button active" type="button" data-docs-audience="human" aria-pressed="true">Human</button>
              <button id="docs-ai" class="docs-audience-button" type="button" data-docs-audience="ai" aria-pressed="false">AI</button>
            </div>
          <button id="close-docs" class="secondary" type="button">Close</button>
          </div>
        </div>
        <div class="docs-body">
          <nav id="docs-nav" class="docs-nav"></nav>
          <article id="docs-content" class="docs-content"></article>
        </div>
      </div>
    </div>
  `;

  const canvasRoot = root.querySelector<HTMLElement>("#canvas-root");
  const shell = root.querySelector<HTMLElement>(".shell");
  const overviewNode = root.querySelector<HTMLElement>("#overview");
  const diagnosticsNode = root.querySelector<HTMLElement>("#diagnostics");
  const evaluationNode = root.querySelector<HTMLElement>("#evaluation");
  const sessionNode = root.querySelector<HTMLElement>("#session");
  const sectorStatusNode = root.querySelector<HTMLElement>("#sector-status");
  const sceneInventoryNode = root.querySelector<HTMLElement>("#scene-inventory");
  const authoringPaletteNode = root.querySelector<HTMLElement>("#authoring-palette");
  const featureTogglesNode = root.querySelector<HTMLElement>("#feature-toggles");
  const gameplayPolicySummaryNode = root.querySelector<HTMLElement>("#gameplay-policy-summary");
  const sceneSearchInput = root.querySelector<HTMLInputElement>("#scene-search");
  const sceneFilterInput = root.querySelector<HTMLSelectElement>("#scene-filter");
  const inspectorNode = root.querySelector<HTMLElement>("#inspector");
  const assetStatusNode = root.querySelector<HTMLElement>("#asset-status");
  const modelScaleInput = root.querySelector<HTMLInputElement>("#model-scale");
  const modelYawInput = root.querySelector<HTMLInputElement>("#model-yaw");
  const modelOffsetYInput = root.querySelector<HTMLInputElement>("#model-offset-y");
  const selectionNode = root.querySelector<HTMLElement>("#selection");
  const issuesNode = root.querySelector<HTMLElement>("#issues");
  const iterationSuggestionsNode = root.querySelector<HTMLElement>("#iteration-suggestions");
  const eventLogNode = root.querySelector<HTMLElement>("#event-log");
  const playtestStatusNode = root.querySelector<HTMLElement>("#playtest-status");
  const runtimeStatsNode = root.querySelector<HTMLElement>("#runtime-stats");
  const toggleSidebarButton = root.querySelector<HTMLButtonElement>("#toggle-sidebar");
  const openDocsButton = root.querySelector<HTMLButtonElement>("#open-docs");
  const docsModal = root.querySelector<HTMLElement>("#docs-modal");
  const docsTitleNode = root.querySelector<HTMLElement>("#docs-title");
  const closeDocsButton = root.querySelector<HTMLButtonElement>("#close-docs");
  const docsNavNode = root.querySelector<HTMLElement>("#docs-nav");
  const docsContentNode = root.querySelector<HTMLElement>("#docs-content");
  const docsAudienceButtons = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-docs-audience]"));
  const paneButtons = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-pane-target]"));
  const toolSections = Array.from(root.querySelectorAll<HTMLElement>(".tool-section"));
  const commandScript = root.querySelector<HTMLTextAreaElement>("#command-script");
  const screenshotPreview = root.querySelector<HTMLImageElement>("#screenshot-preview");
  const playtestHud = root.querySelector<HTMLElement>("#playtest-hud");
  const snapshotFileInput = root.querySelector<HTMLInputElement>("#snapshot-file");
  const projectFileInput = root.querySelector<HTMLInputElement>("#project-file");
  const playableFileInput = root.querySelector<HTMLInputElement>("#playable-file");
  const projectNameInput = root.querySelector<HTMLInputElement>("#project-name");
  const playtestLabelInput = root.querySelector<HTMLInputElement>("#playtest-label");
  const playtestNoteInput = root.querySelector<HTMLInputElement>("#playtest-note");
  const projectTemplateInput = root.querySelector<HTMLSelectElement>("#project-template");
  const projectTemplateSummaryNode = root.querySelector<HTMLElement>("#project-template-summary");
  const projectWorldInput = root.querySelector<HTMLSelectElement>("#project-world");
  const projectWorldSummaryNode = root.querySelector<HTMLElement>("#project-world-summary");
  const worldRecipeInput = root.querySelector<HTMLSelectElement>("#world-recipe");
  const worldRecipeSummaryNode = root.querySelector<HTMLElement>("#world-recipe-summary");
  const worldStampInput = root.querySelector<HTMLSelectElement>("#world-stamp");
  const worldStampSummaryNode = root.querySelector<HTMLElement>("#world-stamp-summary");
  const policyFacingModeInput = root.querySelector<HTMLSelectElement>("#policy-facing-mode");
  const policyIdleFacingModeInput = root.querySelector<HTMLSelectElement>("#policy-idle-facing-mode");
  const policyCameraDistanceInput = root.querySelector<HTMLInputElement>("#policy-camera-distance");
  const policyCameraPitchInput = root.querySelector<HTMLInputElement>("#policy-camera-pitch");
  const policyTargetingModeInput = root.querySelector<HTMLSelectElement>("#policy-targeting-mode");
  const policyAttackLockInput = root.querySelector<HTMLInputElement>("#policy-attack-lock");
  const policyLootTransferInput = root.querySelector<HTMLSelectElement>("#policy-loot-transfer");
  const policyEmptyContainerInput = root.querySelector<HTMLSelectElement>("#policy-empty-container");
  const policyRespawnModeInput = root.querySelector<HTMLSelectElement>("#policy-respawn-mode");
  const policyRespawnKeyInput = root.querySelector<HTMLInputElement>("#policy-respawn-key");
  const policyAggroScaleInput = root.querySelector<HTMLInputElement>("#policy-aggro-scale");
  const policyLeashScaleInput = root.querySelector<HTMLInputElement>("#policy-leash-scale");
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
    !overviewNode ||
    !diagnosticsNode ||
    !evaluationNode ||
    !sessionNode ||
    !sectorStatusNode ||
    !sceneInventoryNode ||
    !authoringPaletteNode ||
    !featureTogglesNode ||
    !gameplayPolicySummaryNode ||
    !sceneSearchInput ||
    !sceneFilterInput ||
    !inspectorNode ||
    !assetStatusNode ||
    !modelScaleInput ||
    !modelYawInput ||
    !modelOffsetYInput ||
    !selectionNode ||
    !issuesNode ||
    !iterationSuggestionsNode ||
    !eventLogNode ||
    !playtestStatusNode ||
    !runtimeStatsNode ||
    !toggleSidebarButton ||
    !openDocsButton ||
    !docsModal ||
    !docsTitleNode ||
    !closeDocsButton ||
    !docsNavNode ||
    !docsContentNode ||
    docsAudienceButtons.length === 0 ||
    paneButtons.length === 0 ||
    toolSections.length === 0 ||
    !commandScript ||
    !screenshotPreview ||
    !playtestHud ||
    !snapshotFileInput ||
    !projectFileInput ||
    !playableFileInput ||
    !projectNameInput ||
    !playtestLabelInput ||
    !playtestNoteInput ||
    !projectTemplateInput ||
    !projectTemplateSummaryNode ||
    !projectWorldInput ||
    !projectWorldSummaryNode ||
    !worldRecipeInput ||
    !worldRecipeSummaryNode ||
    !worldStampInput ||
    !worldStampSummaryNode ||
    !policyFacingModeInput ||
    !policyIdleFacingModeInput ||
    !policyCameraDistanceInput ||
    !policyCameraPitchInput ||
    !policyTargetingModeInput ||
    !policyAttackLockInput ||
    !policyLootTransferInput ||
    !policyEmptyContainerInput ||
    !policyRespawnModeInput ||
    !policyRespawnKeyInput ||
    !policyAggroScaleInput ||
    !policyLeashScaleInput ||
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

  const bootConfig = readBootConfig();
  const bootProject = await loadBootProject(bootConfig);
  const store = new WorldStore(bootProject ?? makeFlatOutpostWorld());
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
  let sidebarCollapsed = bootConfig.mode === "player";
  let activeSidebarPane: "build" | "inspect" | "runtime" = "build";
  let activeHelpAudience: HelpAudience = "human";
  let activeHelpSectionId = helpContentByAudience.human[0]?.id ?? "";
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
  let requestedGameMode: GameMode = store.peekWorld().gameMode;
  const stressActions: Array<() => void> = [];
  const runtimeEvents: string[] = [];
  const moduleDescriptors = listRuntimeModules();
  const projectTemplates = listProjectTemplates();
  const worldRecipes = listWorldRecipes();
  const worldStamps = listWorldStamps();

  if (bootConfig.mode === "player") {
    shell.classList.add("player-shell");
    canvasRoot.focus();
  }
  let playtestSession: PlaytestSession | null = null;
  let latestIterationSuggestions: IterationSuggestion[] = [];

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
    const gameMode = requestedGameMode || world.gameMode;
    return applyGameModeTuning({
      ...world,
      gameMode,
      metadata: {
        ...world.metadata,
        name:
          gameMode === world.gameMode
            ? world.metadata.name
            : `${world.metadata.name} [${gameMode}]`,
      },
    }) as T;
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
    if (authoringMode === "play") {
      requestAnimationFrame(() => canvasRoot.focus());
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
    const currentValue = requestedGameMode;
    gameModeTemplateInput.innerHTML = moduleDescriptors
      .map(
        (descriptor) =>
          `<option value="${escapeHtml(descriptor.id)}">${escapeHtml(descriptor.label)}${descriptor.implemented ? "" : " (sandbox)"}</option>`,
      )
      .join("");
    gameModeTemplateInput.value = moduleDescriptors.some((descriptor) => descriptor.id === currentValue)
      ? currentValue
      : "third_person_survival";
  };

  const syncProjectTemplates = (): void => {
    projectTemplateInput.innerHTML = projectTemplates
      .map((template) => `<option value="${template.id}">${escapeHtml(template.label)}</option>`)
      .join("");
    if (!projectTemplates.some((template) => template.id === projectTemplateInput.value)) {
      projectTemplateInput.value = projectTemplates[0]?.id ?? "";
    }
    const template = getProjectTemplate(projectTemplateInput.value);
    projectTemplateSummaryNode.textContent = template
      ? `${template.summary} Starts in ${template.gameMode.replaceAll("_", " ")} mode.`
      : "No project template selected.";
  };

  const syncProjectWorlds = (): void => {
    const project = store.peekProject();
    const worlds = Object.values(project.worlds).sort((left, right) => left.metadata.name.localeCompare(right.metadata.name));
    projectWorldInput.innerHTML = worlds
      .map((world) => `<option value="${escapeHtml(world.metadata.id)}">${escapeHtml(world.metadata.name)}</option>`)
      .join("");
    if (!worlds.some((world) => world.metadata.id === projectWorldInput.value)) {
      projectWorldInput.value = project.currentWorldId;
    }
    const selectedWorld = project.worlds[projectWorldInput.value] ?? project.worlds[project.currentWorldId];
    projectWorldSummaryNode.textContent = selectedWorld
      ? `${Object.keys(project.worlds).length} project worlds. Active world: ${project.worlds[project.currentWorldId]?.metadata.name ?? selectedWorld.metadata.name}. Selected world mode: ${selectedWorld.gameMode.replaceAll("_", " ")}.`
      : "No project worlds available.";
  };

  const syncWorldStamps = (): void => {
    worldStampInput.innerHTML = worldStamps
      .map((stamp) => `<option value="${stamp.id}">${escapeHtml(stamp.label)}</option>`)
      .join("");
    if (!worldStamps.some((stamp) => stamp.id === worldStampInput.value)) {
      worldStampInput.value = worldStamps[0]?.id ?? "";
    }
    const stamp = worldStamps.find((item) => item.id === worldStampInput.value);
    worldStampSummaryNode.textContent = stamp?.summary ?? "No world stamp selected.";
  };

  const syncWorldRecipes = (): void => {
    worldRecipeInput.innerHTML = worldRecipes
      .map((recipe) => `<option value="${recipe.id}">${escapeHtml(recipe.label)}</option>`)
      .join("");
    if (!worldRecipes.some((recipe) => recipe.id === worldRecipeInput.value)) {
      worldRecipeInput.value = worldRecipes[0]?.id ?? "";
    }
    const recipe = getWorldRecipe(worldRecipeInput.value);
    worldRecipeSummaryNode.textContent = recipe?.summary ?? "No world recipe selected.";
  };

  const syncFeatureToggles = (): void => {
    const preset = getActionModulePreset(store.peekWorld().gameMode);
    if (!preset || !preset.featureIds || preset.featureIds.length === 0) {
      featureTogglesNode.innerHTML = '<div class="inventory-empty">No configurable runtime features for this mode.</div>';
      return;
    }
    const featureOverrides = store.peekProject().runtime.featureOverrides;
    featureTogglesNode.innerHTML = preset.featureIds
      .map((featureId) => {
        const enabled = featureOverrides[featureId]?.enabled ?? true;
        return `
          <label class="toggle feature-toggle-row">
            <input type="checkbox" data-feature-toggle="${escapeHtml(featureId)}" ${enabled ? "checked" : ""} />
            <span>${escapeHtml(featureId.replaceAll("_", " "))}</span>
          </label>
        `;
      })
      .join("");
  };

  const syncGameplayPolicyControls = (): void => {
    const preset = getActionModulePreset(store.peekWorld().gameMode);
    if (!preset) {
      gameplayPolicySummaryNode.textContent = "No configurable gameplay policy for this mode.";
      return;
    }
    const policy = resolvePresetGameplayPolicy(preset, store.peekProject());
    policyFacingModeInput.value = policy.facing.mode;
    policyIdleFacingModeInput.value = policy.facing.idleMode;
    policyCameraDistanceInput.value = policy.camera.distance.toFixed(1);
    policyCameraPitchInput.value = policy.camera.pitch.toFixed(2);
    policyTargetingModeInput.value = policy.combat.targetingMode;
    policyAttackLockInput.checked = policy.combat.movementLockOnAttack;
    policyLootTransferInput.value = policy.loot.transferMode;
    policyEmptyContainerInput.value = policy.loot.emptyContainerMode;
    policyRespawnModeInput.value = policy.respawn.mode;
    policyRespawnKeyInput.value = policy.respawn.key ?? policy.controls.respawnKey ?? "";
    policyAggroScaleInput.value = policy.hostile.aggroRadiusScale.toFixed(2);
    policyLeashScaleInput.value = policy.hostile.leashRadiusScale.toFixed(2);
    gameplayPolicySummaryNode.textContent =
      `Policy '${preset.policyId}': facing ${policy.facing.mode}, camera ${policy.camera.mode} ${policy.camera.distance.toFixed(1)}m @ ${policy.camera.pitch.toFixed(2)}rad, combat ${policy.combat.targetingMode}/${policy.combat.movementLockOnAttack ? "lock" : "free"}, loot ${policy.loot.transferMode}/${policy.loot.emptyContainerMode}, respawn ${policy.respawn.mode}, hostile aggro ${policy.hostile.aggroRadiusScale.toFixed(2)}x leash ${policy.hostile.leashRadiusScale.toFixed(2)}x.`;
  };

  const applyGameplayPolicyFromInputs = (): void => {
    const preset = getActionModulePreset(store.peekWorld().gameMode);
    if (!preset) {
      appendEvent("Gameplay policy apply skipped: active mode has no configurable action policy.");
      return;
    }
    const patch: ThirdPersonActionGameplayPolicyPatch = {
      facing: {
        mode: policyFacingModeInput.value as ThirdPersonFacingMode,
        idleMode: policyIdleFacingModeInput.value as ThirdPersonIdleFacingMode,
      },
      camera: {
        distance: readNumber(policyCameraDistanceInput.value, 10.5),
        pitch: readNumber(policyCameraPitchInput.value, 0.78),
      },
      combat: {
        targetingMode: policyTargetingModeInput.value as "nearest_hostile" | "none",
        movementLockOnAttack: policyAttackLockInput.checked,
      },
      loot: {
        transferMode: policyLootTransferInput.value as LootTransferMode,
        emptyContainerMode: policyEmptyContainerInput.value as EmptyContainerMode,
      },
      respawn: {
        mode: policyRespawnModeInput.value as RespawnMode,
        key: policyRespawnKeyInput.value.trim() || undefined,
      },
      hostile: {
        aggroRadiusScale: readNumber(policyAggroScaleInput.value, 1),
        leashRadiusScale: readNumber(policyLeashScaleInput.value, 1.1),
      },
    };
    store.setProjectGameplayPolicy(preset.policyId, patch);
    appendEvent(`Applied gameplay policy override '${preset.policyId}'.`);
  };

  const resetGameplayPolicyToPreset = (): void => {
    const preset = getActionModulePreset(store.peekWorld().gameMode);
    if (!preset) {
      appendEvent("Gameplay policy reset skipped: active mode has no configurable action policy.");
      return;
    }
    store.clearProjectGameplayPolicy(preset.policyId);
    syncGameplayPolicyControls();
    appendEvent(`Reset gameplay policy '${preset.policyId}' to preset defaults.`);
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
      canvasRoot.focus();
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
    const actionPreset = getActionModulePreset(world.gameMode);
    const activeGameplayPolicy = actionPreset
      ? resolvePresetGameplayPolicy(actionPreset, store.peekProject())
      : null;

    if (document.activeElement !== projectNameInput) {
      projectNameInput.value = world.metadata.name;
    }

    diagnosticsNode.textContent = JSON.stringify(diagnostics, null, 2);
    evaluationNode.textContent = formatEvaluation(evaluation.findings);
    sessionNode.textContent = runtimeModule.getStatusLines?.().join("\n") ?? "No session state.";
    sectorStatusNode.textContent = worldDebugLines.join("\n") || "No sector debug available.";
    scene.setSectorOverlay(sectorOverlay);
    overviewNode.innerHTML = [
      renderOverviewRow("Project", store.peekProject().metadata.name),
      renderOverviewRow("World", world.metadata.name),
      renderOverviewRow("Mode", currentModuleDescriptor?.label ?? runtimeModule.id),
      renderOverviewRow(
        "Policy",
        activeGameplayPolicy
          ? `${activeGameplayPolicy.facing.mode} / ${activeGameplayPolicy.loot.transferMode} / ${activeGameplayPolicy.respawn.mode}`
          : "n/a",
      ),
      renderOverviewRow("Swap", worldSwapState),
      renderOverviewRow("Selection", selectedEntityId ?? selectedZone?.id ?? "none"),
      renderOverviewRow("Authoring", `${authoringMode} / ${authoringPrefabInput.value}`),
      renderOverviewRow("Counts", `${world.entities.length} entities / ${world.zones.length} zones / ${Object.keys(store.peekProject().worlds).length} worlds`),
    ].join("");
    sessionNode.textContent += `\nModule label: ${currentModuleDescriptor?.label ?? runtimeModule.id}\nModule implemented: ${currentModuleDescriptor?.implemented ? "yes" : "sandbox fallback"}\nKnown modules: ${implementedModuleCount}/${moduleDescriptors.length}\nGameplay policy: ${activeGameplayPolicy ? JSON.stringify(activeGameplayPolicy, null, 2) : "n/a"}\nAuthoring mode: ${authoringMode}\nMove drag: ${moveDragActive}\nResize drag: ${resizeDragActive}\nAuthoring prefab: ${authoringPrefabInput.value}\nAuthoring scale: ${authoringScaleInput.value}\nAuthoring yaw: ${authoringYawInput.value}\nZone kind: ${authoringZoneKindInput.value}\nZone shape: ${authoringZoneShapeInput.value}\nZone size: ${authoringZoneSizeInput.value}\nScene filter: ${sceneFilterInput.value}\nScene search: ${sceneSearchInput.value}\nSelected zone: ${selectedZone?.id ?? "none"}`;
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
    const playtestEvaluation = playtestSession
      ? evaluatePlaytest({
          startedAt: playtestSession.startedAt,
          endedAt: playtestSession.endedAt,
          noteCount: playtestSession.notes.length,
          recentEventCount: runtimeEvents.length,
          ...summarizePlaytest(runtimeEvents),
        })
      : null;
    latestIterationSuggestions = buildIterationSuggestions(
      store.peekProject(),
      world,
      evaluation,
      playtestEvaluation,
    );
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
        ...(playtestEvaluation?.findings.map((finding) => `[playtest:${finding.severity}] ${finding.message}`) ?? []),
        ...store.getCommandIssues(),
      ].join("\n") ||
      store.getCommandIssues().join("\n") ||
      "No command issues.\nUse Generate Flat Outpost for a procedural world seed, or load the authored survival slice.";
    iterationSuggestionsNode.innerHTML = renderIterationSuggestions(latestIterationSuggestions);
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
      `Project worlds: ${Object.keys(store.peekProject().worlds).length}`,
    ].join(" | ");
    playtestStatusNode.textContent = formatPlaytestStatus(
      playtestSession,
      runtimeEvents,
      store.peekProject().runtime.lastPlaytestReport,
    );
    syncGameModeTemplate();
    syncFeatureToggles();
    syncGameplayPolicyControls();
    syncProjectWorlds();
    syncAuthoringPrefabs();
    syncSelectedZoneInputs();
    if (document.activeElement !== projectNameInput) {
      projectNameInput.value = store.peekProject().metadata.name;
    }
  };

  const rebuildWorld = (): void => {
    const world = store.getWorld();
    try {
      ensureRuntimeModule();
      worldSwapState = "rebuilding";
      physics.syncWorld(world);
      scene.setWorld(world);
      runtimeModule.onWorldRebuilt?.(world, {
        store,
        scene,
        physics,
        input,
      });
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

  const buildTownWorld = (): void => {
    store.setWorld(
      stampWorldMode(makeTownGridWorld({
        seed: parseNumber(seedInput.value, defaultFlatWorldOptions.seed, 1),
        worldHalfExtent: parseNumber(sizeInput.value, defaultFlatWorldOptions.worldHalfExtent, 24),
        buildingCount: parseNumber(buildingInput.value, defaultFlatWorldOptions.buildingCount, 1),
        zombieCount: parseNumber(zombieInput.value, defaultFlatWorldOptions.zombieCount, 0),
        crateCount: parseNumber(crateInput.value, defaultFlatWorldOptions.crateCount, 0),
      })),
    );
    appendEvent("Requested generated town grid world.");
  };

  const startProjectFromTemplate = (): void => {
    const template = getProjectTemplate(projectTemplateInput.value);
    if (!template) {
      appendEvent("Project start skipped: no template selected.");
      return;
    }
    requestedGameMode = template.gameMode;
    const world = stampWorldMode(template.buildWorld());
    const projectName = projectNameInput.value.trim();
    const nextProject = projectFromWorld(world, {
      id: `groundtruth.project.${template.id}`,
      name: projectName.length > 0 ? projectName : template.label,
      description: `${template.label}: ${template.summary}`,
      templateId: template.id,
      defaultGameMode: template.gameMode,
    });
    if (projectName.length > 0) {
      nextProject.worlds[nextProject.currentWorldId].metadata.name = projectName;
    }
    store.setProject(nextProject);
    appendEvent(`Started project '${world.metadata.name}' from template '${template.label}'.`);
  };

  const applySelectedWorldStamp = (): void => {
    const stamp = worldStamps.find((item) => item.id === worldStampInput.value);
    if (!stamp) {
      appendEvent("Stamp apply skipped: no stamp selected.");
      return;
    }
    store.setWorld(applyWorldStamp(store.getWorld(), stamp.id));
    appendEvent(`Applied world stamp '${stamp.label}'.`);
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

  const startPlaytestSession = (): void => {
    playtestSession = {
      label: playtestLabelInput.value.trim() || "Playtest Session",
      startedAt: new Date().toISOString(),
      notes: [],
    };
    appendEvent(`Playtest session started: ${playtestSession.label}.`);
    refreshSidebar();
  };

  const stopPlaytestSession = (): void => {
    if (!playtestSession) {
      appendEvent("Stop playtest skipped: no active session.");
      return;
    }
    playtestSession.endedAt = new Date().toISOString();
    appendEvent(`Playtest session stopped: ${playtestSession.label}.`);
    refreshSidebar();
  };

  const addPlaytestNote = (): void => {
    if (!playtestSession) {
      appendEvent("Add note skipped: no active playtest session.");
      return;
    }
    const note = playtestNoteInput.value.trim();
    if (!note) {
      appendEvent("Add note skipped: playtest note is empty.");
      return;
    }
    playtestSession.notes.push(`${new Date().toLocaleTimeString()} | ${note}`);
    playtestNoteInput.value = "";
    appendEvent(`Playtest note added: ${note}`);
    refreshSidebar();
  };

  const exportPlaytestReport = (): void => {
    const world = store.getWorld();
    const project = store.getProject();
    const evaluation = evaluateWorld(world);
    const playtestSummary = summarizePlaytest(runtimeEvents);
    const playtestEvaluation = playtestSession
      ? evaluatePlaytest({
          startedAt: playtestSession.startedAt,
          endedAt: playtestSession.endedAt,
          noteCount: playtestSession.notes.length,
          recentEventCount: runtimeEvents.length,
          ...playtestSummary,
        })
      : null;
    const report = {
      capturedAt: new Date().toISOString(),
      screenshot: scene.captureScreenshot(),
      project,
      world,
      playtest: playtestSession,
      evaluation,
      recentEvents: [...runtimeEvents],
      moduleId: runtimeModule.id,
      summary: playtestSummary,
      playtestEvaluation,
    };
    store.setLastPlaytestReport({
      label: playtestSession?.label ?? "Playtest Session",
      capturedAt: report.capturedAt,
      noteCount: playtestSession?.notes.length ?? 0,
      deathEvents: playtestSummary.deathEvents,
      lootEvents: playtestSummary.lootEvents,
      playerHitEvents: playtestSummary.playerHitEvents,
    });
    downloadJson(
      `${project.metadata.id || world.metadata.id || "groundtruth"}.playtest.json`,
      report,
    );
    screenshotPreview.src = report.screenshot;
    screenshotPreview.classList.add("visible");
    appendEvent(`Exported playtest report for '${project.metadata.name}'.`);
  };

  const executeAppCommands = (commands: AppCommand[]): void => {
    for (const command of commands) {
      if (isWorldCommand(command)) {
        store.apply([command]);
        continue;
      }

      switch (command.op) {
        case "set_project_name":
          store.updateProjectMetadata({
            name: command.name,
            description: command.description,
          });
          appendEvent(`Command set project name to '${command.name}'.`);
          break;
        case "set_project_feature":
          store.setProjectFeatureEnabled(command.featureId, command.enabled);
          appendEvent(`Command ${command.enabled ? "enabled" : "disabled"} project feature '${command.featureId}'.`);
          break;
        case "set_project_gameplay_policy":
          store.setProjectGameplayPolicy(command.policyId, command.patch);
          appendEvent(`Command updated gameplay policy '${command.policyId}'.`);
          break;
        case "save_project_world": {
          const nextId = store.saveCurrentWorldCopy(command.name);
          projectWorldInput.value = nextId;
          syncProjectWorlds();
          appendEvent(`Command saved project world '${nextId}'.`);
          break;
        }
        case "open_project_world": {
          const activated = store.activateProjectWorld(command.worldId);
          if (!activated) {
            issuesNode.textContent = `Project world '${command.worldId}' not found.`;
            appendEvent(`Command failed to open missing project world '${command.worldId}'.`);
            break;
          }
          requestedGameMode = store.peekWorld().gameMode;
          appendEvent(`Command opened project world '${command.worldId}'.`);
          break;
        }
        case "apply_world_stamp": {
          const stampedWorld = applyWorldStamp(store.getWorld(), command.stampId);
          store.setWorld(stampedWorld);
          appendEvent(`Command applied world stamp '${command.stampId}'.`);
          break;
        }
        case "start_project_template": {
          const template = getProjectTemplate(command.templateId);
          if (!template) {
            issuesNode.textContent = `Project template '${command.templateId}' not found.`;
            appendEvent(`Command failed to start missing template '${command.templateId}'.`);
            break;
          }
          requestedGameMode = template.gameMode;
          const world = stampWorldMode(template.buildWorld());
          const nextProject = projectFromWorld(world, {
            id: `groundtruth.project.${template.id}`,
            name: command.projectName?.trim().length ? command.projectName.trim() : template.label,
            description: `${template.label}: ${template.summary}`,
            templateId: template.id,
            defaultGameMode: template.gameMode,
          });
          if (command.projectName?.trim().length) {
            nextProject.worlds[nextProject.currentWorldId].metadata.name = command.projectName.trim();
          }
          store.setProject(nextProject);
          appendEvent(`Command started project from template '${template.label}'.`);
          break;
        }
        case "start_world_recipe": {
          const recipe = getWorldRecipe(command.recipeId);
          if (!recipe) {
            issuesNode.textContent = `World recipe '${command.recipeId}' not found.`;
            appendEvent(`Command failed to start missing recipe '${command.recipeId}'.`);
            break;
          }
          const project = recipe.buildProject(command.projectName);
          requestedGameMode = project.metadata.defaultGameMode;
          store.setProject(project);
          appendEvent(`Command started project from recipe '${recipe.label}'.`);
          break;
        }
        default: {
          const unreachable: never = command;
          issuesNode.textContent = `Unsupported app command: ${JSON.stringify(unreachable)}`;
        }
      }
    }
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
    if (event === "project") {
      appendEvent(`Store event: project -> ${store.peekProject().metadata.id}`);
      refreshSidebar();
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

  const syncSidebarPane = (): void => {
    for (const button of paneButtons) {
      const isActive = button.dataset.paneTarget === activeSidebarPane;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    }
    for (const section of toolSections) {
      section.toggleAttribute("hidden", section.dataset.pane !== activeSidebarPane);
    }
  };

  const syncDocs = (): void => {
    const activeSections = helpContentByAudience[activeHelpAudience];
    docsTitleNode.textContent = activeHelpAudience === "human"
      ? "How To Use Groundtruth"
      : "Groundtruth AI Operator Guide";
    for (const button of docsAudienceButtons) {
      const isActive = button.dataset.docsAudience === activeHelpAudience;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    }

    docsNavNode.innerHTML = activeSections.map((section) => `
      <button
        class="docs-link ${section.id === activeHelpSectionId ? "active" : ""}"
        type="button"
        data-docs-section="${section.id}"
      >
        ${escapeHtml(section.title)}
      </button>
    `).join("");

    const activeSection = activeSections.find((section) => section.id === activeHelpSectionId) ?? activeSections[0];
    if (!activeSection) {
      docsContentNode.innerHTML = "<p>No tutorial content available.</p>";
      return;
    }
    docsContentNode.innerHTML = renderHelpSection(activeSection);
  };

  const setDocsOpen = (open: boolean): void => {
    docsModal.classList.toggle("hidden", !open);
    docsModal.setAttribute("aria-hidden", String(!open));
    if (open) {
      syncDocs();
    }
  };

  toggleSidebarButton.addEventListener("click", () => {
    sidebarCollapsed = !sidebarCollapsed;
    syncSidebarState();
  });

  for (const button of paneButtons) {
    button.addEventListener("click", () => {
      const nextPane = button.dataset.paneTarget as "build" | "inspect" | "runtime" | undefined;
      if (!nextPane) {
        return;
      }
      activeSidebarPane = nextPane;
      syncSidebarPane();
    });
  }

  openDocsButton.addEventListener("click", () => {
    setDocsOpen(true);
  });

  closeDocsButton.addEventListener("click", () => {
    setDocsOpen(false);
  });

  docsModal.addEventListener("click", (event) => {
    if (event.target === docsModal) {
      setDocsOpen(false);
    }
  });

  window.addEventListener("keydown", (event) => {
    if (shouldCaptureGameplayKey(event, authoringMode, docsModal, canvasRoot)) {
      event.preventDefault();
      if (document.activeElement !== canvasRoot) {
        canvasRoot.focus();
      }
    }
    if (event.key === "Escape" && !docsModal.classList.contains("hidden")) {
      setDocsOpen(false);
    }
  });

  docsNavNode.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const button = target.closest<HTMLElement>("[data-docs-section]");
    if (!button) {
      return;
    }
    const sectionId = button.dataset.docsSection;
    if (!sectionId) {
      return;
    }
    activeHelpSectionId = sectionId;
    syncDocs();
  });

  for (const button of docsAudienceButtons) {
    button.addEventListener("click", () => {
      const audience = button.dataset.docsAudience as HelpAudience | undefined;
      if (!audience) {
        return;
      }
      activeHelpAudience = audience;
      activeHelpSectionId = helpContentByAudience[audience][0]?.id ?? "";
      syncDocs();
    });
  }

  gameModeTemplateInput.addEventListener("change", () => {
    requestedGameMode = gameModeTemplateInput.value as GameMode;
    appendEvent(`Requested game mode set to '${requestedGameMode}'.`);
    refreshSidebar();
  });

  projectTemplateInput.addEventListener("change", syncProjectTemplates);
  projectWorldInput.addEventListener("change", syncProjectWorlds);
  worldRecipeInput.addEventListener("change", syncWorldRecipes);
  worldStampInput.addEventListener("change", syncWorldStamps);

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

  featureTogglesNode.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    const featureId = target.dataset.featureToggle;
    if (!featureId) {
      return;
    }
    store.setProjectFeatureEnabled(featureId, target.checked);
    appendEvent(`Project feature '${featureId}' ${target.checked ? "enabled" : "disabled"}.`);
  });

  root.querySelector<HTMLButtonElement>("#apply-gameplay-policy")?.addEventListener("click", () => {
    applyGameplayPolicyFromInputs();
  });

  root.querySelector<HTMLButtonElement>("#reset-gameplay-policy")?.addEventListener("click", () => {
    resetGameplayPolicyToPreset();
  });

  iterationSuggestionsNode.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const actionButton = target.closest<HTMLElement>("[data-iteration-action]");
    if (!actionButton) {
      return;
    }
    const suggestionId = actionButton.dataset.iterationSuggestion;
    const action = actionButton.dataset.iterationAction;
    if (!suggestionId || !action) {
      return;
    }
    const suggestion = latestIterationSuggestions.find((item) => item.id === suggestionId);
    if (!suggestion) {
      appendEvent(`Iteration action skipped: missing suggestion '${suggestionId}'.`);
      return;
    }
    if (action === "load") {
      commandScript.value = JSON.stringify(suggestion.commands, null, 2);
      activeSidebarPane = "build";
      syncSidebarPane();
      appendEvent(`Loaded iteration suggestion '${suggestion.title}' into command script.`);
      return;
    }
    if (action === "apply") {
      executeAppCommands(suggestion.commands);
      store.recordAppliedSuggestion(suggestion.id, suggestion.title);
      appendEvent(`Applied iteration suggestion '${suggestion.title}'.`);
    }
  });

  canvasRoot.addEventListener("pointerdown", handleCanvasAuthoring);
  canvasRoot.addEventListener("pointermove", handleCanvasAuthoringMove);
  canvasRoot.addEventListener("pointerup", stopAuthoringDrag);
  canvasRoot.addEventListener("pointerleave", stopAuthoringDrag);

  root.querySelector<HTMLButtonElement>("#load-generated")?.addEventListener("click", () => {
    buildGeneratedWorld();
  });

  root.querySelector<HTMLButtonElement>("#load-town")?.addEventListener("click", () => {
    buildTownWorld();
  });

  root.querySelector<HTMLButtonElement>("#start-project")?.addEventListener("click", () => {
    startProjectFromTemplate();
  });

  root.querySelector<HTMLButtonElement>("#save-project-world")?.addEventListener("click", () => {
    const nextId = store.saveCurrentWorldCopy();
    projectWorldInput.value = nextId;
    syncProjectWorlds();
    appendEvent(`Saved current world copy '${nextId}' into project.`);
  });

  root.querySelector<HTMLButtonElement>("#open-project-world")?.addEventListener("click", () => {
    const worldId = projectWorldInput.value;
    if (!worldId) {
      appendEvent("Open project world skipped: no project world selected.");
      return;
    }
    const activated = store.activateProjectWorld(worldId);
    if (!activated) {
      appendEvent(`Open project world skipped: '${worldId}' is missing.`);
      return;
    }
    requestedGameMode = store.peekWorld().gameMode;
    appendEvent(`Activated project world '${worldId}'.`);
  });

  root.querySelector<HTMLButtonElement>("#export-project")?.addEventListener("click", () => {
    const screenshot = scene.captureScreenshot();
    const projectExport = createProjectExportEnvelope(store.getProject(), screenshot);
    downloadJson(
      `${projectExport.project.metadata.id || "groundtruth-project"}.project.json`,
      projectExport,
    );
    if (projectExport.screenshot) {
      screenshotPreview.src = projectExport.screenshot;
    }
    screenshotPreview.classList.add("visible");
    appendEvent(`Exported project '${projectExport.project.metadata.name}'.`);
  });

  root.querySelector<HTMLButtonElement>("#export-playable")?.addEventListener("click", () => {
    const playableBuild = createPlayableBuildDocument(store.getProject());
    downloadJson(
      `${playableBuild.project.metadata.id || "groundtruth-game"}.playable.json`,
      playableBuild,
    );
    appendEvent(`Exported playable build '${playableBuild.manifest.title}'.`);
  });

  root.querySelector<HTMLButtonElement>("#import-project")?.addEventListener("click", () => {
    projectFileInput.click();
  });

  root.querySelector<HTMLButtonElement>("#import-playable")?.addEventListener("click", () => {
    playableFileInput.click();
  });

  root.querySelector<HTMLButtonElement>("#apply-world-stamp")?.addEventListener("click", () => {
    applySelectedWorldStamp();
  });

  root.querySelector<HTMLButtonElement>("#start-world-recipe")?.addEventListener("click", () => {
    const recipe = getWorldRecipe(worldRecipeInput.value);
    if (!recipe) {
      appendEvent("Recipe start skipped: no recipe selected.");
      return;
    }
    const project = recipe.buildProject(projectNameInput.value.trim() || undefined);
    requestedGameMode = project.metadata.defaultGameMode;
    store.setProject(project);
    appendEvent(`Started project from recipe '${recipe.label}'.`);
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
    requestedGameMode = "third_person_survival";
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
      executeAppCommands(parseCommandScript(commandScript.value));
    } catch (error) {
      issuesNode.textContent =
        error instanceof Error ? error.message : String(error);
    }
  });

  root.querySelector<HTMLButtonElement>("#capture-shot")?.addEventListener("click", () => {
    screenshotPreview.src = scene.captureScreenshot();
    screenshotPreview.classList.add("visible");
  });

  root.querySelector<HTMLButtonElement>("#start-playtest")?.addEventListener("click", () => {
    startPlaytestSession();
  });

  root.querySelector<HTMLButtonElement>("#stop-playtest")?.addEventListener("click", () => {
    stopPlaytestSession();
  });

  root.querySelector<HTMLButtonElement>("#add-playtest-note")?.addEventListener("click", () => {
    addPlaytestNote();
  });

  root.querySelector<HTMLButtonElement>("#export-playtest-report")?.addEventListener("click", () => {
    exportPlaytestReport();
  });

  root.querySelector<HTMLButtonElement>("#export-world")?.addEventListener("click", () => {
    const snapshot = {
      capturedAt: new Date().toISOString(),
      screenshot: scene.captureScreenshot(),
      project: store.getProject(),
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
        project?: ProjectDocument;
        world?: ReturnType<WorldStore["getWorld"]>;
        screenshot?: string;
      };
      const importedProject = parsed.project ? resolveImportedProject(parsed.project) : null;
      if (importedProject) {
        store.setProject(importedProject);
      } else if (parsed.world) {
        store.setWorld(parsed.world);
      } else {
        throw new Error("Snapshot JSON does not contain a project or world document.");
      }
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

  projectFileInput.addEventListener("change", async () => {
    const file = projectFileInput.files?.[0];
    if (!file) {
      return;
    }

    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const project = resolveImportedProject(parsed);
      if (!project) {
        throw new Error("Project JSON does not contain a valid project document.");
      }
      store.setProject(project);
      requestedGameMode = project.metadata.defaultGameMode;
      if (typeof parsed === "object" && parsed && "screenshot" in parsed && typeof (parsed as { screenshot?: unknown }).screenshot === "string") {
        screenshotPreview.src = (parsed as { screenshot: string }).screenshot;
        screenshotPreview.classList.add("visible");
      }
      appendEvent(`Imported project '${project.metadata.name}'.`);
    } catch (error) {
      issuesNode.textContent = error instanceof Error ? error.message : String(error);
    } finally {
      projectFileInput.value = "";
    }
  });

  playableFileInput.addEventListener("change", async () => {
    const file = playableFileInput.files?.[0];
    if (!file) {
      return;
    }

    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      if (!isPlayableBuildDocument(parsed)) {
        throw new Error("Playable build JSON does not contain a valid Groundtruth playable build.");
      }
      store.setProject(parsed.project);
      requestedGameMode = parsed.project.metadata.defaultGameMode;
      appendEvent(`Imported playable build '${parsed.manifest.title}' as an editable project.`);
    } catch (error) {
      issuesNode.textContent = error instanceof Error ? error.message : String(error);
    } finally {
      playableFileInput.value = "";
    }
  });

  projectNameInput.addEventListener("change", () => {
    const nextName = projectNameInput.value.trim();
    if (nextName.length === 0) {
      projectNameInput.value = store.peekProject().metadata.name;
      return;
    }
    store.updateProjectMetadata({ name: nextName });
    appendEvent(`Project renamed to '${nextName}'.`);
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
  syncSidebarPane();
  syncGameModeTemplate();
  syncProjectTemplates();
  syncProjectWorlds();
  syncWorldRecipes();
  syncWorldStamps();
  syncAuthoringPrefabs();
  syncGameplayPolicyControls();
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

interface GroundtruthBootConfig {
  mode?: "editor" | "player";
  manifest?: string;
}

function readBootConfig(): GroundtruthBootConfig {
  const bootWindow = window as Window & typeof globalThis & {
    __GROUNDTRUTH_BOOT__?: GroundtruthBootConfig;
  };
  const search = new URLSearchParams(window.location.search);
  return {
    mode: search.get("mode") === "player"
      ? "player"
      : bootWindow.__GROUNDTRUTH_BOOT__?.mode ?? "editor",
    manifest: search.get("manifest")
      ?? bootWindow.__GROUNDTRUTH_BOOT__?.manifest,
  };
}

async function loadBootProject(
  bootConfig: GroundtruthBootConfig,
): Promise<ProjectDocument | null> {
  if (bootConfig.mode !== "player" || !bootConfig.manifest) {
    return null;
  }
  const response = await fetch(bootConfig.manifest, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load playable build manifest '${bootConfig.manifest}'.`);
  }
  const parsed = await response.json();
  if (!isPlayableBuildDocument(parsed)) {
    throw new Error(`Boot manifest '${bootConfig.manifest}' is not a valid Groundtruth playable build.`);
  }
  return parsed.project;
}

function applyGameModeTuning(world: WorldDocument): WorldDocument {
  const nextWorld: WorldDocument = JSON.parse(JSON.stringify(world)) as WorldDocument;
  const player = nextWorld.entities.find((entity) => entity.id === "player");
  if (player) {
    player.components = {
      ...player.components,
      cameraRig: resolveCameraRigForMode(nextWorld.gameMode),
    };
  }

  const actionPreset = getActionModulePreset(nextWorld.gameMode);
  if (actionPreset) {
    applyActionWorldLayout(nextWorld, actionPreset.worldLayout);
  }

  return nextWorld;
}

function resolveCameraRigForMode(gameMode: GameMode) {
  const actionPreset = getActionModulePreset(gameMode);
  if (actionPreset) {
    return policyCameraRig(actionPreset);
  }

  switch (gameMode) {
    default:
      return undefined;
  }
}

function buildPlatformerTemplatePlatforms(world: WorldDocument) {
  const span = Math.max(28, Math.min(58, world.settings.gridSize * 0.32));
  return [
    {
      id: "platform.template.1",
      name: "Platform Lane 1",
      prefabId: "platform_block",
      transform: {
        position: makeVec3(-span * 0.45, 2.4, 0),
        scale: makeVec3(1.2, 1, 1),
      },
    },
    {
      id: "platform.template.2",
      name: "Platform Lane 2",
      prefabId: "platform_block",
      transform: {
        position: makeVec3(-span * 0.12, 4.6, 0),
        scale: makeVec3(0.9, 1, 1),
      },
    },
    {
      id: "platform.template.3",
      name: "Platform Lane 3",
      prefabId: "platform_block",
      transform: {
        position: makeVec3(span * 0.18, 6.8, 0),
        scale: makeVec3(0.9, 1, 1),
      },
    },
    {
      id: "platform.template.4",
      name: "Platform Lane 4",
      prefabId: "platform_block",
      transform: {
        position: makeVec3(span * 0.48, 9.2, 0),
        scale: makeVec3(1.25, 1, 1),
      },
    },
  ];
}

function applyActionWorldLayout(
  world: WorldDocument,
  layout: "third_person" | "top_down" | "platformer",
): void {
  switch (layout) {
    case "third_person":
      stampThirdPersonArena(world);
      return;
    case "top_down":
      stampTopDownArena(world);
      return;
    case "platformer":
      stampPlatformerLane(world);
      return;
    default:
      return;
  }
}

function stampThirdPersonArena(world: WorldDocument): void {
  ensureTemplateEntities(world, "arena.tp.", buildThirdPersonArenaTemplates());
  const player = world.entities.find((entity) => entity.id === "player");
  if (player) {
    player.transform.position = makeVec3(0, 1.2, -8);
    player.transform.rotation = makeVec3(0, 0, 0);
  }

  nudgeEntitiesOutOfCenter(world, 18, (entity) => isBuildingEntity(world, entity));

  const hostiles = world.entities.filter((entity) => isHostileEntity(entity));
  const crates = world.entities.filter((entity) => isLootEntity(world, entity));
  const hostileSlots = [
    makeVec3(-8, 1.1, 8),
    makeVec3(0, 1.1, 12),
    makeVec3(8, 1.1, 8),
    makeVec3(-12, 1.1, 18),
    makeVec3(12, 1.1, 18),
    makeVec3(0, 1.1, 24),
  ];
  const crateSlots = [
    makeVec3(-10, 0.5, -1.5),
    makeVec3(10, 0.5, -1.5),
    makeVec3(-16, 0.5, 8),
    makeVec3(16, 0.5, 8),
  ];
  assignTemplateSlots(hostiles, hostileSlots);
  assignTemplateSlots(crates, crateSlots);
}

function stampTopDownArena(world: WorldDocument): void {
  ensureTemplateEntities(world, "arena.td.", buildTopDownArenaTemplates());
  const player = world.entities.find((entity) => entity.id === "player");
  if (player) {
    player.transform.position = makeVec3(0, 1.2, 0);
    player.transform.rotation = makeVec3(0, 0, 0);
  }

  nudgeEntitiesOutOfCenter(world, 22, (entity) => isBuildingEntity(world, entity));

  const hostiles = world.entities.filter((entity) => isHostileEntity(entity));
  const crates = world.entities.filter((entity) => isLootEntity(world, entity));
  assignTemplateSlots(hostiles, buildRingSlots(8, 15, 1.1, Math.PI * 0.25));
  assignTemplateSlots(crates, buildRingSlots(4, 8, 0.5, Math.PI * 0.25));
}

function stampPlatformerLane(world: WorldDocument): void {
  ensureTemplateEntities(world, "platform.template.", buildPlatformerTemplatePlatforms(world));

  let hostileIndex = 0;
  let lootIndex = 0;
  for (const entity of world.entities) {
    const isPlayer = entity.id === "player";
    const isHostile = isHostileEntity(entity);
    const isLoot = isLootEntity(world, entity);
    if (!(isPlayer || isHostile || isLoot)) {
      continue;
    }
    entity.transform.position.z = 0;
    if (isPlayer) {
      entity.transform.position.x = -36;
      entity.transform.position.y = 1.1;
    } else if (isHostile) {
      entity.transform.position.x = -6 + (hostileIndex * 10);
      entity.transform.position.y = hostileIndex % 2 === 0 ? 1.1 : 4.7;
      hostileIndex += 1;
    } else if (isLoot) {
      entity.transform.position.x = -16 + (lootIndex * 20);
      entity.transform.position.y = lootIndex % 2 === 0 ? 2.5 : 7.1;
      lootIndex += 1;
    }
  }
}

function ensureTemplateEntities(
  world: WorldDocument,
  prefix: string,
  templates: WorldDocument["entities"],
): void {
  if (world.entities.some((entity) => entity.id.startsWith(prefix))) {
    return;
  }
  world.entities.push(...templates);
}

function buildThirdPersonArenaTemplates(): WorldDocument["entities"] {
  return [
    {
      id: "arena.tp.cover.1",
      name: "Arena Cover 1",
      prefabId: "cover_barrier",
      transform: {
        position: makeVec3(-6, 0.7, 2),
      },
    },
    {
      id: "arena.tp.cover.2",
      name: "Arena Cover 2",
      prefabId: "cover_barrier",
      transform: {
        position: makeVec3(6, 0.7, 2),
      },
    },
    {
      id: "arena.tp.cover.3",
      name: "Arena Cover 3",
      prefabId: "cover_barrier",
      transform: {
        position: makeVec3(-10, 0.7, 14),
        rotation: makeVec3(0, Math.PI * 0.5, 0),
      },
    },
    {
      id: "arena.tp.cover.4",
      name: "Arena Cover 4",
      prefabId: "cover_barrier",
      transform: {
        position: makeVec3(10, 0.7, 14),
        rotation: makeVec3(0, Math.PI * 0.5, 0),
      },
    },
  ];
}

function buildTopDownArenaTemplates(): WorldDocument["entities"] {
  return [
    {
      id: "arena.td.cover.1",
      name: "Topdown Cover North",
      prefabId: "cover_barrier",
      transform: {
        position: makeVec3(0, 0.7, -6),
      },
    },
    {
      id: "arena.td.cover.2",
      name: "Topdown Cover South",
      prefabId: "cover_barrier",
      transform: {
        position: makeVec3(0, 0.7, 6),
      },
    },
    {
      id: "arena.td.cover.3",
      name: "Topdown Cover West",
      prefabId: "cover_barrier",
      transform: {
        position: makeVec3(-6, 0.7, 0),
        rotation: makeVec3(0, Math.PI * 0.5, 0),
      },
    },
    {
      id: "arena.td.cover.4",
      name: "Topdown Cover East",
      prefabId: "cover_barrier",
      transform: {
        position: makeVec3(6, 0.7, 0),
        rotation: makeVec3(0, Math.PI * 0.5, 0),
      },
    },
    {
      id: "arena.td.cover.5",
      name: "Topdown Cover Northwest",
      prefabId: "cover_barrier",
      transform: {
        position: makeVec3(-11, 0.7, -11),
      },
    },
    {
      id: "arena.td.cover.6",
      name: "Topdown Cover Southeast",
      prefabId: "cover_barrier",
      transform: {
        position: makeVec3(11, 0.7, 11),
      },
    },
  ];
}

function buildRingSlots(
  count: number,
  radius: number,
  y: number,
  phase = 0,
) {
  return Array.from({ length: count }, (_, index) => {
    const angle = phase + ((Math.PI * 2 * index) / count);
    return makeVec3(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
  });
}

function assignTemplateSlots(
  entities: WorldDocument["entities"],
  slots: Array<ReturnType<typeof makeVec3>>,
): void {
  entities.slice(0, slots.length).forEach((entity, index) => {
    const slot = slots[index];
    entity.transform.position = slot;
    entity.transform.rotation = makeVec3(0, Math.atan2(slot.x, slot.z) + Math.PI, 0);
  });
}

function nudgeEntitiesOutOfCenter(
  world: WorldDocument,
  minRadius: number,
  predicate: (entity: WorldDocument["entities"][number]) => boolean,
): void {
  for (const entity of world.entities) {
    if (!predicate(entity)) {
      continue;
    }
    const distance = Math.hypot(entity.transform.position.x, entity.transform.position.z);
    if (distance >= minRadius) {
      continue;
    }
    const angle = Math.atan2(
      entity.transform.position.z || 0.0001,
      entity.transform.position.x || 0.0001,
    );
    entity.transform.position.x = Math.cos(angle) * minRadius;
    entity.transform.position.z = Math.sin(angle) * minRadius;
  }
}

function isHostileEntity(entity: WorldDocument["entities"][number]): boolean {
  return (entity.tags ?? []).includes("enemy") || entity.prefabId === "zombie_basic";
}

function isLootEntity(
  world: WorldDocument,
  entity: WorldDocument["entities"][number],
): boolean {
  const category = entity.prefabId ? world.prefabs[entity.prefabId]?.category : undefined;
  return category === "loot" || entity.prefabId === "loot_crate" || (entity.tags ?? []).includes("loot");
}

function isBuildingEntity(
  world: WorldDocument,
  entity: WorldDocument["entities"][number],
): boolean {
  const category = entity.prefabId ? world.prefabs[entity.prefabId]?.category : undefined;
  return category === "building";
}

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

function renderOverviewRow(label: string, value: string): string {
  return `
    <div class="overview-row">
      <span class="overview-label">${escapeHtml(label)}</span>
      <span class="overview-value">${escapeHtml(value)}</span>
    </div>
  `;
}

function renderIterationSuggestions(suggestions: IterationSuggestion[]): string {
  if (suggestions.length === 0) {
    return '<div class="inventory-empty">No iteration suggestions available.</div>';
  }

  return suggestions
    .map((suggestion) => `
      <div class="iteration-card">
        <div class="iteration-copy">
          <div class="iteration-title">${escapeHtml(suggestion.title)}</div>
          <div class="iteration-summary">${escapeHtml(suggestion.summary)}</div>
          <div class="iteration-meta">
            <span>Applied ${suggestion.appliedCount ?? 0} time${(suggestion.appliedCount ?? 0) === 1 ? "" : "s"}</span>
            ${suggestion.appliedRecently ? '<span class="iteration-badge">Recently applied</span>' : ""}
          </div>
        </div>
        <div class="iteration-actions">
          <button
            type="button"
            class="secondary"
            data-iteration-action="load"
            data-iteration-suggestion="${escapeHtml(suggestion.id)}"
          >
            Load To Script
          </button>
          <button
            type="button"
            data-iteration-action="apply"
            data-iteration-suggestion="${escapeHtml(suggestion.id)}"
          >
            Apply Now
          </button>
        </div>
      </div>
    `)
    .join("");
}

interface PlaytestSession {
  label: string;
  startedAt: string;
  endedAt?: string;
  notes: string[];
}

function formatPlaytestStatus(
  session: PlaytestSession | null,
  recentEvents: string[],
  lastReport?: {
    label: string;
    capturedAt: string;
    noteCount: number;
    deathEvents: number;
    lootEvents: number;
    playerHitEvents: number;
  },
): string {
  if (!session) {
    if (!lastReport) {
      return "No active playtest session.\nUse Start Session to begin capturing notes and exportable context.";
    }
    return [
      "No active playtest session.",
      `Last exported: ${lastReport.label} @ ${lastReport.capturedAt}`,
      `Deaths: ${lastReport.deathEvents}`,
      `Loot events: ${lastReport.lootEvents}`,
      `Player hit events: ${lastReport.playerHitEvents}`,
      `Notes captured: ${lastReport.noteCount}`,
      "Use Start Session to capture a fresh run and compare it against this baseline.",
    ].join("\n");
  }
  const summary = summarizePlaytest(recentEvents);
  const evaluation = evaluatePlaytest({
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    noteCount: session.notes.length,
    recentEventCount: recentEvents.length,
    ...summary,
  });
  return [
    `Label: ${session.label}`,
    `Started: ${session.startedAt}`,
    `Ended: ${session.endedAt ?? "active"}`,
    `Notes: ${session.notes.length}`,
    `Deaths seen: ${summary.deathEvents}`,
    `Loot events: ${summary.lootEvents}`,
    `Player hit events: ${summary.playerHitEvents}`,
    `Eval: ${evaluation.counts.warn} warn / ${evaluation.counts.info} info`,
    ...(lastReport
      ? [
          `Compared to '${lastReport.label}': deaths ${formatDelta(summary.deathEvents - lastReport.deathEvents)}, loot ${formatDelta(summary.lootEvents - lastReport.lootEvents)}, hits ${formatDelta(summary.playerHitEvents - lastReport.playerHitEvents)}`,
        ]
      : []),
    ...(evaluation.findings.slice(0, 4).map((finding) => `[${finding.severity}] ${finding.message}`)),
    ...(session.notes.length > 0 ? ["", ...session.notes.slice(-6)] : []),
  ].join("\n");
}

function summarizePlaytest(recentEvents: string[]) {
  return {
    deathEvents: recentEvents.filter((line) => line.toLowerCase().includes("died")).length,
    lootEvents: recentEvents.filter((line) => line.toLowerCase().includes("loot")).length,
    playerHitEvents: recentEvents.filter((line) => line.toLowerCase().includes("hit player")).length,
  };
}

function formatDelta(value: number): string {
  if (value > 0) {
    return `+${value}`;
  }
  if (value < 0) {
    return `${value}`;
  }
  return "0";
}

function shouldCaptureGameplayKey(
  event: KeyboardEvent,
  authoringMode: string,
  docsModal: HTMLElement,
  canvasRoot: HTMLElement,
): boolean {
  if (authoringMode !== "play") {
    return false;
  }
  if (!docsModal.classList.contains("hidden")) {
    return false;
  }

  const target = event.target as HTMLElement | null;
  if (target) {
    const tag = target.tagName;
    if (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      target.isContentEditable
    ) {
      return false;
    }
  }

  const gameplayKeys = new Set([
    "Space",
    "KeyW",
    "KeyA",
    "KeyS",
    "KeyD",
    "KeyE",
    "KeyF",
    "ShiftLeft",
    "ShiftRight",
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
  ]);

  if (!gameplayKeys.has(event.code)) {
    return false;
  }

  return document.activeElement === canvasRoot || !!target;
}

function renderHelpSection(section: HelpSection): string {
  return `
    <div class="docs-section-copy">
      <p class="docs-summary">${escapeHtml(section.summary)}</p>
      <ol class="docs-steps">
        ${section.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}
      </ol>
      ${section.notes && section.notes.length > 0 ? `
        <div class="docs-notes">
          <h3>Notes</h3>
          <ul>
            ${section.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}
          </ul>
        </div>
      ` : ""}
      ${section.code ? `<pre class="docs-code">${escapeHtml(section.code)}</pre>` : ""}
    </div>
  `;
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
