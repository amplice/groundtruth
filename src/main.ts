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
  AnimationComponent,
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
  makeUrbanCityWorld,
} from "./core/sampleWorld";
import { createUrbanRoadWalkPhysics, isUrbanRoadWalkPhysics } from "./core/worldFactory";
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
      <main class="viewport">
        <div class="viewport-head">
          <div id="chrome-strip" class="chrome-strip">
            <div class="chrome-controls" aria-label="Viewport controls">
              <button id="toggle-pause" class="secondary chrome-toggle" type="button" aria-pressed="false">Pause</button>
              <button id="toggle-hud" class="secondary chrome-toggle" type="button" aria-pressed="true">Hide HUD</button>
              <button id="toggle-sidebar" class="secondary chrome-toggle" type="button" aria-expanded="true">Hide Workspace</button>
            </div>
            <div class="workspace-topbar" aria-label="Primary workspace">
              <button class="tab-button" type="button" data-pane-target="project" aria-pressed="false">Project</button>
              <button class="tab-button active" type="button" data-pane-target="play" aria-pressed="true">Playtest</button>
              <button class="tab-button" type="button" data-pane-target="world" aria-pressed="false">Map</button>
              <button class="tab-button" type="button" data-pane-target="assets" aria-pressed="false">Assets</button>
              <div class="chrome-menu-shell">
                <button
                  id="chrome-menu-button"
                  class="tab-button chrome-menu-button"
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded="false"
                >
                  More
                </button>
                <div id="chrome-menu" class="chrome-menu" role="menu" hidden>
                  <button class="chrome-menu-item" type="button" data-pane-target="debug" aria-pressed="false" role="menuitem">Debug</button>
                  <button id="open-docs" class="chrome-menu-item" type="button" role="menuitem">Docs</button>
                </div>
              </div>
            </div>
          </div>
          <button id="toggle-chrome" class="secondary chrome-toggle chrome-collapse" type="button" aria-expanded="true">Hide Bar</button>
        </div>
        <aside class="panel">
        <div class="panel-stack">
        <details class="section tool-section" data-pane="project" open>
          <summary class="section-head">
            <h2>Project</h2>
            <span>Files, templates, world variants</span>
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
                <span>World Variants</span>
                <select id="project-world"></select>
              </label>
            </div>
            <div id="project-world-summary" class="inline-summary"></div>
            <div id="project-save-summary" class="inline-summary"></div>
            <div class="controls">
              <button id="start-project">Start Project From Template</button>
              <button id="save-project">Save Project</button>
              <button id="export-playable" class="secondary">Build Playable Export</button>
              <button id="import-project" class="secondary">Open</button>
            </div>
            <details class="subsection">
              <summary>More project options</summary>
              <div class="controls compact-controls">
                <button id="save-project-world" class="secondary">Save World Variant</button>
                <button id="open-project-world" class="secondary">Open World Variant</button>
                <button id="export-project" class="secondary">Export Project</button>
              </div>
            </details>
          </div>
        </details>
        <details class="section tool-section" data-pane="play" open>
          <summary class="section-head">
            <h2>Gameplay Policy</h2>
            <span>Playtest camera, combat, and loot rules</span>
          </summary>
          <div class="section-body">
            <div class="generation-grid">
              <label>
                <span>Camera distance</span>
                <input id="policy-camera-distance" type="number" step="0.1" value="10.5" />
              </label>
              <label>
                <span>Camera pitch</span>
                <input id="policy-camera-pitch" type="number" step="0.01" value="0.78" />
              </label>
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
        <details class="section tool-section" data-pane="world" open>
          <summary class="section-head">
            <h2>World</h2>
            <span>Reset and snapshots</span>
          </summary>
          <div class="section-body">
            <div class="controls compact-controls">
              <button id="reset-world" class="secondary">Reset World</button>
              <button id="capture-shot" class="secondary">Capture Screenshot</button>
            </div>
            <details class="subsection">
              <summary>Advanced</summary>
              <div class="generation-grid single-span">
                <label class="wide">
                  <span>Game Mode Override</span>
                  <select id="game-mode-template"></select>
                </label>
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
              <div class="controls compact-controls">
                <button id="load-urban" class="secondary">Generate Urban City</button>
                <button id="load-generated" class="secondary">Generate Flat Outpost</button>
                <button id="load-town" class="secondary">Generate Town Grid</button>
                <button id="load-sample" class="secondary">Load Survival Slice</button>
                <button id="load-scale-test" class="secondary">Generate Scale Test</button>
                <button id="load-empty" class="secondary">New Empty World</button>
                <button id="stress-world" class="secondary">Stress Test Swaps</button>
                <button id="export-world" class="secondary">Export Snapshot</button>
                <button id="import-world" class="secondary">Import Snapshot</button>
              </div>
            </details>
          </div>
        </details>
        <details class="section tool-section" data-pane="play" open>
          <summary class="section-head">
            <h2>Play View</h2>
            <span>HUD and overlay controls</span>
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
            <label class="toggle">
              <input id="toggle-hud-status" type="checkbox" checked />
              <span>Playtest HUD card</span>
            </label>
            <label class="toggle">
              <input id="toggle-hud-findings" type="checkbox" checked />
              <span>Findings card</span>
            </label>
            <label class="toggle">
              <input id="toggle-hud-evaluation" type="checkbox" checked />
              <span>Evaluation card</span>
            </label>
            <label class="toggle">
              <input id="toggle-hud-debug" type="checkbox" checked />
              <span>Player debug card</span>
            </label>
          </div>
          </div>
        </details>
        <details class="section tool-section" data-pane="world">
          <summary class="section-head">
            <h2>Authoring</h2>
            <span>In-world editing</span>
          </summary>
          <div class="section-body">
            <div class="authoring-flow-note">
              Map authoring is paused by design. Use <strong>Select</strong> to pick entities or zones, then
              switch to move, rotate, resize, or delete them.
            </div>
            <div class="authoring-shell">
              <div class="authoring-step">
                <div class="authoring-step-label">1. Mode</div>
                <div class="controls compact-controls authoring-mode-controls">
                  <button id="mode-play" class="secondary">Play</button>
                  <button id="mode-edit" class="secondary">Edit</button>
                </div>
              </div>
              <div class="authoring-step">
                <div class="authoring-step-label">2. Edit tool</div>
                <div class="controls authoring-tool-controls">
                  <button id="mode-select" class="secondary">Select</button>
                  <button id="mode-place" class="secondary">Place</button>
                  <button id="mode-move" class="secondary">Move</button>
                  <button id="mode-rotate" class="secondary">Rotate</button>
                  <button id="mode-resize" class="secondary">Resize</button>
                  <button id="mode-zone" class="secondary">Zone Volume</button>
                </div>
              </div>
              <div class="authoring-step">
                <div class="authoring-step-label">3. Quick controls</div>
                <div class="controls authoring-tool-controls">
                  <button id="authoring-rotate-left" class="secondary">Rotate -</button>
                  <button id="authoring-rotate-right" class="secondary">Rotate +</button>
                  <button id="authoring-smaller" class="secondary">Smaller</button>
                  <button id="authoring-bigger" class="secondary">Bigger</button>
                </div>
              </div>
            </div>
            <div class="authoring-flow-note">
              Place and zone tools show a translucent preview. Shortcuts: <strong>1-6</strong> tools,
              <strong>Q/E</strong> rotate selected or preview, <strong>[ / ]</strong> scale or zone size,
              <strong>Delete</strong> remove selection, <strong>Ctrl/Cmd+Z</strong> undo.
            </div>
            <div class="generation-grid">
            <label>
              <span>Mode</span>
              <input id="authoring-mode" value="play" readonly />
            </label>
            <label>
              <span>Edit tool</span>
              <input id="authoring-tool" value="place" readonly />
            </label>
            <label class="authoring-place-field">
              <span>Prefab</span>
              <select id="authoring-prefab"></select>
            </label>
            <label class="authoring-place-field">
              <span>Place scale</span>
              <input id="authoring-scale" type="number" step="0.1" value="1" />
            </label>
            <label class="authoring-place-field">
              <span>Place yaw deg</span>
              <input id="authoring-yaw" type="number" step="15" value="0" />
            </label>
            <label class="authoring-zone-field">
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
            <label class="authoring-zone-field">
              <span>Zone shape</span>
              <select id="authoring-zone-shape">
                <option value="sphere">sphere</option>
                <option value="box">box</option>
              </select>
            </label>
            <label class="authoring-zone-field">
              <span>Zone size</span>
              <input id="authoring-zone-size" type="number" step="1" value="10" />
            </label>
          </div>
          <div class="inline-summary authoring-zone-field">
            Zone volumes mark gameplay areas like spawn, safe, loot, encounter, objective, or trigger regions.
          </div>
          <div id="authoring-prefab-summary" class="inline-summary"></div>
          <details class="subsection" open>
            <summary>Prefab Library</summary>
            <div id="authoring-palette" class="prefab-palette"></div>
          </details>
          <div class="controls">
            <button id="undo-authoring" class="secondary">Undo</button>
            <button id="apply-selected-transform" class="secondary">Apply To Selected</button>
            <button id="delete-selected" class="secondary">Delete Selected</button>
          </div>
          </div>
        </details>
        <details id="inspector-section" class="section tool-section" data-pane="world">
          <summary class="section-head">
            <h2>Stamps</h2>
            <span>Advanced reusable world chunks</span>
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
        <details class="section tool-section" data-pane="world">
          <summary class="section-head">
            <h2>Recipes</h2>
            <span>Advanced starter world recipes</span>
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
        <details class="section tool-section" data-pane="play">
          <summary class="section-head">
            <h2>Features</h2>
            <span>Runtime feature toggles</span>
          </summary>
          <div class="section-body">
            <div id="feature-toggles" class="feature-toggle-list"></div>
            <div class="inline-summary">Feature toggles rebuild the active runtime immediately.</div>
          </div>
        </details>
        <textarea id="command-script" hidden spellcheck="false"></textarea>
        <details class="section tool-section" data-pane="world">
          <summary class="section-head">
            <h2>Inspector</h2>
            <span>Selected entity or zone</span>
          </summary>
          <div class="section-body">
            <pre id="inspector"></pre>
          </div>
        </details>
        <details class="section tool-section" data-pane="world" open>
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
        <details class="section tool-section" data-pane="world">
          <summary class="section-head">
            <h2>Evaluation</h2>
            <span>World checks</span>
          </summary>
          <div class="section-body">
            <pre id="evaluation"></pre>
          </div>
        </details>
        <details class="section tool-section" data-pane="debug">
          <summary class="section-head">
            <h2>Diagnostics</h2>
            <span>Live state</span>
          </summary>
          <div class="section-body">
            <pre id="diagnostics"></pre>
          </div>
        </details>
        <details class="section tool-section" data-pane="debug">
          <summary class="section-head">
            <h2>Session</h2>
            <span>Advanced runtime details</span>
          </summary>
          <div class="section-body">
            <pre id="session"></pre>
          </div>
        </details>
        <details class="section tool-section" data-pane="debug">
          <summary class="section-head">
            <h2>Sectors</h2>
            <span>Population/debug</span>
          </summary>
          <div class="section-body">
            <pre id="sector-status"></pre>
          </div>
        </details>
        <details class="section tool-section" data-pane="debug">
          <summary class="section-head">
            <h2>Asset Runtime</h2>
            <span>Validation/runtime</span>
          </summary>
          <div class="section-body">
            <pre id="asset-status"></pre>
          </div>
        </details>
        <details class="section tool-section" data-pane="assets" open>
          <summary class="section-head">
            <h2>Assets</h2>
            <span>Prep prefab visuals</span>
          </summary>
          <div class="section-body">
            <div class="authoring-flow-note">
              Use this tab to line a prefab up with the floor, preview motion, and save clean defaults back to the
              prefab. Animation mapping and collision setup are still here, but tucked below unless you need them.
            </div>
            <div class="asset-fit-shell">
              <div class="authoring-step">
                <div class="authoring-step-label">1. Pick asset</div>
                <div class="controls inline-controls">
                  <button id="asset-fit-prev" class="secondary" type="button">Prev</button>
                  <button id="asset-fit-next" class="secondary" type="button">Next</button>
                </div>
                <label>
                  <span>Model prefab</span>
                  <select id="asset-fit-prefab"></select>
                </label>
                <button id="asset-fit-reset" class="secondary" type="button">Reload Prefab Defaults</button>
              </div>
              <div class="authoring-step">
                <div class="authoring-step-label">2. Preview motion</div>
                <label>
                  <span>Preview animation</span>
                  <select id="asset-fit-animation"></select>
                </label>
                <label>
                  <span>Preview speed</span>
                  <input id="asset-fit-anim-speed" type="number" step="0.1" min="0" value="1" />
                </label>
                <button id="asset-fit-preview" type="button">Refresh Preview</button>
              </div>
              <div class="authoring-step">
                <div class="authoring-step-label">3. Fit to floor</div>
                <div class="inline-summary">
                  Adjust scale, facing, and vertical lift until the model reads correctly in the preview, then save it
                  back to the prefab.
                </div>
                <div class="generation-grid">
                  <label>
                    <span>Scale</span>
                    <input id="asset-fit-scale" type="number" step="0.001" value="1" />
                  </label>
                  <label>
                    <span>Yaw deg</span>
                    <input id="asset-fit-yaw" type="number" step="1" value="0" />
                  </label>
                  <label>
                    <span>Offset Y</span>
                    <input id="asset-fit-offset-y" type="number" step="0.01" value="0" />
                  </label>
                </div>
                <div class="controls compact-controls">
                  <button id="asset-fit-apply" type="button">Save Fit To Prefab</button>
                </div>
              </div>
            </div>
            <details class="subsection">
              <summary>Animation Binding</summary>
              <div class="inline-summary">
                Use this only when an imported clip needs to be mapped onto a semantic slot like idle, walk, run, or
                attack.
              </div>
              <div class="generation-grid">
              <label>
                <span>Semantic slot</span>
                <select id="asset-fit-bind-state"></select>
              </label>
              <label>
                <span>Imported clip</span>
                <select id="asset-fit-bind-clip"></select>
              </label>
              <label>
                <span>Saved clip speed</span>
                <input id="asset-fit-bind-speed" type="number" step="0.1" min="0" value="1" />
              </label>
              </div>
              <div class="controls compact-controls">
                <button id="asset-fit-bind-apply" class="secondary" type="button">Save Clip Binding</button>
              </div>
            </details>
            <details class="subsection">
              <summary>Collision And Walkability</summary>
              <div class="inline-summary">
                Only change this when the prefab needs a custom blocking shape, sensor, or walkable surface. Most fit
                tweaks do not need collision edits.
              </div>
              <div class="generation-grid">
                <label>
                  <span>Shape</span>
                  <select id="asset-fit-collision-shape">
                    <option value="none">none</option>
                    <option value="compound">compound</option>
                    <option value="box">box</option>
                    <option value="cylinder">cylinder</option>
                    <option value="sphere">sphere</option>
                    <option value="capsule">capsule</option>
                  </select>
                </label>
                <label class="toggle inline-toggle">
                  <input id="asset-fit-solid" type="checkbox" checked />
                  <span>Solid (blocks movement)</span>
                </label>
              </div>
              <div class="generation-grid">
                <label>
                  <span>Size X</span>
                  <input id="asset-fit-col-sx" type="number" step="0.1" value="1" />
                </label>
                <label>
                  <span>Size Y</span>
                  <input id="asset-fit-col-sy" type="number" step="0.1" value="1" />
                </label>
                <label>
                  <span>Size Z</span>
                  <input id="asset-fit-col-sz" type="number" step="0.1" value="1" />
                </label>
              </div>
              <div class="generation-grid">
                <label>
                  <span>Offset X</span>
                  <input id="asset-fit-col-ox" type="number" step="0.1" value="0" />
                </label>
                <label>
                  <span>Offset Y</span>
                  <input id="asset-fit-col-oy" type="number" step="0.1" value="0" />
                </label>
                <label>
                  <span>Offset Z</span>
                  <input id="asset-fit-col-oz" type="number" step="0.1" value="0" />
                </label>
              </div>
            </details>
            <div id="asset-fit-canvas" class="asset-fit-canvas" aria-label="Asset fit preview viewport"></div>
            <pre id="asset-fit-status" class="asset-fit-status"></pre>
          </div>
        </details>
        <details id="selection-section" class="section tool-section" data-pane="world">
          <summary class="section-head">
            <h2>Selection</h2>
            <span>Entity JSON</span>
          </summary>
          <div class="section-body">
            <pre id="selection"></pre>
          </div>
        </details>
        <details class="section tool-section" data-pane="debug">
          <summary class="section-head">
            <h2>Issues</h2>
            <span>Command/runtime</span>
          </summary>
          <div class="section-body">
            <pre id="issues"></pre>
          </div>
        </details>
        <details class="section tool-section" data-pane="play">
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
        <details class="section tool-section" data-pane="debug">
          <summary class="section-head">
            <h2>Iteration</h2>
            <span>Suggested next actions</span>
          </summary>
          <div class="section-body">
            <div id="iteration-suggestions" class="iteration-suggestions"></div>
          </div>
        </details>
        <details class="section tool-section" data-pane="debug">
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
        <div id="canvas-root" class="canvas-root" tabindex="0" aria-label="Groundtruth viewport">
          <div id="playtest-hud" class="playtest-hud"></div>
          <div id="workspace-status" class="workspace-status hidden"></div>
        </div>
        <img id="screenshot-preview" class="screenshot-preview" alt="Latest screenshot" />
      </main>
    </div>
    <input id="snapshot-file" type="file" accept="application/json" hidden />
    <input id="project-file" type="file" accept="application/json" hidden />
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
  const assetFitCanvasRoot = root.querySelector<HTMLElement>("#asset-fit-canvas");
  const shell = root.querySelector<HTMLElement>(".shell");
  const inspectorSection = root.querySelector<HTMLElement>("#inspector-section");
  const selectionSection = root.querySelector<HTMLElement>("#selection-section");
  const diagnosticsNode = root.querySelector<HTMLElement>("#diagnostics");
  const evaluationNode = root.querySelector<HTMLElement>("#evaluation");
  const sessionNode = root.querySelector<HTMLElement>("#session");
  const sectorStatusNode = root.querySelector<HTMLElement>("#sector-status");
  const sceneInventoryNode = root.querySelector<HTMLElement>("#scene-inventory");
  const authoringPaletteNode = root.querySelector<HTMLElement>("#authoring-palette");
  const authoringPrefabSummaryNode = root.querySelector<HTMLElement>("#authoring-prefab-summary");
  const featureTogglesNode = root.querySelector<HTMLElement>("#feature-toggles");
  const gameplayPolicySummaryNode = root.querySelector<HTMLElement>("#gameplay-policy-summary");
  const sceneSearchInput = root.querySelector<HTMLInputElement>("#scene-search");
  const sceneFilterInput = root.querySelector<HTMLSelectElement>("#scene-filter");
  const inspectorNode = root.querySelector<HTMLElement>("#inspector");
  const assetStatusNode = root.querySelector<HTMLElement>("#asset-status");
  const assetFitPrefabInput = root.querySelector<HTMLSelectElement>("#asset-fit-prefab");
  const assetFitAnimationInput = root.querySelector<HTMLSelectElement>("#asset-fit-animation");
  const assetFitBindStateInput = root.querySelector<HTMLSelectElement>("#asset-fit-bind-state");
  const assetFitBindClipInput = root.querySelector<HTMLSelectElement>("#asset-fit-bind-clip");
  const assetFitBindSpeedInput = root.querySelector<HTMLInputElement>("#asset-fit-bind-speed");
  const assetFitAnimSpeedInput = root.querySelector<HTMLInputElement>("#asset-fit-anim-speed");
  const assetFitScaleInput = root.querySelector<HTMLInputElement>("#asset-fit-scale");
  const assetFitYawInput = root.querySelector<HTMLInputElement>("#asset-fit-yaw");
  const assetFitOffsetYInput = root.querySelector<HTMLInputElement>("#asset-fit-offset-y");
  const assetFitStatusNode = root.querySelector<HTMLElement>("#asset-fit-status");
  const assetFitCollisionShapeInput = root.querySelector<HTMLSelectElement>("#asset-fit-collision-shape");
  const assetFitSolidInput = root.querySelector<HTMLInputElement>("#asset-fit-solid");
  const assetFitColSxInput = root.querySelector<HTMLInputElement>("#asset-fit-col-sx");
  const assetFitColSyInput = root.querySelector<HTMLInputElement>("#asset-fit-col-sy");
  const assetFitColSzInput = root.querySelector<HTMLInputElement>("#asset-fit-col-sz");
  const assetFitColOxInput = root.querySelector<HTMLInputElement>("#asset-fit-col-ox");
  const assetFitColOyInput = root.querySelector<HTMLInputElement>("#asset-fit-col-oy");
  const assetFitColOzInput = root.querySelector<HTMLInputElement>("#asset-fit-col-oz");
  const selectionNode = root.querySelector<HTMLElement>("#selection");
  const issuesNode = root.querySelector<HTMLElement>("#issues");
  const iterationSuggestionsNode = root.querySelector<HTMLElement>("#iteration-suggestions");
  const eventLogNode = root.querySelector<HTMLElement>("#event-log");
  const playtestStatusNode = root.querySelector<HTMLElement>("#playtest-status");
  const chromeStrip = root.querySelector<HTMLElement>("#chrome-strip");
  const toggleChromeButton = root.querySelector<HTMLButtonElement>("#toggle-chrome");
  const togglePauseButton = root.querySelector<HTMLButtonElement>("#toggle-pause");
  const toggleSidebarButton = root.querySelector<HTMLButtonElement>("#toggle-sidebar");
  const toggleHudButton = root.querySelector<HTMLButtonElement>("#toggle-hud");
  const chromeMenuButton = root.querySelector<HTMLButtonElement>("#chrome-menu-button");
  const chromeMenu = root.querySelector<HTMLElement>("#chrome-menu");
  const chromeMenuShell = root.querySelector<HTMLElement>(".chrome-menu-shell");
  const openDocsButton = root.querySelector<HTMLButtonElement>("#open-docs");
  const docsModal = root.querySelector<HTMLElement>("#docs-modal");
  const docsTitleNode = root.querySelector<HTMLElement>("#docs-title");
  const closeDocsButton = root.querySelector<HTMLButtonElement>("#close-docs");
  const docsNavNode = root.querySelector<HTMLElement>("#docs-nav");
  const docsContentNode = root.querySelector<HTMLElement>("#docs-content");
  const docsAudienceButtons = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-docs-audience]"));
  const paneButtons = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-pane-target]"));
  const toolSections = Array.from(root.querySelectorAll<HTMLDetailsElement>(".tool-section"));
  const commandScript = root.querySelector<HTMLTextAreaElement>("#command-script");
  const screenshotPreview = root.querySelector<HTMLImageElement>("#screenshot-preview");
  const playtestHud = root.querySelector<HTMLElement>("#playtest-hud");
  const workspaceStatusNode = root.querySelector<HTMLElement>("#workspace-status");
  const snapshotFileInput = root.querySelector<HTMLInputElement>("#snapshot-file");
  const projectFileInput = root.querySelector<HTMLInputElement>("#project-file");
  const projectNameInput = root.querySelector<HTMLInputElement>("#project-name");
  const playtestLabelInput = root.querySelector<HTMLInputElement>("#playtest-label");
  const playtestNoteInput = root.querySelector<HTMLInputElement>("#playtest-note");
  const projectTemplateInput = root.querySelector<HTMLSelectElement>("#project-template");
  const projectTemplateSummaryNode = root.querySelector<HTMLElement>("#project-template-summary");
  const projectWorldInput = root.querySelector<HTMLSelectElement>("#project-world");
  const projectWorldSummaryNode = root.querySelector<HTMLElement>("#project-world-summary");
  const projectSaveSummaryNode = root.querySelector<HTMLElement>("#project-save-summary");
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
  const authoringToolInput = root.querySelector<HTMLInputElement>("#authoring-tool");
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
  const toggleHudStatusInput = root.querySelector<HTMLInputElement>("#toggle-hud-status");
  const toggleHudFindingsInput = root.querySelector<HTMLInputElement>("#toggle-hud-findings");
  const toggleHudEvaluationInput = root.querySelector<HTMLInputElement>("#toggle-hud-evaluation");
  const toggleHudDebugInput = root.querySelector<HTMLInputElement>("#toggle-hud-debug");

  if (
    !canvasRoot ||
    !assetFitCanvasRoot ||
    !shell ||
    !inspectorSection ||
    !selectionSection ||
    !diagnosticsNode ||
    !evaluationNode ||
    !sessionNode ||
    !sectorStatusNode ||
    !sceneInventoryNode ||
    !authoringPaletteNode ||
    !authoringPrefabSummaryNode ||
    !featureTogglesNode ||
    !gameplayPolicySummaryNode ||
    !sceneSearchInput ||
    !sceneFilterInput ||
    !inspectorNode ||
    !assetStatusNode ||
    !assetFitPrefabInput ||
    !assetFitAnimationInput ||
    !assetFitBindStateInput ||
    !assetFitBindClipInput ||
    !assetFitBindSpeedInput ||
    !assetFitAnimSpeedInput ||
    !assetFitScaleInput ||
    !assetFitYawInput ||
    !assetFitOffsetYInput ||
    !assetFitStatusNode ||
    !assetFitCollisionShapeInput ||
    !assetFitSolidInput ||
    !assetFitColSxInput ||
    !assetFitColSyInput ||
    !assetFitColSzInput ||
    !assetFitColOxInput ||
    !assetFitColOyInput ||
    !assetFitColOzInput ||
    !selectionNode ||
    !issuesNode ||
    !iterationSuggestionsNode ||
    !eventLogNode ||
    !playtestStatusNode ||
    !chromeStrip ||
    !toggleChromeButton ||
    !togglePauseButton ||
    !toggleSidebarButton ||
    !toggleHudButton ||
    !chromeMenuButton ||
    !chromeMenu ||
    !chromeMenuShell ||
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
    !workspaceStatusNode ||
    !snapshotFileInput ||
    !projectFileInput ||
    !projectNameInput ||
    !playtestLabelInput ||
    !playtestNoteInput ||
    !projectTemplateInput ||
    !projectTemplateSummaryNode ||
    !projectWorldInput ||
    !projectWorldSummaryNode ||
    !projectSaveSummaryNode ||
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
    !authoringToolInput ||
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
    !toggleSectorsInput ||
    !toggleHudStatusInput ||
    !toggleHudFindingsInput ||
    !toggleHudEvaluationInput ||
    !toggleHudDebugInput
  ) {
    throw new Error("UI bootstrap failed.");
  }

  const remapAssetUri = (uri: string): string => {
    switch (uri) {
      case "/assets/urban_models/Cones%20%26%20Barriers/Concrete%20Barriers/Jersey_barrier.glb":
        return "/assets/urban_runtime/props/jersey_barrier.glb";
      case "/assets/urban_models/Cones%20%26%20Barriers/Cones/Construction_cone.glb":
        return "/assets/urban_runtime/props/construction_cone.glb";
      case "/assets/urban_models/Walls%20%26%20Fences/metal_fence/metalfence_both_sides_topbar.glb":
        return "/assets/urban_runtime/props/metal_fence.glb";
      case "/assets/urban_models/Walls%20%26%20Fences/plaster_wall/plaster_wall.glb":
        return "/assets/urban_runtime/props/plaster_wall.glb";
      default:
        return uri;
    }
  };

  const migrateWorldPrefabAssetUris = (world: WorldDocument): WorldDocument => {
    const prefabs = Object.fromEntries(
      Object.entries(world.prefabs).map(([prefabId, prefab]) => {
        const render = prefab.components?.render;
        const nextComponents = { ...prefab.components };
        let mutated = false;
        if (
          (prefabId === "urban_road_straight" || prefabId === "urban_road_junction") &&
          !isUrbanRoadWalkPhysics(nextComponents?.physics)
        ) {
          nextComponents.physics = createUrbanRoadWalkPhysics();
          mutated = true;
        }
        if (
          (prefabId === "urban_road_straight" || prefabId === "urban_road_junction") &&
          render &&
          render.type === "model" &&
          render.modelOffset?.y !== 0
        ) {
          nextComponents.render = {
            ...render,
            modelOffset: {
              x: render.modelOffset?.x ?? 0,
              y: 0,
              z: render.modelOffset?.z ?? 0,
            },
          };
          mutated = true;
        }
        if (!render || render.type !== "model") {
          return [
            prefabId,
            !mutated
              ? prefab
              : {
                  ...prefab,
                  components: nextComponents,
                },
          ];
        }
        const nextUri = remapAssetUri(render.uri);
        if (nextUri === render.uri && !mutated) {
          return [prefabId, prefab];
        }
        return [
          prefabId,
          {
            ...prefab,
            components: {
              ...nextComponents,
              render: {
                ...(nextComponents.render && nextComponents.render.type === "model" ? nextComponents.render : render),
                uri: nextUri,
              },
            },
          },
        ];
      }),
    );
    return {
      ...world,
      prefabs,
    };
  };

  const migrateProjectPrefabAssetUris = (project: ProjectDocument): ProjectDocument => ({
    ...project,
    worlds: Object.fromEntries(
      Object.entries(project.worlds).map(([worldId, world]) => [worldId, migrateWorldPrefabAssetUris(world)]),
    ),
  });

  const bootConfig = readBootConfig();
  const bootProject = await loadBootProject(bootConfig);
  const migratedBootProject = bootProject ? migrateProjectPrefabAssetUris(bootProject) : null;
  const autosavedProject = bootConfig.mode === "player" ? null : loadEditorAutosaveProject();
  const migratedAutosavedProject = autosavedProject ? migrateProjectPrefabAssetUris(autosavedProject) : null;
  const store = new WorldStore(migratedBootProject  ?? migratedAutosavedProject  ?? makeFlatOutpostWorld());
  let projectSaveHandle: SaveFileHandleLike | null = null;
  let lastSavedProjectSignature: string | null = bootConfig.mode === "player"
    ? null
    : migratedAutosavedProject
      ? null
      : JSON.stringify(store.getProject());
  let lastSavedAt: string | null = null;
  let lastSavedTarget = migratedAutosavedProject ? "Autosave recovery" : null as string | null;
  let interactionMode: "play" | "edit" = "play";
  let editTool: "select" | "place" | "move" | "rotate" | "resize" | "zone" = "select";
  const hudVisibility = {
    status: true,
    findings: true,
    evaluation: true,
    debug: true,
  };
  const scene = new SceneRuntime(canvasRoot, (selection: SelectionTarget) => {
    if (interactionMode !== "edit" || editTool !== "select") {
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
  const assetFitScene = new SceneRuntime(assetFitCanvasRoot, () => {
    // Asset fit preview is read-only.
  });
  const physics = await PhysicsRuntime.create(store.getWorld().settings.gravity.y);
  const input = new InputController();
  let runtimeModule = createRuntimeModule(store.getWorld().gameMode);
  let lastFrameTime = performance.now();
  let sidebarCollapsed = true;
  let hudVisible = true;
  let gameplayPaused = false;
  let chromeCollapsed = false;
  let chromeMenuOpen = false;
  type SidebarPane = "project" | "world" | "play" | "assets" | "debug";
  const isEditingPane = (pane: SidebarPane): boolean => pane === "project" || pane === "world" || pane === "assets";
  let activeSidebarPane: SidebarPane = "play";
  let activeHelpAudience: HelpAudience = "human";
  let activeHelpSectionId = helpContentByAudience.human[0]?.id  ?? "";
  let pendingWorldRebuild = false;
  let worldSwapState: "idle" | "queued" | "rebuilding" | "loading" | "failed" = "idle";
  let stressCooldownFrames = 0;
  let assetFitBoundPrefabId = "";
  let assetFitAvailableOptions: Array<{ value: string; label: string }> = [];
  let assetFitLockedCompoundShape: import("./core/schema").PhysicsShape | null = null;
  let assetFitLockedCompoundChildCount = 0;
  let selectedTransformBoundEntityId: string | null = null;
  let selectedZoneBoundZoneId: string | null = null;
  let placedEntityCounter = 1;
  let placedZoneCounter = 1;
  let moveDragActive = false;
  let rotateDragActive = false;
  let resizeDragActive = false;
  const editorUndoStack: Array<{
    world: ReturnType<WorldStore["getWorld"]>;
    selectedEntityId: string | null;
    selectedZoneId: string | null;
    label: string;
  }> = [];
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

  const getCurrentProjectSignature = (): string => JSON.stringify(store.getProject());

  const isProjectDirty = (): boolean =>
    lastSavedProjectSignature === null || getCurrentProjectSignature() !== lastSavedProjectSignature;

  const markProjectSaved = (target: string): void => {
    lastSavedProjectSignature = getCurrentProjectSignature();
    lastSavedAt = new Date().toISOString();
    lastSavedTarget = target;
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

  const mergePrefabOverrides = (
    baseWorld: WorldDocument,
    sourceWorld: WorldDocument,
  ): WorldDocument => ({
    ...baseWorld,
    prefabs: Object.fromEntries(
      Object.entries({
        ...baseWorld.prefabs,
        ...sourceWorld.prefabs,
      }).map(([prefabId, prefab]) => {
        const basePrefab = baseWorld.prefabs[prefabId];
        const render = prefab.components?.render;
        const baseRender = basePrefab?.components?.render;
        return [
          prefabId,
          {
            ...prefab,
            components: {
              ...prefab.components,
              render: render && render.type === "model"
                ? {
                    ...render,
                    uri: baseRender && baseRender.type === "model" ? baseRender.uri : render.uri,
                    format: baseRender && baseRender.type === "model" ? baseRender.format : render.format,
                    animationSources: baseRender && baseRender.type === "model"
                      ? baseRender.animationSources
                      : render.animationSources,
                    clips: baseRender && baseRender.type === "model"
                      ? baseRender.clips
                      : render.clips,
                  }
                : render,
            },
          },
        ];
      }),
    ),
  });

  const getSelectedZone = (world = store.peekWorld()) =>
    selectedZoneId ? world.zones.find((zone) => zone.id === selectedZoneId)  ?? null : null;

  const selectEntity = (entityId: string | null): void => {
    selectedZoneId = null;
    store.selectEntity(entityId);
    scene.setSelectionState(entityId, null);
    syncAssetFitPrefabToSelection();
  };

  const selectZone = (zoneId: string | null): void => {
    selectedZoneId = zoneId;
    scene.setSelectionState(null, zoneId);
    if (store.getSelectedEntityId() !== null) {
      store.selectEntity(null);
      return;
    }
    syncSelectedZoneInputs();
    refreshSidebar();
  };

  const pushEditorUndo = (label: string): void => {
    editorUndoStack.push({
      world: store.getWorld(),
      selectedEntityId: store.getSelectedEntityId(),
      selectedZoneId,
      label,
    });
    if (editorUndoStack.length > 48) {
      editorUndoStack.shift();
    }
    syncAuthoringMode();
  };

  const undoAuthoringChange = (): void => {
    const previous = editorUndoStack.pop();
    if (!previous) {
      appendEvent("Undo skipped: no earlier authoring change.");
      return;
    }
    store.setWorld(previous.world);
    selectedZoneId = previous.selectedZoneId;
    store.selectEntity(previous.selectedEntityId);
    scene.setSelectionState(previous.selectedEntityId, previous.selectedZoneId);
    syncAuthoringMode();
    appendEvent(`Undid authoring change: ${previous.label}.`);
  };

  const ensureValidSelection = (): void => {
    const world = store.peekWorld();
    if (selectedZoneId && !world.zones.some((zone) => zone.id === selectedZoneId)) {
      selectedZoneId = null;
    }
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
    authoringScaleInput.value = String(resolved.transform.scale?.x  ?? 1);
    authoringYawInput.value = String(((resolved.transform.rotation?.y  ?? 0) * 180) / Math.PI);
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

  const applySelectedEntityTransform = (): void => {
    const selectedEntityId = store.getSelectedEntityId();
    const selectedZone = getSelectedZone();
    if (!selectedEntityId && !selectedZone) {
      appendEvent("Transform apply skipped: no selected entity or zone.");
      return;
    }
    pushEditorUndo("apply selected transform");
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
    const scale = readNumber(authoringScaleInput.value, entity.transform.scale?.x  ?? 1);
    const yawDegrees = readNumber(authoringYawInput.value, ((entity.transform.rotation?.y  ?? 0) * 180) / Math.PI);
    store.updateEntityTransform(
      selectedEntityId,
      {
        rotation: makeVec3(
          entity.transform.rotation?.x  ?? 0,
          (yawDegrees * Math.PI) / 180,
          entity.transform.rotation?.z  ?? 0,
        ),
        scale: makeVec3(scale, scale, scale),
      },
      true,
    );
    appendEvent(`Applied transform to '${selectedEntityId}'.`);
  };

  const syncAuthoringMode = (): void => {
    const playButton = root.querySelector<HTMLButtonElement>("#mode-play");
    const editButton = root.querySelector<HTMLButtonElement>("#mode-edit");
    const selectButton = root.querySelector<HTMLButtonElement>("#mode-select");
    const placeButton = root.querySelector<HTMLButtonElement>("#mode-place");
    const moveButton = root.querySelector<HTMLButtonElement>("#mode-move");
    const rotateButton = root.querySelector<HTMLButtonElement>("#mode-rotate");
    const resizeButton = root.querySelector<HTMLButtonElement>("#mode-resize");
    const zoneButton = root.querySelector<HTMLButtonElement>("#mode-zone");
    const authoringShell = root.querySelector<HTMLElement>(".authoring-shell");
    const undoButton = root.querySelector<HTMLButtonElement>("#undo-authoring");
    const transformButton = root.querySelector<HTMLButtonElement>("#apply-selected-transform");
    const deleteButton = root.querySelector<HTMLButtonElement>("#delete-selected");
    const placeFields = Array.from(root.querySelectorAll<HTMLElement>(".authoring-place-field"));
    const zoneFields = Array.from(root.querySelectorAll<HTMLElement>(".authoring-zone-field"));
    authoringModeInput.value = interactionMode;
    authoringToolInput.value = interactionMode === "edit" ? editTool : "n/a";
    if (editTool !== "move" && editTool !== "rotate" && editTool !== "resize") {
      stopAuthoringDrag();
    }
    const editControlsDisabled = interactionMode !== "edit";
    authoringPrefabInput.disabled = editControlsDisabled;
    authoringScaleInput.disabled = editControlsDisabled;
    authoringYawInput.disabled = editControlsDisabled;
    authoringZoneKindInput.disabled = editControlsDisabled;
    authoringZoneShapeInput.disabled = editControlsDisabled;
    authoringZoneSizeInput.disabled = editControlsDisabled;
    if (playButton) {
      playButton.classList.toggle("active", interactionMode === "play");
    }
    if (editButton) {
      editButton.classList.toggle("active", interactionMode === "edit");
    }
    for (const [button, tool] of [
      [selectButton, "select"],
      [placeButton, "place"],
      [moveButton, "move"],
      [rotateButton, "rotate"],
      [resizeButton, "resize"],
      [zoneButton, "zone"],
    ] as const) {
      if (!button) {
        continue;
      }
      button.disabled = editControlsDisabled;
      button.classList.toggle("active", interactionMode === "edit" && editTool === tool);
    }
    authoringShell?.classList.toggle("edit-active", interactionMode === "edit");
    const showPlaceFields = interactionMode === "edit" && editTool === "place";
    const showZoneFields = interactionMode === "edit" && editTool === "zone";
    for (const field of placeFields) {
      field.toggleAttribute("hidden", !showPlaceFields);
    }
    for (const field of zoneFields) {
      field.toggleAttribute("hidden", !showZoneFields);
    }
    undoButton!.disabled = editControlsDisabled || editorUndoStack.length === 0;
    transformButton!.disabled = editControlsDisabled;
    deleteButton!.disabled = editControlsDisabled;
    scene.setViewportSelectionEnabled(interactionMode === "edit" && editTool === "select");
    if (interactionMode === "play") {
      scene.clearEditorPreview();
      scene.setSelectionState(null, null);
      requestAnimationFrame(() => canvasRoot.focus());
    } else {
      scene.setSelectionState(store.getSelectedEntityId(), selectedZoneId);
      refreshEditorPreview();
    }
  };

  const syncAuthoringPrefabs = (): void => {
    const world = store.peekWorld();
    const prefabIds = Object.keys(world.prefabs).sort();
    const currentValue = authoringPrefabInput.value || prefabIds[0] || "";
    authoringPrefabInput.innerHTML = prefabIds
      .map((prefabId) => {
        const prefab = world.prefabs[prefabId];
        const label = prefab?.name  ?? prefabId;
        return `<option value="${escapeHtml(prefabId)}">${escapeHtml(label)}</option>`;
      })
      .join("");
    authoringPrefabInput.value = prefabIds.includes(currentValue) ? currentValue : prefabIds[0]  ?? "";
    const selectedPrefab = world.prefabs[authoringPrefabInput.value];
    authoringPrefabSummaryNode.innerHTML = selectedPrefab
      ? [
        renderOverviewRow("Selected", selectedPrefab.name),
        renderOverviewRow("Id", selectedPrefab.id),
        renderOverviewRow("Category", selectedPrefab.category  ?? "uncategorized"),
        renderOverviewRow("Library", `${prefabIds.length} prefabs below`),
      ].join("")
      : '<div class="inventory-empty">No prefabs available in the current world.</div>';
    authoringPaletteNode.innerHTML = renderPrefabPalette(world, authoringPrefabInput.value);
  };

  const listModelPrefabIds = (world = store.peekWorld()): string[] =>
    Object.keys(world.prefabs)
      .filter((prefabId) => world.prefabs[prefabId]?.components?.render?.type === "model")
      .sort();

  const getAssetFitPrefab = () => {
    const world = store.peekWorld();
    const prefabId = assetFitPrefabInput.value;
    const prefab = world.prefabs[prefabId];
    const render = prefab?.components?.render;
    if (!prefab || !render || render.type !== "model") {
      return null;
    }
    return { prefabId, prefab, render };
  };

  function syncAssetFitPrefabToSelection(): void {
    const selectedEntityId = store.getSelectedEntityId();
    if (!selectedEntityId) {
      return;
    }
    const entity = store.peekWorld().entities.find((item) => item.id === selectedEntityId);
    const prefabId = entity?.prefabId;
    if (!prefabId) {
      return;
    }
    const prefab = store.peekWorld().prefabs[prefabId];
    if (!prefab || prefab.components?.render?.type !== "model") {
      return;
    }
    if (assetFitPrefabInput!.value === prefabId) {
      return;
    }
    assetFitPrefabInput!.value = prefabId;
    syncAssetFitInputs(true);
    refreshAssetFitPreview();
    appendEvent(`Asset fit synced to selected prefab '${prefabId}'.`);
  }

  const parseAssetFitAnimationSelection = (
    selectedValue: string,
    render: ModelRenderComponent,
    speed?: number,
  ): { animation: AnimationComponent; render: ModelRenderComponent } => {
    const animSpeed = speed != null && speed !== 1 ? speed : undefined;
    if (selectedValue.startsWith("raw:")) {
      const clipName = selectedValue.slice(4);
      return {
        animation: {
          state: "__preview__",
          loop: "repeat",
          fadeSeconds: 0.12,
          speed: animSpeed,
        },
        render: {
          ...render,
          clips: {
            ...(render.clips  ?? {}),
            __preview__: clipName,
          },
        },
      };
    }
    return {
      animation: {
        state: selectedValue || "idle",
        loop: ["attack", "death", "hurt", "rise"].includes(selectedValue) ? "once" : "repeat",
        fadeSeconds: 0.12,
        speed: animSpeed,
      },
      render,
    };
  };

  const syncAssetFitPrefabs = (): void => {
    const prefabIds = listModelPrefabIds();
    const nextValue = prefabIds.includes(assetFitPrefabInput.value)
      ? assetFitPrefabInput.value
      : prefabIds[0]  ?? "";
    assetFitPrefabInput.innerHTML = prefabIds
      .map((prefabId) => `<option value="${escapeHtml(prefabId)}">${escapeHtml(store.peekWorld().prefabs[prefabId]?.name  ?? prefabId)}</option>`)
      .join("");
    assetFitPrefabInput.value = nextValue;
  };

  const syncAssetFitInputs = (force = false): void => {
    const assetFitPrefab = getAssetFitPrefab();
    const prefabId = assetFitPrefab?.prefabId  ?? "";
    if (!force && prefabId === assetFitBoundPrefabId) {
      return;
    }
    assetFitBoundPrefabId = prefabId;
    if (!assetFitPrefab) {
      assetFitLockedCompoundShape = null;
      assetFitLockedCompoundChildCount = 0;
      assetFitScaleInput.value = "1";
      assetFitYawInput.value = "0";
      assetFitOffsetYInput.value = "0";
      assetFitAnimationInput.innerHTML = "";
      assetFitBindSpeedInput.value = "1";
      assetFitAnimSpeedInput.value = "1";
      assetFitAvailableOptions = [];
      assetFitCollisionShapeInput.value = "none";
      assetFitSolidInput.checked = true;
      assetFitColSxInput.value = "1";
      assetFitColSyInput.value = "1";
      assetFitColSzInput.value = "1";
      return;
    }
    assetFitScaleInput.value = String(assetFitPrefab.render.modelScale?.x  ?? 1);
    assetFitYawInput.value = String(((assetFitPrefab.render.modelRotation?.y  ?? 0) * 180) / Math.PI);
    assetFitOffsetYInput.value = String(assetFitPrefab.render.modelOffset?.y  ?? 0);
    assetFitBindSpeedInput.value = "1";
    assetFitAnimSpeedInput.value = "1";

    // Populate collision fields from prefab physics component
    const physics = assetFitPrefab.prefab.components?.physics;
    assetFitLockedCompoundShape = null;
    assetFitLockedCompoundChildCount = 0;
    const resetCollisionOffsets = () => {
      assetFitColOxInput.value = "0";
      assetFitColOyInput.value = "0";
      assetFitColOzInput.value = "0";
    };
    if (physics && physics.shape.type === "compound" && physics.shape.children.length === 1) {
      // Single-child compound = a shape with an offset
      const child = physics.shape.children[0];
      assetFitCollisionShapeInput.value = child.shape.type;
      assetFitSolidInput.checked = !physics.sensor;
      assetFitColOxInput.value = String(child.offset.x);
      assetFitColOyInput.value = String(child.offset.y);
      assetFitColOzInput.value = String(child.offset.z);
      if (child.shape.type === "box") {
        assetFitColSxInput.value = String(child.shape.size.x);
        assetFitColSyInput.value = String(child.shape.size.y);
        assetFitColSzInput.value = String(child.shape.size.z);
      } else if (child.shape.type === "cylinder" || child.shape.type === "capsule") {
        assetFitColSxInput.value = String(child.shape.radius);
        assetFitColSyInput.value = String(child.shape.halfHeight * 2);
        assetFitColSzInput.value = String(child.shape.radius);
      } else if (child.shape.type === "sphere") {
        assetFitColSxInput.value = String(child.shape.radius);
        assetFitColSyInput.value = String(child.shape.radius);
        assetFitColSzInput.value = String(child.shape.radius);
      }
    } else if (physics && physics.shape.type === "compound") {
      assetFitLockedCompoundShape = JSON.parse(JSON.stringify(physics.shape)) as import("./core/schema").PhysicsShape;
      assetFitLockedCompoundChildCount = physics.shape.children.length;
      assetFitCollisionShapeInput.value = "compound";
      assetFitSolidInput.checked = !physics.sensor;
      assetFitColSxInput.value = "0";
      assetFitColSyInput.value = "0";
      assetFitColSzInput.value = "0";
      resetCollisionOffsets();
    } else if (physics && physics.shape.type !== "compound") {
      assetFitCollisionShapeInput.value = physics.shape.type;
      assetFitSolidInput.checked = !physics.sensor;
      resetCollisionOffsets();
      if (physics.shape.type === "box") {
        assetFitColSxInput.value = String(physics.shape.size.x);
        assetFitColSyInput.value = String(physics.shape.size.y);
        assetFitColSzInput.value = String(physics.shape.size.z);
      } else if (physics.shape.type === "cylinder" || physics.shape.type === "capsule") {
        assetFitColSxInput.value = String(physics.shape.radius);
        assetFitColSyInput.value = String(physics.shape.halfHeight * 2);
        assetFitColSzInput.value = String(physics.shape.radius);
      } else if (physics.shape.type === "sphere") {
        assetFitColSxInput.value = String(physics.shape.radius);
        assetFitColSyInput.value = String(physics.shape.radius);
        assetFitColSzInput.value = String(physics.shape.radius);
      }
    } else if (!physics) {
      assetFitCollisionShapeInput.value = "none";
      assetFitSolidInput.checked = true;
      assetFitColSxInput.value = "1";
      assetFitColSyInput.value = "1";
      assetFitColSzInput.value = "1";
      resetCollisionOffsets();
    }
    const compoundLocked = assetFitCollisionShapeInput.value === "compound";
    assetFitSolidInput.disabled = compoundLocked;
    assetFitColSxInput.disabled = compoundLocked;
    assetFitColSyInput.disabled = compoundLocked;
    assetFitColSzInput.disabled = compoundLocked;
    assetFitColOxInput.disabled = compoundLocked;
    assetFitColOyInput.disabled = compoundLocked;
    assetFitColOzInput.disabled = compoundLocked;

    const semanticStates = Array.from(
      new Set([
        ...Object.keys(assetFitPrefab.render.clips  ?? {}),
        "idle",
      ]),
    );
    assetFitAvailableOptions = semanticStates.map((state) => ({
      value: state,
      label: `state:${state}`,
    }));
    assetFitAnimationInput.innerHTML = assetFitAvailableOptions
      .map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`)
      .join("");
    assetFitAnimationInput.value = semanticStates.includes("idle") ? "idle" : semanticStates[0]  ?? "";
    syncAssetFitBindingOptions();
  };

  const syncAssetFitAnimationOptions = (): void => {
    const selectedValue = assetFitAnimationInput.value;
    assetFitAnimationInput.innerHTML = assetFitAvailableOptions
      .map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`)
      .join("");
    assetFitAnimationInput.value = assetFitAvailableOptions.some((option) => option.value === selectedValue)
      ? selectedValue
      : assetFitAvailableOptions[0]?.value  ?? "";
  };

  const syncAssetFitBindingOptions = (): void => {
    const assetFitPrefab = getAssetFitPrefab();
    if (!assetFitPrefab) {
      assetFitBindStateInput.innerHTML = "";
      assetFitBindClipInput.innerHTML = "";
      assetFitBindSpeedInput.value = "1";
      return;
    }

    const semanticStates = Array.from(
      new Set([
        "idle",
        "walk",
        "run",
        "attack",
        "hurt",
        "death",
        "rise",
        ...Object.keys(assetFitPrefab.render.clips  ?? {}),
      ]),
    );
    const selectedState = assetFitBindStateInput.value || semanticStates[0] || "idle";
    assetFitBindStateInput.innerHTML = semanticStates
      .map((state) => `<option value="${escapeHtml(state)}">${escapeHtml(state)}</option>`)
      .join("");
    assetFitBindStateInput.value = semanticStates.includes(selectedState) ? selectedState : semanticStates[0]  ?? "idle";

    const previewReport = assetFitScene.getAssetFitPreviewReport();
    const clipNames = previewReport?.availableClipNames  ?? [];
    const currentBoundClip = assetFitPrefab.render.clips?.[assetFitBindStateInput.value]  ?? "";
    const selectedClip = assetFitBindClipInput.value || currentBoundClip || clipNames[0] || "";
    assetFitBindClipInput.innerHTML = clipNames
      .map((clipName) => `<option value="${escapeHtml(clipName)}">${escapeHtml(clipName)}</option>`)
      .join("");
    assetFitBindClipInput.value = clipNames.includes(selectedClip) ? selectedClip : clipNames[0]  ?? "";
    const savedSpeed = assetFitPrefab.render.clipSettings?.[assetFitBindStateInput.value]?.speed ?? 1;
    assetFitBindSpeedInput.value = String(savedSpeed);
  };

  const syncAssetFitAnimationSpeedInput = (): void => {
    const assetFitPrefab = getAssetFitPrefab();
    if (!assetFitPrefab) {
      assetFitAnimSpeedInput.value = "1";
      return;
    }
    const selectedValue = assetFitAnimationInput.value || "idle";
    if (selectedValue.startsWith("raw:")) {
      return;
    }
    const savedSpeed = assetFitPrefab.render.clipSettings?.[selectedValue]?.speed ?? 1;
    assetFitAnimSpeedInput.value = String(savedSpeed);
  };

  const updateAssetFitOptionsFromPreview = (): void => {
    const assetFitPrefab = getAssetFitPrefab();
    if (!assetFitPrefab) {
      assetFitAvailableOptions = [];
      syncAssetFitAnimationOptions();
      return;
    }
    const semanticStates = Array.from(
      new Set([
        ...Object.keys(assetFitPrefab.render.clips  ?? {}),
        "idle",
      ]),
    ).map((state) => ({
      value: state,
      label: `state:${state}`,
    }));
    const previewReport = assetFitScene.getAssetFitPreviewReport();
    const rawClips = (previewReport?.availableClipNames  ?? [])
      .map((clipName) => ({
        value: `raw:${clipName}`,
        label: `clip:${clipName}`,
      }));
    assetFitAvailableOptions = [...semanticStates, ...rawClips];
    syncAssetFitAnimationOptions();
    syncAssetFitBindingOptions();
    syncAssetFitAnimationSpeedInput();
  };

  const refreshAssetFitPreview = (): void => {
    const assetFitPrefab = getAssetFitPrefab();
    if (!assetFitPrefab) {
      assetFitScene.setAssetFitPreview(null, null, null);
      assetFitStatusNode.textContent = "Pick a model prefab to preview it on the floor and start fitting it.";
      return;
    }
    syncViewportSizes();
    const nextScale = readNumber(assetFitScaleInput.value, assetFitPrefab.render.modelScale?.x  ?? 1);
    const nextOffsetY = readNumber(assetFitOffsetYInput.value, assetFitPrefab.render.modelOffset?.y  ?? 0);
    const nextYawDegrees = readNumber(assetFitYawInput.value, ((assetFitPrefab.render.modelRotation?.y  ?? 0) * 180) / Math.PI);
    const adjustedRender: ModelRenderComponent = {
      ...assetFitPrefab.render,
      modelScale: makeVec3(nextScale, nextScale, nextScale),
      modelOffset: makeVec3(
        assetFitPrefab.render.modelOffset?.x  ?? 0,
        nextOffsetY,
        assetFitPrefab.render.modelOffset?.z  ?? 0,
      ),
      modelRotation: {
        x: assetFitPrefab.render.modelRotation?.x  ?? 0,
        y: (nextYawDegrees * Math.PI) / 180,
        z: assetFitPrefab.render.modelRotation?.z  ?? 0,
      },
    };
    const animSpeed = readNumber(assetFitAnimSpeedInput.value, 1);
    const previewChoice = parseAssetFitAnimationSelection(assetFitAnimationInput.value || "idle", adjustedRender, animSpeed);
    const previewPhysics = buildAssetFitPhysicsShape();
    const previewSensor = !assetFitSolidInput.checked;
    assetFitScene.setAssetFitPreview(
      assetFitPrefab.prefabId,
      assetFitPrefab.prefab.name,
      previewChoice.render,
      previewChoice.animation,
      previewPhysics,
      previewSensor,
    );
    const previewReport = assetFitScene.getAssetFitPreviewReport();
    const sensorNote = previewPhysics
      ? previewSensor
        ? "Collision mode: sensor (non-blocking)."
        : "Collision mode: solid (blocks movement)."
      : "Collision mode: none.";
    const collisionNote = assetFitCollisionShapeInput.value === "compound"
      ? `Collision: compound (${assetFitLockedCompoundChildCount} children). Previewed from prefab and read-only in Asset Fit.`
      : "";
    assetFitStatusNode.textContent = previewReport
      ? [
          `Preview ready for '${assetFitPrefab.prefab.name}'.`,
          formatSingleAssetReport(previewReport),
          sensorNote,
          collisionNote,
        ].filter(Boolean).join("\n")
      : [ `Previewing '${assetFitPrefab.prefab.name}' on the floor.`, sensorNote, collisionNote ].filter(Boolean).join("\n");
    updateAssetFitOptionsFromPreview();
  };

  const buildAssetFitPrimitiveShape = (): import("./core/schema").PhysicsPrimitiveShape | null => {
    const shapeType = assetFitCollisionShapeInput.value;
    if (shapeType === "none" || shapeType === "compound") return null;
    const sx = readNumber(assetFitColSxInput.value, 1);
    const sy = readNumber(assetFitColSyInput.value, 1);
    const sz = readNumber(assetFitColSzInput.value, 1);
    switch (shapeType) {
      case "box":
        return { type: "box", size: makeVec3(sx, sy, sz) };
      case "cylinder":
        return { type: "cylinder", radius: sx, halfHeight: sy * 0.5 };
      case "capsule":
        return { type: "capsule", radius: sx, halfHeight: sy * 0.5 };
      case "sphere":
        return { type: "sphere", radius: sx };
      default:
        return null;
    }
  };

  const buildAssetFitCollisionOffset = () => ({
    x: readNumber(assetFitColOxInput.value, 0),
    y: readNumber(assetFitColOyInput.value, 0),
    z: readNumber(assetFitColOzInput.value, 0),
  });

  const buildAssetFitPhysicsShape = (): import("./core/schema").PhysicsShape | null => {
    if (assetFitCollisionShapeInput.value === "compound") {
      return assetFitLockedCompoundShape ? JSON.parse(JSON.stringify(assetFitLockedCompoundShape)) as import("./core/schema").PhysicsShape : null;
    }
    const primitive = buildAssetFitPrimitiveShape();
    if (!primitive) return null;
    const offset = buildAssetFitCollisionOffset();
    const hasOffset = offset.x !== 0 || offset.y !== 0 || offset.z !== 0;
    if (hasOffset) {
      return {
        type: "compound",
        children: [{ shape: primitive, offset }],
      };
    }
    return primitive;
  };

  const buildAssetFitPhysicsComponent = (): { body: string; shape: Record<string, unknown>; sensor?: boolean } | undefined => {
    const shape = buildAssetFitPhysicsShape();
    if (!shape) return undefined;
    const isSensor = !assetFitSolidInput.checked;
    const existingBody = getAssetFitPrefab()?.prefab.components?.physics?.body  ?? "static";
    return { body: existingBody, shape: shape as unknown as Record<string, unknown>, ...(isSensor ? { sensor: true } : {}) };
  };

  const applyAssetFitToPrefab = (): void => {
    const assetFitPrefab = getAssetFitPrefab();
    if (!assetFitPrefab) {
      appendEvent("Asset fit apply skipped: no model prefab selected.");
      return;
    }
    const currentRender = assetFitPrefab.render;
    const nextScale = readNumber(assetFitScaleInput.value, currentRender.modelScale?.x  ?? 1);
    const nextOffsetY = readNumber(assetFitOffsetYInput.value, currentRender.modelOffset?.y  ?? 0);
    const nextYawDegrees = readNumber(assetFitYawInput.value, ((currentRender.modelRotation?.y  ?? 0) * 180) / Math.PI);
    const nextPhysics = buildAssetFitPhysicsComponent();
    const updatedComponents: Record<string, unknown> = {
      ...assetFitPrefab.prefab.components,
      render: {
        ...currentRender,
        modelScale: makeVec3(nextScale, nextScale, nextScale),
        modelOffset: makeVec3(
          currentRender.modelOffset?.x  ?? 0,
          nextOffsetY,
          currentRender.modelOffset?.z  ?? 0,
        ),
        modelRotation: {
          x: currentRender.modelRotation?.x  ?? 0,
          y: (nextYawDegrees * Math.PI) / 180,
          z: currentRender.modelRotation?.z  ?? 0,
        },
      },
    };
    if (nextPhysics) {
      updatedComponents.physics = nextPhysics;
    } else {
      delete updatedComponents.physics;
    }
    const livePhysicsResetCommands = store
      .peekWorld()
      .entities
      .filter((entity) => entity.prefabId === assetFitPrefab.prefabId && entity.components?.physics !== undefined)
      .map((entity) => ({
        op: "update_entity" as const,
        entityId: entity.id,
        patch: {
          components: {
            physics: undefined,
          },
        },
      }));
    store.apply([
      {
        op: "upsert_prefab",
        prefab: {
          ...assetFitPrefab.prefab,
          components: updatedComponents as typeof assetFitPrefab.prefab.components,
        },
      },
      ...livePhysicsResetCommands,
    ]);
    appendEvent(
      `Applied asset fit to prefab '${assetFitPrefab.prefabId}' (collision: ${assetFitCollisionShapeInput.value}, ${assetFitSolidInput.checked ? "solid" : "sensor"}${livePhysicsResetCommands.length > 0 ? `, reset ${livePhysicsResetCommands.length} live physics override${livePhysicsResetCommands.length === 1 ? "" : "s"}` : ""}).`,
    );
  };

  const applyAssetFitClipBinding = (): void => {
    const assetFitPrefab = getAssetFitPrefab();
    if (!assetFitPrefab) {
      appendEvent("Asset binding skipped: no model prefab selected.");
      return;
    }
    const state = assetFitBindStateInput.value.trim();
    const clipName = assetFitBindClipInput.value.trim();
    if (!state || !clipName) {
      appendEvent("Asset binding skipped: choose both a semantic slot and an imported clip.");
      return;
    }

    const currentRender = assetFitPrefab.render;
    const nextSpeed = readNumber(assetFitBindSpeedInput.value, 1);
    store.apply([
      {
        op: "upsert_prefab",
        prefab: {
          ...assetFitPrefab.prefab,
          components: {
            ...assetFitPrefab.prefab.components,
            render: {
              ...currentRender,
              clips: {
                ...(currentRender.clips  ?? {}),
                [state]: clipName,
              },
              clipSettings: {
                ...(currentRender.clipSettings ?? {}),
                [state]: {
                  ...(currentRender.clipSettings?.[state] ?? {}),
                  speed: nextSpeed,
                },
              },
            },
          },
        },
      },
    ]);
    appendEvent(`Bound '${state}' to clip '${clipName}' for '${assetFitPrefab.prefabId}' at speed ${nextSpeed.toFixed(2)}.`);
    syncAssetFitInputs(true);
    refreshAssetFitPreview();
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
    const projectTemplateId = store.peekProject().metadata.templateId;
    const selectedValue = projectTemplateInput.value;
    const preferredValue = projectTemplates.some((template) => template.id === selectedValue)
      ? selectedValue
      : projectTemplates.some((template) => template.id === projectTemplateId)
        ? projectTemplateId  ?? ""
        : projectTemplates[0]?.id  ?? "";
    projectTemplateInput.innerHTML = projectTemplates
      .map((template) => `<option value="${template.id}">${escapeHtml(template.label)}</option>`)
      .join("");
    projectTemplateInput.value = preferredValue;
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
    const selectedWorld = project.worlds[projectWorldInput.value]  ?? project.worlds[project.currentWorldId];
    projectWorldSummaryNode.textContent = selectedWorld
      ? `${Object.keys(project.worlds).length} world variants. Active variant: ${project.worlds[project.currentWorldId]?.metadata.name  ?? selectedWorld.metadata.name}. Selected mode: ${selectedWorld.gameMode.replaceAll("_", " ")}.`
      : "No world variants available.";
  };

  const syncWorldStamps = (): void => {
    worldStampInput.innerHTML = worldStamps
      .map((stamp) => `<option value="${stamp.id}">${escapeHtml(stamp.label)}</option>`)
      .join("");
    if (!worldStamps.some((stamp) => stamp.id === worldStampInput.value)) {
      worldStampInput.value = worldStamps[0]?.id  ?? "";
    }
    const stamp = worldStamps.find((item) => item.id === worldStampInput.value);
    worldStampSummaryNode.textContent = stamp?.summary  ?? "No world stamp selected.";
  };

  const syncWorldRecipes = (): void => {
    worldRecipeInput.innerHTML = worldRecipes
      .map((recipe) => `<option value="${recipe.id}">${escapeHtml(recipe.label)}</option>`)
      .join("");
    if (!worldRecipes.some((recipe) => recipe.id === worldRecipeInput.value)) {
      worldRecipeInput.value = worldRecipes[0]?.id  ?? "";
    }
    const recipe = getWorldRecipe(worldRecipeInput.value);
    worldRecipeSummaryNode.textContent = recipe?.summary  ?? "No world recipe selected.";
  };

  const syncFeatureToggles = (): void => {
    const preset = getActionModulePreset(store.peekWorld().gameMode);
    const featureDescriptions: Record<string, string> = {
      hostile_ai: "Enemy chase and attack behavior",
      combat: "Player and enemy damage resolution",
      combat_feedback: "Damage markers, health bars, and danger feedback",
      interaction_inventory: "Looting and inventory interaction",
      objective_progress: "Objective step tracking and completion",
      sector_population: "Off-screen sector simulation and pooling",
    };
    if (!preset || !preset.featureIds || preset.featureIds.length === 0) {
      featureTogglesNode.innerHTML = '<div class="inventory-empty">No configurable runtime features for this mode.</div>';
      return;
    }
    const featureOverrides = store.peekProject().runtime.featureOverrides;
    featureTogglesNode.innerHTML = preset.featureIds
      .map((featureId) => {
        const enabled = featureOverrides[featureId]?.enabled  ?? true;
        return `
          <label class="toggle feature-toggle-row">
            <input type="checkbox" data-feature-toggle="${escapeHtml(featureId)}" ${enabled ? "checked" : ""} />
            <span>${escapeHtml(`${featureId.replaceAll("_", " ")} — ${featureDescriptions[featureId]  ?? "runtime feature"}`)}</span>
          </label>
        `;
      })
      .join("");
  };

  const syncGameplayPolicyInputs = (): void => {
    const preset = getActionModulePreset(store.peekWorld().gameMode);
    if (!preset) {
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
    policyRespawnKeyInput.value = policy.respawn.key  ?? policy.controls.respawnKey  ?? "";
    policyAggroScaleInput.value = policy.hostile.aggroRadiusScale.toFixed(2);
    policyLeashScaleInput.value = policy.hostile.leashRadiusScale.toFixed(2);
  };

  const syncGameplayPolicySummary = (): void => {
    const preset = getActionModulePreset(store.peekWorld().gameMode);
    if (!preset) {
      gameplayPolicySummaryNode.textContent = "No configurable gameplay policy for this mode.";
      return;
    }
    const policy = resolvePresetGameplayPolicy(preset, store.peekProject());
    gameplayPolicySummaryNode.textContent =
      `Policy '${preset.policyId}': facing ${policy.facing.mode}, camera ${policy.camera.mode} ${policy.camera.distance.toFixed(1)}m @ ${policy.camera.pitch.toFixed(2)}rad, combat ${policy.combat.targetingMode}/${policy.combat.movementLockOnAttack ? "lock" : "free"}, loot ${policy.loot.transferMode}/${policy.loot.emptyContainerMode}, respawn ${policy.respawn.mode}, hostile aggro ${policy.hostile.aggroRadiusScale.toFixed(2)}x leash ${policy.hostile.leashRadiusScale.toFixed(2)}x.`;
  };

  const syncImmediateGameplayPolicyPreview = (): void => {
    const actionPreset = getActionModulePreset(store.peekWorld().gameMode);
    if (!actionPreset) {
      return;
    }
    scene.updateFollowCamera("player", policyCameraRig(actionPreset, store.peekProject()));
    scene.renderFrame();
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
    syncGameplayPolicyInputs();
    syncGameplayPolicySummary();
    syncImmediateGameplayPolicyPreview();
    appendEvent(`Applied gameplay policy '${preset.policyId}': camera ${patch.camera?.distance}/${patch.camera?.pitch}, facing ${patch.facing?.mode}, aggro ${patch.hostile?.aggroRadiusScale}x.`);
  };

  const resetGameplayPolicyToPreset = (): void => {
    const preset = getActionModulePreset(store.peekWorld().gameMode);
    if (!preset) {
      appendEvent("Gameplay policy reset skipped: active mode has no configurable action policy.");
      return;
    }
    store.clearProjectGameplayPolicy(preset.policyId);
    syncGameplayPolicyInputs();
    syncGameplayPolicySummary();
    syncImmediateGameplayPolicyPreview();
    appendEvent(`Reset gameplay policy '${preset.policyId}' to preset defaults.`);
  };

  const placePrefabAt = (prefabId: string, x: number, z: number): void => {
    const prefab = store.peekWorld().prefabs[prefabId];
    if (!prefab) {
      appendEvent(`Cannot place unknown prefab '${prefabId}'.`);
      return;
    }
    pushEditorUndo(`place ${prefabId}`);
    const placementScale = readNumber(authoringScaleInput.value, 1);
    const placementHeight = (prefab.placement?.defaultHeight  ?? inferPlacementHeight(prefabId)) * placementScale;

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

  const rotateSelectedEntityToward = (x: number, z: number): void => {
    const selectedEntityId = store.getSelectedEntityId();
    if (!selectedEntityId) {
      appendEvent("Rotate skipped: no selected entity.");
      return;
    }
    const entity = store.peekWorld().entities.find((item) => item.id === selectedEntityId);
    if (!entity) {
      appendEvent(`Rotate skipped: missing entity '${selectedEntityId}'.`);
      return;
    }
    const dx = x - entity.transform.position.x;
    const dz = z - entity.transform.position.z;
    if (Math.hypot(dx, dz) <= 0.001) {
      return;
    }
    store.updateEntityTransform(
      selectedEntityId,
      {
        rotation: makeVec3(
          entity.transform.rotation?.x ?? 0,
          Math.atan2(dx, dz),
          entity.transform.rotation?.z ?? 0,
        ),
      },
      true,
    );
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
      pushEditorUndo(`delete zone ${selectedZone.id}`);
      store.apply([{ op: "delete_zone", zoneId: selectedZone.id }]);
      selectedZoneId = null;
      scene.setSelectionState(null, null);
      refreshSidebar();
      appendEvent(`Deleted zone '${selectedZone.id}'.`);
      return;
    }
    if (!selectedEntityId || selectedEntityId === "player" || selectedEntityId === "ground") {
      appendEvent("Delete skipped: select a non-core entity.");
      return;
    }
    pushEditorUndo(`delete entity ${selectedEntityId}`);
    store.apply([{ op: "delete_entity", entityId: selectedEntityId }]);
    selectEntity(null);
    appendEvent(`Deleted '${selectedEntityId}'.`);
  };

  const placeZoneAt = (x: number, z: number): void => {
    pushEditorUndo(`place ${authoringZoneKindInput.value} zone`);
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

  const getAuthoringPlacement = (prefabId = authoringPrefabInput.value): {
    prefab: WorldDocument["prefabs"][string] | null;
    scale: number;
    yawRadians: number;
    height: number;
  } => {
    const prefab = store.peekWorld().prefabs[prefabId]  ?? null;
    const scale = Math.max(0.1, readNumber(authoringScaleInput.value, 1));
    const yawRadians = (readNumber(authoringYawInput.value, 0) * Math.PI) / 180;
    const height = prefab
      ? (prefab.placement?.defaultHeight  ?? inferPlacementHeight(prefabId)) * scale
      : 0;
    return { prefab, scale, yawRadians, height };
  };

  const refreshEditorPreview = (point = scene.getLastGroundPointer()): void => {
    if (interactionMode !== "edit" || !point) {
      scene.clearEditorPreview();
      return;
    }

    if (editTool === "place") {
      const placement = getAuthoringPlacement();
      scene.setEditorPlacementPreview(
        placement.prefab,
        placement.prefab ? { x: point.x, y: placement.height, z: point.z } : null,
        placement.scale,
        placement.yawRadians,
      );
      return;
    }

    if (editTool === "zone") {
      const size = Math.max(1, readNumber(authoringZoneSizeInput.value, 10));
      scene.setEditorZonePreview({
        kind: authoringZoneKindInput.value as ZoneSpec["kind"],
        shape: authoringZoneShapeInput.value === "sphere"
          ? { type: "sphere", radius: size }
          : { type: "box", size: makeVec3(size, 2, size) },
        transform: { position: makeVec3(point.x, 1, point.z) },
      });
      return;
    }

    scene.clearEditorPreview();
  };

  const nudgeAuthoringYaw = (deltaDegrees: number): void => {
    const selectedEntityId = store.getSelectedEntityId();
    if (interactionMode === "edit" && editTool !== "place" && selectedEntityId) {
      const entity = store.peekWorld().entities.find((item) => item.id === selectedEntityId);
      if (!entity) {
        return;
      }
      pushEditorUndo(`rotate ${selectedEntityId}`);
      const nextYaw = (entity.transform.rotation?.y ?? 0) + ((deltaDegrees * Math.PI) / 180);
      store.updateEntityTransform(
        selectedEntityId,
        {
          rotation: makeVec3(
            entity.transform.rotation?.x ?? 0,
            nextYaw,
            entity.transform.rotation?.z ?? 0,
          ),
        },
        true,
      );
      authoringYawInput.value = String((nextYaw * 180) / Math.PI);
      return;
    }
    const next = readNumber(authoringYawInput.value, 0) + deltaDegrees;
    authoringYawInput.value = String(next);
    refreshEditorPreview();
  };

  const nudgeAuthoringScale = (delta: number): void => {
    const selectedEntityId = store.getSelectedEntityId();
    const selectedZone = getSelectedZone();
    if (interactionMode === "edit" && selectedZone && editTool !== "place" && editTool !== "zone") {
      pushEditorUndo(`resize zone ${selectedZone.id}`);
      const currentSize = selectedZone.shape.type === "sphere" ? selectedZone.shape.radius : selectedZone.shape.size.x;
      const next = Math.max(1, currentSize + delta);
      const nextZone: ZoneSpec = {
        ...selectedZone,
        shape: selectedZone.shape.type === "sphere"
          ? { type: "sphere", radius: next }
          : { type: "box", size: makeVec3(next, selectedZone.shape.size.y, next) },
      };
      store.apply([{ op: "define_zone", zone: nextZone }]);
      authoringZoneSizeInput.value = String(next);
      return;
    }
    if (interactionMode === "edit" && editTool !== "place" && editTool !== "zone" && selectedEntityId) {
      const entity = store.peekWorld().entities.find((item) => item.id === selectedEntityId);
      if (!entity) {
        return;
      }
      pushEditorUndo(`scale ${selectedEntityId}`);
      const next = Math.max(0.1, (entity.transform.scale?.x ?? 1) + delta);
      store.updateEntityTransform(selectedEntityId, {
        scale: makeVec3(next, next, next),
      }, true);
      authoringScaleInput.value = next.toFixed(2);
      return;
    }
    if (editTool === "zone") {
      const next = Math.max(1, readNumber(authoringZoneSizeInput.value, 10) + delta);
      authoringZoneSizeInput.value = String(next);
      refreshEditorPreview();
      return;
    }
    const next = Math.max(0.1, readNumber(authoringScaleInput.value, 1) + delta);
    authoringScaleInput.value = next.toFixed(2);
    refreshEditorPreview();
  };

  const handleCanvasAuthoring = (event: PointerEvent): void => {
    if (interactionMode === "play") {
      scene.clearEditorPreview();
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
    if (editTool === "select") {
      canvasRoot.focus();
      return;
    }
    if (editTool === "place") {
      placePrefabAt(authoringPrefabInput.value, groundPick.point.x, groundPick.point.z);
      refreshEditorPreview(groundPick.point);
      return;
    }
    if (editTool === "move") {
      if (store.getSelectedEntityId() || getSelectedZone()) {
        pushEditorUndo("move selection");
      }
      moveDragActive = true;
      scene.setOrbitEnabled(false);
      moveSelectedEntityTo(groundPick.point.x, groundPick.point.z);
      return;
    }
    if (editTool === "rotate") {
      if (store.getSelectedEntityId()) {
        pushEditorUndo("rotate selection");
      }
      rotateDragActive = true;
      scene.setOrbitEnabled(false);
      rotateSelectedEntityToward(groundPick.point.x, groundPick.point.z);
      return;
    }
    if (editTool === "resize") {
      if (store.getSelectedEntityId() || getSelectedZone()) {
        pushEditorUndo("resize selection");
      }
      resizeDragActive = true;
      scene.setOrbitEnabled(false);
      resizeSelectedToPoint(groundPick.point.x, groundPick.point.z);
      return;
    }
    if (editTool === "zone") {
      placeZoneAt(groundPick.point.x, groundPick.point.z);
      refreshEditorPreview(groundPick.point);
    }
  };

  const handleCanvasAuthoringMove = (event: PointerEvent): void => {
    const groundPick = scene.screenPointToGround(event.clientX, event.clientY);
    if (!groundPick) {
      scene.clearEditorPreview();
      return;
    }
    if (!moveDragActive && !rotateDragActive && !resizeDragActive) {
      refreshEditorPreview(groundPick.point);
    }
    if (moveDragActive && editTool === "move") {
      moveSelectedEntityTo(groundPick.point.x, groundPick.point.z);
      return;
    }
    if (rotateDragActive && editTool === "rotate") {
      rotateSelectedEntityToward(groundPick.point.x, groundPick.point.z);
      return;
    }
    if (resizeDragActive && editTool === "resize") {
      resizeSelectedToPoint(groundPick.point.x, groundPick.point.z);
    }
  };

  const stopAuthoringDrag = (): void => {
    if (!moveDragActive && !rotateDragActive && !resizeDragActive) {
      return;
    }
    moveDragActive = false;
    rotateDragActive = false;
    resizeDragActive = false;
    scene.setOrbitEnabled(true);
    refreshEditorPreview();
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
    const runtimeFindings = runtimeModule.getDebugFindings?.()  ?? [];
    const worldDebugLines = runtimeModule.getWorldDebug?.(world)  ?? [];
    const sectorOverlay = runtimeModule.getSectorOverlay?.()  ?? null;
    const moduleEvents = runtimeModule.getRecentEvents?.()  ?? [];
    const selectedEntityId = store.getSelectedEntityId();
    const selectedZone = getSelectedZone(world);
    const selectedRuntimeDebug = selectedEntityId
      ? runtimeModule.getEntityDebug?.(world, selectedEntityId)  ?? []
      : [];
    const selectedVisualDebug = selectedEntityId
      ? scene.getEntityVisualDebug(selectedEntityId)
      : [];
    const selectedPhysicsDebug = selectedEntityId
      ? physics.getEntityDebug(selectedEntityId)
      : [];
    const playerRuntimeDebug = runtimeModule.getEntityDebug?.(world, "player")  ?? [];
    const playerVisualDebug = scene.getEntityVisualDebug("player");
    const playerPhysicsDebug = physics.getEntityDebug("player");
    const assetReports = scene.getAssetReports();
    const assetLoadSummary = scene.getAssetLoadSummary();
    const assetLoadingLine = assetLoadSummary.total > 0
      ? assetLoadSummary.loading > 0
        ? `Loading world assets ${assetLoadSummary.ready}/${assetLoadSummary.total} ready${assetLoadSummary.error > 0 ? ` | ${assetLoadSummary.error} failed` : ""}`
        : assetLoadSummary.error > 0
          ? `World assets ready with ${assetLoadSummary.error} load failure${assetLoadSummary.error === 1 ? "" : "s"}`
          : `World assets ready ${assetLoadSummary.ready}/${assetLoadSummary.total}`
      : null;
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
    const projectDirty = isProjectDirty();
    const projectSaveTarget = lastSavedTarget  ?? "Not saved to a file yet";
    const projectSaveLabel = projectDirty ? "Unsaved changes" : "Saved";
    const projectPaneButton = paneButtons.find((button) => button.dataset.paneTarget === "project");
    if (projectPaneButton) {
      projectPaneButton.textContent = projectDirty ? "Project*" : "Project";
    }

    if (document.activeElement !== projectNameInput) {
      projectNameInput.value = world.metadata.name;
    }

    if (worldSwapState !== "failed") {
      worldSwapState = assetLoadSummary.loading > 0 ? "loading" : "idle";
    }

    diagnosticsNode.textContent = JSON.stringify(diagnostics, null, 2);
    evaluationNode.textContent = formatEvaluation(evaluation.findings);
    sessionNode.textContent = [
      ...(assetLoadingLine ? [assetLoadingLine] : []),
      ...(runtimeModule.getStatusLines?.()  ?? ["No session state."]),
    ].join("\n");
    sectorStatusNode.textContent = worldDebugLines.join("\n") || "No sector debug available.";
    scene.setSectorOverlay(sectorOverlay);
    sessionNode.textContent += `\nModule label: ${currentModuleDescriptor?.label  ?? runtimeModule.id}\nModule implemented: ${currentModuleDescriptor?.implemented ? "yes" : "sandbox fallback"}\nKnown modules: ${implementedModuleCount}/${moduleDescriptors.length}\nGameplay policy: ${activeGameplayPolicy ? JSON.stringify(activeGameplayPolicy, null, 2) : "n/a"}\nInteraction mode: ${interactionMode}\nEdit tool: ${editTool}\nMove drag: ${moveDragActive}\nResize drag: ${resizeDragActive}\nAuthoring prefab: ${authoringPrefabInput.value}\nAuthoring scale: ${authoringScaleInput.value}\nAuthoring yaw: ${authoringYawInput.value}\nZone kind: ${authoringZoneKindInput.value}\nZone shape: ${authoringZoneShapeInput.value}\nZone size: ${authoringZoneSizeInput.value}\nScene filter: ${sceneFilterInput.value}\nScene search: ${sceneSearchInput.value}\nSelected zone: ${selectedZone?.id  ?? "none"}`;
    inspectorNode.textContent = formatInspector(
      selectedEntityId,
      selectedZone,
      selectedRuntimeDebug,
      selectedVisualDebug,
      selectedPhysicsDebug,
    );
    const hasSelection = Boolean(selectedEntityId || selectedZone);
    inspectorSection.toggleAttribute("hidden", !hasSelection || activeSidebarPane !== "world");
    sceneInventoryNode.innerHTML = renderSceneInventory(
      world,
      selectedEntityId,
      selectedZone?.id  ?? null,
      sceneSearchInput.value,
      sceneFilterInput.value,
    );
    projectSaveSummaryNode.innerHTML = [
      renderOverviewRow("State", projectSaveLabel),
      renderOverviewRow("Target", projectSaveTarget),
      renderOverviewRow("Saved", lastSavedAt ? new Date(lastSavedAt).toLocaleString() : "Never"),
      renderOverviewRow("Autosave", "Browser local autosave is on"),
    ].join("");
    assetStatusNode.textContent = formatAssetReports(assetReports);
    syncAssetFitPrefabs();
    syncAssetFitInputs();
    updateAssetFitOptionsFromPreview();
    assetFitStatusNode.textContent = assetFitScene.getAssetFitPreviewReport()
      ? formatSingleAssetReport(assetFitScene.getAssetFitPreviewReport()!)
      : "Pick a model prefab, refresh the preview, adjust the fit, then save it back to prefab defaults.";
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
    const assetStatus = assetLoadSummary.total > 0
      ? `${assetLoadSummary.ready}/${assetLoadSummary.total} assets`
      : "No model assets";
    const assetSuffix = assetLoadSummary.loading > 0
      ? `, ${assetLoadSummary.loading} loading`
      : assetLoadSummary.error > 0
        ? `, ${assetLoadSummary.error} failed`
        : "";
    const runtimeStatusLine = [
      `Mode ${world.gameMode}`,
      `World ${worldSwapState}`,
      gameplayPaused ? "Paused" : "Running",
      `${assetStatus}${assetSuffix}`,
      `${evaluation.counts.error} errors / ${evaluation.counts.warn} warnings`,
    ].join(" | ");
    playtestHud.innerHTML = renderHud(
      [
        runtimeStatusLine,
        ...(assetLoadingLine ? [assetLoadingLine] : []),
        ...(runtimeModule.getStatusLines?.()  ?? []),
      ],
      runtimeFindings,
      evaluation.findings.map((finding) => `[${finding.severity}] ${finding.message}`),
      [
        ...playerRuntimeDebug,
        ...playerPhysicsDebug,
        ...playerVisualDebug,
      ],
      hudVisibility,
    );
    selectionNode.textContent = selectedZone
      ? JSON.stringify(selectedZone, null, 2)
      : store.getSelectedEntityJson();
    selectionSection.toggleAttribute("hidden", !hasSelection || activeSidebarPane !== "world");
    eventLogNode.textContent = [...moduleEvents, ...runtimeEvents].slice(0, 40).join("\n") || "No runtime events yet.";
    issuesNode.textContent =
      [
        ...runtimeFindings,
        ...assetFindings,
        ...evaluation.findings.map((finding) => `[${finding.severity}] ${finding.message}`),
        ...(playtestEvaluation?.findings.map((finding) => `[playtest:${finding.severity}] ${finding.message}`)  ?? []),
        ...store.getCommandIssues(),
      ].join("\n") ||
      store.getCommandIssues().join("\n") ||
      "No command issues.\nUse Generate Flat Outpost for a procedural world seed, or load the authored survival slice.";
    iterationSuggestionsNode.innerHTML = renderIterationSuggestions(latestIterationSuggestions);
    const renderStats = scene.getStats();
    const workspaceStatus = activeSidebarPane === "world"
      ? interactionMode === "edit"
        ? editTool === "place"
          ? `Map | Edit | Place ${authoringPrefabInput.value} | scale ${readNumber(authoringScaleInput.value, 1).toFixed(2)} | yaw ${readNumber(authoringYawInput.value, 0).toFixed(0)} deg`
          : editTool === "zone"
            ? `Map | Edit | Zone ${authoringZoneKindInput.value} | ${authoringZoneShapeInput.value} | size ${readNumber(authoringZoneSizeInput.value, 10).toFixed(0)}`
            : `Map | Edit | ${editTool}`
        : gameplayPaused ? "Map | Play mode | paused" : "Map | Play mode"
      : activeSidebarPane === "assets"
        ? `Assets | ${gameplayPaused ? "paused | " : ""}${assetFitPrefabInput.value || "no prefab"} | preview ${assetFitAnimationInput.value || "idle"}`
      : activeSidebarPane === "project"
          ? `Project | ${gameplayPaused ? "paused | " : ""}${projectDirty ? "unsaved changes" : "saved"}`
          : activeSidebarPane === "debug"
            ? "Debug workspace"
            : "";
    workspaceStatusNode.textContent = workspaceStatus;
    workspaceStatusNode.classList.toggle("hidden", workspaceStatus.length === 0 || activeSidebarPane === "play");
    playtestStatusNode.textContent = formatPlaytestStatus(
      playtestSession,
      runtimeEvents,
      store.peekProject().runtime.lastPlaytestReport,
    );
    syncGameModeTemplate();
    syncGameplayPolicySummary();
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
      worldSwapState = "loading";
      runtimeModule.onWorldRebuilt?.(world, {
        store,
        scene,
        physics,
        input,
      });
      appendEvent(`World rebuilt: ${world.metadata.id}`);
      syncFeatureToggles();
      syncGameplayPolicyInputs();
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

  const buildUrbanWorld = (): void => {
    store.setWorld(
      stampWorldMode(makeUrbanCityWorld({
        seed: parseNumber(seedInput.value, defaultFlatWorldOptions.seed, 1),
        worldHalfExtent: Math.max(parseNumber(sizeInput.value, defaultFlatWorldOptions.worldHalfExtent, 24), 96),
        buildingCount: Math.max(parseNumber(buildingInput.value, defaultFlatWorldOptions.buildingCount, 1), 12),
        zombieCount: Math.max(parseNumber(zombieInput.value, defaultFlatWorldOptions.zombieCount, 0), 20),
        crateCount: Math.max(parseNumber(crateInput.value, defaultFlatWorldOptions.crateCount, 0), 8),
      })),
    );
    appendEvent("Requested generated urban city world.");
  };

  const startProjectFromTemplate = (): void => {
    const template = getProjectTemplate(projectTemplateInput.value);
    if (!template) {
      appendEvent("Project start skipped: no template selected.");
      return;
    }
    requestedGameMode = template.gameMode;
    const currentWorld = store.peekWorld();
    const world = mergePrefabOverrides(
      stampWorldMode(template.buildWorld()),
      currentWorld,
    );
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
    projectSaveHandle = null;
    lastSavedProjectSignature = null;
    lastSavedAt = null;
    lastSavedTarget = null;
    store.setProject(nextProject);
    projectTemplateInput.value = template.id;
    appendEvent(`Started project '${world.metadata.name}' from template '${template.label}'.`);
  };

  const saveProjectToWorkingFile = async (): Promise<void> => {
    const project = store.getProject();
    const suggestedName = `${project.metadata.id || "groundtruth-project"}.project.json`;
    const pickerWindow = window as Window & typeof globalThis & {
      showSaveFilePicker?: (options?: {
        suggestedName?: string;
        types?: Array<{
          description?: string;
          accept: Record<string, string[]>;
        }>;
      }) => Promise<SaveFileHandleLike>;
    };

    if (pickerWindow.showSaveFilePicker) {
      const handle = projectSaveHandle  ?? await pickerWindow.showSaveFilePicker({
        suggestedName,
        types: [
          {
            description: "Groundtruth Project",
            accept: {
              "application/json": [".json"],
            },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(JSON.stringify(project, null, 2));
      await writable.close();
      projectSaveHandle = handle;
      markProjectSaved(handle.name  ?? suggestedName);
      appendEvent(`Saved working project '${project.metadata.name}' to '${handle.name  ?? suggestedName}'.`);
      return;
    }

    downloadJson(suggestedName, project);
    markProjectSaved(suggestedName);
    appendEvent(`Saved working project '${project.metadata.name}' via download fallback.`);
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
      label: playtestSession?.label  ?? "Playtest Session",
      capturedAt: report.capturedAt,
      noteCount: playtestSession?.notes.length  ?? 0,
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
          projectSaveHandle = null;
          lastSavedProjectSignature = null;
          lastSavedAt = null;
          lastSavedTarget = null;
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
          projectSaveHandle = null;
          lastSavedProjectSignature = null;
          lastSavedAt = null;
          lastSavedTarget = null;
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
      saveEditorAutosaveProject(store.getProject());
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
      saveEditorAutosaveProject(store.getProject());
      appendEvent(`Store event: project -> ${store.peekProject().metadata.id}`);
      syncFeatureToggles();
      refreshSidebar();
      syncImmediateGameplayPolicyPreview();
      return;
    }
    appendEvent(`Store event: selection -> ${store.getSelectedEntityId()  ?? selectedZoneId  ?? "none"}`);
    scene.setSelectionState(store.getSelectedEntityId(), selectedZoneId);
    syncSelectedTransformInputs();
    syncSelectedZoneInputs();
    refreshSidebar();
  });
  pendingWorldRebuild = true;

  const syncViewportSizes = (): void => {
    requestAnimationFrame(() => {
      scene.handleViewportResize();
      assetFitScene.handleViewportResize();
    });
  };

  const syncSidebarState = (): void => {
    shell.classList.toggle("sidebar-collapsed", sidebarCollapsed);
    toggleSidebarButton.textContent = sidebarCollapsed ? "Show Workspace" : "Hide Workspace";
    toggleSidebarButton.setAttribute("aria-expanded", String(!sidebarCollapsed));
    syncViewportSizes();
  };

  const syncHudState = (): void => {
    playtestHud.classList.toggle("hidden", !hudVisible);
    toggleHudButton.textContent = hudVisible ? "Hide HUD" : "Show HUD";
    toggleHudButton.setAttribute("aria-pressed", String(hudVisible));
  };

  const syncPauseState = (): void => {
    togglePauseButton.textContent = gameplayPaused ? "Resume" : "Pause";
    togglePauseButton.setAttribute("aria-pressed", String(gameplayPaused));
  };

  const syncChromeStripState = (): void => {
    chromeStrip.classList.toggle("hidden", chromeCollapsed);
    toggleChromeButton.textContent = chromeCollapsed ? "Show Bar" : "Hide Bar";
    toggleChromeButton.setAttribute("aria-expanded", String(!chromeCollapsed));
  };

  const syncChromeMenuState = (): void => {
    chromeMenuButton.setAttribute("aria-expanded", String(chromeMenuOpen));
    chromeMenu.hidden = chromeCollapsed || !chromeMenuOpen;
    chromeMenuButton.classList.toggle("active", chromeMenuOpen || activeSidebarPane === "debug");
  };

  const syncSidebarPane = (): void => {
    const preferredOpenTitlesByPane: Record<string, string[]> = {
      play: ["Play View", "Gameplay Policy", "Features"],
      world: ["Authoring", "Scene"],
      assets: ["Assets"],
      project: ["Project"],
      debug: ["Issues", "Diagnostics"],
    };
    for (const button of paneButtons) {
      const isActive = button.dataset.paneTarget === activeSidebarPane;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    }
    for (const section of toolSections) {
      const isActivePane = section.dataset.pane === activeSidebarPane;
      section.toggleAttribute("hidden", !isActivePane);
      if (!isActivePane) {
        continue;
      }
      const title = section.querySelector("h2")?.textContent?.trim() ?? "";
      const preferred = preferredOpenTitlesByPane[activeSidebarPane] ?? [];
      section.open = preferred.includes(title);
    }
    syncChromeMenuState();
    syncViewportSizes();
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

    const activeSection = activeSections.find((section) => section.id === activeHelpSectionId)  ?? activeSections[0];
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

  toggleHudButton.addEventListener("click", () => {
    hudVisible = !hudVisible;
    syncHudState();
  });

  toggleChromeButton.addEventListener("click", () => {
    chromeCollapsed = !chromeCollapsed;
    if (chromeCollapsed) {
      chromeMenuOpen = false;
    }
    syncChromeStripState();
    syncChromeMenuState();
  });

  for (const button of paneButtons) {
    button.addEventListener("click", () => {
      const nextPane = button.dataset.paneTarget as SidebarPane | undefined;
      if (!nextPane) {
        return;
      }
      activeSidebarPane = nextPane;
      if (isEditingPane(nextPane) && !gameplayPaused) {
        gameplayPaused = true;
        syncPauseState();
      }
      chromeMenuOpen = false;
      sidebarCollapsed = nextPane === "play";
      syncSidebarState();
      syncSidebarPane();
      refreshSidebar();
    });
  }

  for (const section of toolSections) {
    section.addEventListener("toggle", () => {
      syncViewportSizes();
    });
  }

  chromeMenuButton.addEventListener("click", () => {
    chromeMenuOpen = !chromeMenuOpen;
    syncChromeMenuState();
  });

  openDocsButton.addEventListener("click", () => {
    chromeMenuOpen = false;
    syncChromeMenuState();
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
    const target = event.target as HTMLElement | null;
    const editingField = target
      ? target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target.isContentEditable
      : false;
    if (event.key === "Escape" && chromeMenuOpen) {
      chromeMenuOpen = false;
      syncChromeMenuState();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s" && bootConfig.mode !== "player") {
      event.preventDefault();
      void saveProjectToWorkingFile().then(refreshSidebar).catch((error) => {
        issuesNode.textContent = error instanceof Error ? error.message : String(error);
      });
      return;
    }
    if (!editingField && interactionMode === "edit" && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      undoAuthoringChange();
      syncAuthoringMode();
      return;
    }
    if (!editingField && interactionMode === "edit") {
      if (event.key === "1") {
        interactionMode = "edit";
        editTool = "select";
        syncAuthoringMode();
        event.preventDefault();
        return;
      }
      if (event.key === "2") {
        interactionMode = "edit";
        editTool = "place";
        syncAuthoringMode();
        event.preventDefault();
        return;
      }
      if (event.key === "3") {
        interactionMode = "edit";
        editTool = "move";
        syncAuthoringMode();
        event.preventDefault();
        return;
      }
      if (event.key === "4") {
        interactionMode = "edit";
        editTool = "rotate";
        syncAuthoringMode();
        event.preventDefault();
        return;
      }
      if (event.key === "5") {
        interactionMode = "edit";
        editTool = "resize";
        syncAuthoringMode();
        event.preventDefault();
        return;
      }
      if (event.key === "6") {
        interactionMode = "edit";
        editTool = "zone";
        syncAuthoringMode();
        event.preventDefault();
        return;
      }
      if (event.key.toLowerCase() === "q") {
        nudgeAuthoringYaw(-15);
        event.preventDefault();
        return;
      }
      if (event.key.toLowerCase() === "e") {
        nudgeAuthoringYaw(15);
        event.preventDefault();
        return;
      }
      if (event.key === "[") {
        nudgeAuthoringScale(editTool === "zone" ? -1 : -0.1);
        event.preventDefault();
        return;
      }
      if (event.key === "]") {
        nudgeAuthoringScale(editTool === "zone" ? 1 : 0.1);
        event.preventDefault();
        return;
      }
      if (event.key === "Delete") {
        deleteSelectedEntity();
        event.preventDefault();
        return;
      }
    }
    if (shouldCaptureGameplayKey(event, interactionMode, docsModal, canvasRoot)) {
      event.preventDefault();
      if (document.activeElement !== canvasRoot) {
        canvasRoot.focus();
      }
    }
    if (event.key === "Escape" && !docsModal.classList.contains("hidden")) {
      setDocsOpen(false);
    }
  });

  document.addEventListener("click", (event) => {
    if (!chromeMenuOpen) {
      return;
    }
    const target = event.target;
    if (!(target instanceof Node) || chromeMenuShell.contains(target)) {
      return;
    }
    chromeMenuOpen = false;
    syncChromeMenuState();
  });

  window.addEventListener("beforeunload", (_event) => {
    // Intentionally not preventing unload — the popup was disruptive during development.
    // Project state is saved explicitly via Save Project.
  });

  canvasRoot.addEventListener("wheel", (event) => {
    if (interactionMode !== "edit") {
      return;
    }
    event.preventDefault();
    const delta = event.deltaY > 0 ? -1 : 1;
    nudgeAuthoringScale(editTool === "zone" ? delta : delta * 0.1);
  }, { passive: false });

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
      activeHelpSectionId = helpContentByAudience[audience][0]?.id  ?? "";
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
    interactionMode = "play";
    syncAuthoringMode();
    appendEvent("Interaction mode set to play.");
  });

  root.querySelector<HTMLButtonElement>("#mode-edit")?.addEventListener("click", () => {
    interactionMode = "edit";
    syncAuthoringMode();
    appendEvent(`Interaction mode set to edit (${editTool}).`);
  });

  root.querySelector<HTMLButtonElement>("#mode-select")?.addEventListener("click", () => {
    interactionMode = "edit";
    editTool = "select";
    syncAuthoringMode();
    appendEvent("Edit tool set to select.");
  });

  root.querySelector<HTMLButtonElement>("#mode-place")?.addEventListener("click", () => {
    interactionMode = "edit";
    editTool = "place";
    syncAuthoringMode();
    appendEvent(`Edit tool set to place '${authoringPrefabInput.value}'.`);
  });

  root.querySelector<HTMLButtonElement>("#mode-move")?.addEventListener("click", () => {
    interactionMode = "edit";
    editTool = "move";
    syncAuthoringMode();
    appendEvent("Edit tool set to move selected entity.");
  });

  root.querySelector<HTMLButtonElement>("#mode-rotate")?.addEventListener("click", () => {
    interactionMode = "edit";
    editTool = "rotate";
    syncAuthoringMode();
    appendEvent("Edit tool set to rotate selected entity.");
  });

  root.querySelector<HTMLButtonElement>("#mode-resize")?.addEventListener("click", () => {
    interactionMode = "edit";
    editTool = "resize";
    syncAuthoringMode();
    appendEvent("Edit tool set to resize selected entity or zone.");
  });

  root.querySelector<HTMLButtonElement>("#mode-zone")?.addEventListener("click", () => {
    interactionMode = "edit";
    editTool = "zone";
    syncAuthoringMode();
    appendEvent(`Edit tool set to zone '${authoringZoneKindInput.value}'.`);
  });

  root.querySelector<HTMLButtonElement>("#authoring-rotate-left")?.addEventListener("click", () => {
    nudgeAuthoringYaw(-15);
  });

  root.querySelector<HTMLButtonElement>("#authoring-rotate-right")?.addEventListener("click", () => {
    nudgeAuthoringYaw(15);
  });

  root.querySelector<HTMLButtonElement>("#authoring-smaller")?.addEventListener("click", () => {
    nudgeAuthoringScale(editTool === "zone" ? -1 : -0.1);
  });

  root.querySelector<HTMLButtonElement>("#authoring-bigger")?.addEventListener("click", () => {
    nudgeAuthoringScale(editTool === "zone" ? 1 : 0.1);
  });

  root.querySelector<HTMLButtonElement>("#apply-selected-transform")?.addEventListener("click", () => {
    applySelectedEntityTransform();
  });

  root.querySelector<HTMLButtonElement>("#undo-authoring")?.addEventListener("click", () => {
    undoAuthoringChange();
    syncAuthoringMode();
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
    if (interactionMode !== "edit") {
      appendEvent("Selection from Scene panel is only available in edit mode.");
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
    refreshEditorPreview();
    refreshSidebar();
  });

  authoringPrefabInput.addEventListener("change", () => {
    syncAuthoringPrefabs();
    refreshEditorPreview();
  });
  authoringScaleInput.addEventListener("input", () => refreshEditorPreview());
  authoringYawInput.addEventListener("input", () => refreshEditorPreview());
  authoringZoneKindInput.addEventListener("change", () => refreshEditorPreview());
  authoringZoneShapeInput.addEventListener("change", () => refreshEditorPreview());
  authoringZoneSizeInput.addEventListener("input", () => refreshEditorPreview());

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
    refreshSidebar();
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
    if (action === "apply") {
      executeAppCommands(suggestion.commands);
      store.recordAppliedSuggestion(suggestion.id, suggestion.title);
      appendEvent(`Applied iteration suggestion '${suggestion.title}'.`);
    }
  });

  canvasRoot.addEventListener("pointerdown", handleCanvasAuthoring);
  canvasRoot.addEventListener("pointermove", handleCanvasAuthoringMove);
  canvasRoot.addEventListener("pointerup", stopAuthoringDrag);
  canvasRoot.addEventListener("pointerleave", () => {
    stopAuthoringDrag();
    scene.clearEditorPreview();
  });

  root.querySelector<HTMLButtonElement>("#load-generated")?.addEventListener("click", () => {
    buildGeneratedWorld();
  });

  root.querySelector<HTMLButtonElement>("#load-town")?.addEventListener("click", () => {
    buildTownWorld();
  });

  root.querySelector<HTMLButtonElement>("#load-urban")?.addEventListener("click", () => {
    buildUrbanWorld();
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

  root.querySelector<HTMLButtonElement>("#save-project")?.addEventListener("click", async () => {
    try {
      await saveProjectToWorkingFile();
      refreshSidebar();
    } catch (error) {
      issuesNode.textContent = error instanceof Error ? error.message : String(error);
    }
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
    projectSaveHandle = null;
    lastSavedProjectSignature = null;
    lastSavedAt = null;
    lastSavedTarget = null;
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

  assetFitPrefabInput.addEventListener("change", () => {
    syncAssetFitInputs(true);
    refreshAssetFitPreview();
    appendEvent(`Asset fit selected prefab '${assetFitPrefabInput.value}'.`);
  });

  assetFitAnimationInput.addEventListener("change", () => {
    syncAssetFitAnimationSpeedInput();
    refreshAssetFitPreview();
  });
  assetFitAnimSpeedInput.addEventListener("input", refreshAssetFitPreview);
  assetFitScaleInput.addEventListener("input", refreshAssetFitPreview);
  assetFitYawInput.addEventListener("input", refreshAssetFitPreview);
  assetFitOffsetYInput.addEventListener("input", refreshAssetFitPreview);
  assetFitCollisionShapeInput.addEventListener("change", refreshAssetFitPreview);
  assetFitCollisionShapeInput.addEventListener("change", () => {
    const compoundLocked = assetFitCollisionShapeInput.value === "compound";
    assetFitSolidInput.disabled = compoundLocked;
    assetFitColSxInput.disabled = compoundLocked;
    assetFitColSyInput.disabled = compoundLocked;
    assetFitColSzInput.disabled = compoundLocked;
    assetFitColOxInput.disabled = compoundLocked;
    assetFitColOyInput.disabled = compoundLocked;
    assetFitColOzInput.disabled = compoundLocked;
  });
  assetFitSolidInput.addEventListener("change", refreshAssetFitPreview);
  assetFitColSxInput.addEventListener("input", refreshAssetFitPreview);
  assetFitColSyInput.addEventListener("input", refreshAssetFitPreview);
  assetFitColSzInput.addEventListener("input", refreshAssetFitPreview);
  assetFitColOxInput.addEventListener("input", refreshAssetFitPreview);
  assetFitColOyInput.addEventListener("input", refreshAssetFitPreview);
  assetFitColOzInput.addEventListener("input", refreshAssetFitPreview);

  root.querySelector<HTMLButtonElement>("#asset-fit-preview")?.addEventListener("click", () => {
    refreshAssetFitPreview();
    appendEvent(`Previewing asset fit for '${assetFitPrefabInput.value}'.`);
  });

  root.querySelector<HTMLButtonElement>("#asset-fit-bind-apply")?.addEventListener("click", () => {
    applyAssetFitClipBinding();
  });

  root.querySelector<HTMLButtonElement>("#asset-fit-apply")?.addEventListener("click", () => {
    applyAssetFitToPrefab();
  });

  root.querySelector<HTMLButtonElement>("#asset-fit-reset")?.addEventListener("click", () => {
    syncAssetFitInputs(true);
    refreshAssetFitPreview();
    appendEvent(`Reloaded prefab defaults for '${assetFitPrefabInput.value}'.`);
  });

  root.querySelector<HTMLButtonElement>("#asset-fit-prev")?.addEventListener("click", () => {
    const prefabIds = listModelPrefabIds();
    if (prefabIds.length === 0) {
      return;
    }
    const currentIndex = Math.max(prefabIds.indexOf(assetFitPrefabInput.value), 0);
    assetFitPrefabInput.value = prefabIds[(currentIndex - 1 + prefabIds.length) % prefabIds.length];
    syncAssetFitInputs(true);
    refreshAssetFitPreview();
  });

  root.querySelector<HTMLButtonElement>("#asset-fit-next")?.addEventListener("click", () => {
    const prefabIds = listModelPrefabIds();
    if (prefabIds.length === 0) {
      return;
    }
    const currentIndex = Math.max(prefabIds.indexOf(assetFitPrefabInput.value), 0);
    assetFitPrefabInput.value = prefabIds[(currentIndex + 1) % prefabIds.length];
    syncAssetFitInputs(true);
    refreshAssetFitPreview();
  });

  assetFitBindStateInput.addEventListener("change", () => {
    syncAssetFitBindingOptions();
    const assetFitPrefab = getAssetFitPrefab();
    if (!assetFitPrefab) {
      assetFitBindSpeedInput.value = "1";
      return;
    }
    const savedSpeed = assetFitPrefab.render.clipSettings?.[assetFitBindStateInput.value]?.speed ?? 1;
    assetFitBindSpeedInput.value = String(savedSpeed);
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
        projectSaveHandle = null;
        lastSavedProjectSignature = JSON.stringify(importedProject);
        lastSavedAt = new Date().toISOString();
        lastSavedTarget = file.name;
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
        throw new Error("File does not contain a valid Groundtruth project or playable export.");
      }
      projectSaveHandle = null;
      lastSavedProjectSignature = JSON.stringify(project);
      lastSavedAt = new Date().toISOString();
      lastSavedTarget = file.name;
      store.setProject(project);
      requestedGameMode = project.metadata.defaultGameMode;
      if (typeof parsed === "object" && parsed && "screenshot" in parsed && typeof (parsed as { screenshot?: unknown }).screenshot === "string") {
        screenshotPreview.src = (parsed as { screenshot: string }).screenshot;
        screenshotPreview.classList.add("visible");
      }
      const isPlayable = isPlayableBuildDocument(parsed);
      appendEvent(isPlayable
        ? `Imported playable build as editable project '${project.metadata.name}'.`
        : `Imported project '${project.metadata.name}'.`);
    } catch (error) {
      issuesNode.textContent = error instanceof Error ? error.message : String(error);
    } finally {
      projectFileInput.value = "";
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
    hudVisibility.status = toggleHudStatusInput.checked;
    hudVisibility.findings = toggleHudFindingsInput.checked;
    hudVisibility.evaluation = toggleHudEvaluationInput.checked;
    hudVisibility.debug = toggleHudDebugInput.checked;
    refreshSidebar();
  };

  toggleZonesInput.addEventListener("change", syncDebugOptions);
  toggleCombatInput.addEventListener("change", syncDebugOptions);
  toggleInteractionInput.addEventListener("change", syncDebugOptions);
  toggleAggroInput.addEventListener("change", syncDebugOptions);
  toggleSectorsInput.addEventListener("change", syncDebugOptions);
  togglePauseButton.addEventListener("click", () => {
    gameplayPaused = !gameplayPaused;
    syncPauseState();
    refreshSidebar();
    appendEvent(gameplayPaused ? "Gameplay paused." : "Gameplay resumed.");
  });
  toggleHudStatusInput.addEventListener("change", syncDebugOptions);
  toggleHudFindingsInput.addEventListener("change", syncDebugOptions);
  toggleHudEvaluationInput.addEventListener("change", syncDebugOptions);
  toggleHudDebugInput.addEventListener("change", syncDebugOptions);
  sceneSearchInput.addEventListener("input", refreshSidebar);
  sceneFilterInput.addEventListener("change", refreshSidebar);
  syncSidebarState();
  syncHudState();
  syncPauseState();
  syncChromeStripState();
  syncChromeMenuState();
  syncSidebarPane();
  syncGameModeTemplate();
  syncProjectTemplates();
  syncProjectWorlds();
  syncFeatureToggles();
  syncWorldRecipes();
  syncWorldStamps();
  syncAuthoringPrefabs();
  syncGameplayPolicyInputs();
  syncGameplayPolicySummary();
  syncAuthoringMode();
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
      assetFitScene.renderFrame(dtSeconds);
      refreshSidebar();
      input.endFrame();
      requestAnimationFrame(animate);
      return;
    }
    if (interactionMode === "edit" || gameplayPaused) {
      scene.renderFrame(dtSeconds);
      assetFitScene.renderFrame(dtSeconds);
      refreshSidebar();
      input.endFrame();
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
    assetFitScene.renderFrame(dtSeconds);
    refreshSidebar();
    input.endFrame();
    requestAnimationFrame(animate);
  };
  animate();
}

void bootstrap();

interface GroundtruthBootConfig {
  mode?: "editor" | "player";
  manifest?: string;
}

const EDITOR_AUTOSAVE_KEY = "groundtruth.editor.autosave.project";

type SaveFileHandleLike = {
  name?: string;
  createWritable: () => Promise<{
    write: (contents: string) => Promise<void>;
    close: () => Promise<void>;
  }>;
};

function loadEditorAutosaveProject(): ProjectDocument | null {
  try {
    const source = window.localStorage.getItem(EDITOR_AUTOSAVE_KEY);
    if (!source) {
      return null;
    }
    return JSON.parse(source) as ProjectDocument;
  } catch {
    return null;
  }
}

function saveEditorAutosaveProject(project: ProjectDocument): void {
  try {
    window.localStorage.setItem(EDITOR_AUTOSAVE_KEY, JSON.stringify(project));
  } catch {
    // Ignore autosave failures in constrained browser environments.
  }
}

function readBootConfig(): GroundtruthBootConfig {
  const bootWindow = window as Window & typeof globalThis & {
    __GROUNDTRUTH_BOOT__?: GroundtruthBootConfig;
  };
  const search = new URLSearchParams(window.location.search);
  return {
    mode: search.get("mode") === "player"
      ? "player"
      : bootWindow.__GROUNDTRUTH_BOOT__?.mode  ?? "editor",
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
  return (entity.tags  ?? []).includes("enemy") || entity.prefabId === "zombie_basic";
}

function isLootEntity(
  world: WorldDocument,
  entity: WorldDocument["entities"][number],
): boolean {
  const category = entity.prefabId ? world.prefabs[entity.prefabId]?.category : undefined;
  return category === "loot" || entity.prefabId === "loot_crate" || (entity.tags  ?? []).includes("loot");
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
  visibility: {
    status: boolean;
    findings: boolean;
    evaluation: boolean;
    debug: boolean;
  },
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
  const cards: string[] = [];
  if (visibility.status) {
    cards.push(`
      <div class="hud-card hud-anchor-top-left">
        <div class="hud-title">Playtest HUD</div>
        ${statusHtml}
      </div>
    `);
  }
  if (visibility.findings) {
    cards.push(`
      <div class="hud-card hud-findings hud-anchor-bottom-left">
        <div class="hud-title">Runtime Findings</div>
        ${findingsHtml}
      </div>
    `);
  }
  if (visibility.evaluation) {
    cards.push(`
      <div class="hud-card hud-evaluation hud-anchor-top-right">
        <div class="hud-title">World Evaluation</div>
        ${evaluationHtml}
      </div>
    `);
  }
  if (visibility.debug) {
    cards.push(`
      <div class="hud-card hud-debug hud-anchor-bottom-right">
        <div class="hud-title">Player Debug</div>
        ${debugHtml}
      </div>
    `);
  }
  return cards.join("");
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
            <span>Applied ${suggestion.appliedCount  ?? 0} time${(suggestion.appliedCount  ?? 0) === 1 ? "" : "s"}</span>
            ${suggestion.appliedRecently ? '<span class="iteration-badge">Recently applied</span>' : ""}
          </div>
        </div>
        <div class="iteration-actions">
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
    `Ended: ${session.endedAt  ?? "active"}`,
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
  interactionMode: string,
  docsModal: HTMLElement,
  canvasRoot: HTMLElement,
): boolean {
  if (interactionMode !== "play") {
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
      `Tags: ${(zone.tags  ?? []).join(", ") || "none"}`,
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
      matchesQuery(`${entity.id} ${entity.name} ${entity.prefabId  ?? ""} ${(entity.tags  ?? []).join(" ")}`))
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
    .filter((zone) => zoneMatchesFilter(zone) && matchesQuery(`${zone.id} ${zone.name} ${zone.kind} ${(zone.tags  ?? []).join(" ")}`))
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
  if (Object.keys(world.prefabs).length === 0) {
    return '<div class="inventory-empty">No prefabs available for this world.</div>';
  }
  const groups = new Map<string, string[]>();
  for (const prefabId of Object.keys(world.prefabs).sort()) {
    const group = categorizePrefab(world.prefabs[prefabId]?.category, prefabId);
    const bucket = groups.get(group)  ?? [];
    bucket.push(prefabId);
    groups.set(group, bucket);
  }

  const groupPriority: Record<string, number> = {
    Actors: 0,
    Buildings: 1,
    Loot: 2,
    Other: 3,
    Environment: 4,
    Props: 5,
  };
  const defaultOpenGroups = new Set(["Actors", "Buildings", "Loot"]);

  return Array.from(groups.entries())
    .sort(([left], [right]) => (groupPriority[left] ?? 99) - (groupPriority[right] ?? 99) || left.localeCompare(right))
    .map(([group, prefabIds]) => `
      <details class="palette-group" ${defaultOpenGroups.has(group) ? "open" : ""}>
        <summary class="palette-group-title">${escapeHtml(group)} (${prefabIds.length})</summary>
        <div class="palette-chip-grid">
          ${prefabIds
            .map((prefabId) => `
              <button
                type="button"
                class="palette-chip${prefabId === selectedPrefabId ? " selected" : ""}"
                data-palette-prefab="${escapeHtml(prefabId)}"
              >
                ${escapeHtml(world.prefabs[prefabId]?.name  ?? prefabId)}
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
    .map((report) => formatSingleAssetReport(report))
    .join("\n");
}

function formatSingleAssetReport(report: ReturnType<SceneRuntime["getAssetReports"]>[number]): string {
  const clipSummary = report.clips
    .map((clip) => `${clip.state}:${clip.status}${clip.durationSeconds ? ` (${clip.durationSeconds.toFixed(2)}s)` : ""}`)
    .join(", ");
  const availableSummary = report.availableClipNames.length > 0
    ? ` | available: ${report.availableClipNames.join(", ")}`
    : "";
  const warningSummary = report.warnings.length > 0
    ? ` | warnings: ${report.warnings.join(" | ")}`
    : "";
  const errorSummary = report.error ? ` | error: ${report.error}` : "";
  return `${report.entityId} -> ${report.status} ${report.format.toUpperCase()} | ${clipSummary}${availableSummary}${warningSummary}${errorSummary}`;
}

function escapeHtml(source: string): string {
  return source
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
