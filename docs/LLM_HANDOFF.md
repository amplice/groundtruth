# Groundtruth LLM Handoff

This file is for another capable coding LLM to resume work on Groundtruth quickly and with the right mental model.

It should be treated as the current operational truth, not a marketing summary.

## Repository / Branch

Repo root:
- `C:\Users\cobra\groundtruth`

Primary branch model:
- `main` = reusable engine baseline
- `game/zombie-survival` = current working branch for the playable zombie-survival slice and engine changes driven by that slice

Current branch at time of this handoff:
- `game/zombie-survival`

Do not suggest splitting to a separate zombie-game repo yet. The user explicitly chose a branch strategy so engine and game can evolve together for now.

## What Groundtruth Is Right Now

Groundtruth is a browser-first semantic 3D runtime/editor trying to become an AI-native game engine.

Current reality:
- It is not yet a mature general engine.
- It is no longer just “a game with some editor bits” either.
- It is currently most useful as:
  - a project-based game-construction environment
  - a semantic world/prefab/zone editor
  - a playtest/runtime loop
  - an asset fitting / asset prep environment

The user is highly sensitive to Groundtruth pretending to be more engine-like than it really is. Be explicit.

Correct framing:
- Groundtruth is a promising engine-shaped platform.
- The zombie survival game is one project using it.
- Do not collapse those into the same thing.

## User Intent

The user wants Groundtruth to be genuinely useful as an AI-native engine.

Their key belief:
- adding new mechanics/items/rules is the easy part
- the hard, valuable part is:
  - coherent worldbuilding
  - asset integration
  - visual fitting / visual correctness
  - making human visual judgment and AI semantic setup work together cleanly

Important user preference:
- humans are good at “does this look right?”
- AIs are good at setup, wiring, semantic editing, repetitive config, and analysis
- Groundtruth should respect that split instead of trying to force everything through code or through AI-only guesses

## Product Principles That Must Persist

### 1. Do not bake one game into Groundtruth

Decision order:
- project
- preset / policy
- feature
- engine core

Use this consistently.

Examples:
- zombie tuning, asset choices, world layout = project
- third-person facing/camera/loot/respawn choices = policy
- objective tracking / hostile AI / sector population = feature
- schema, editor/runtime plumbing, save/open/export, asset-fit infrastructure = core

Relevant docs:
- `AGENTS.md`
- `docs/ENGINE_RULEBOOK.md`
- `docs/AI_OPERATOR_GUIDE.md`

### 2. Durable game state belongs in world/project data

We already hit a real bug where objective progress lived only in a runtime feature instance and was lost on rebuild.

Rule:
- if state answers “what has happened in the game?”, store it durably
- if state answers “what is happening this frame?”, runtime memory is fine

### 3. Visual workflows matter

Do not regress to “change constants blind in code” unless unavoidable.

The user explicitly wants:
- asset on floor
- scale / offset / yaw fitting
- preview clips
- save those decisions semantically

That is why Asset Fit exists and should keep improving.

### 4. UX should follow classic editor logic

Recent UX direction from the user:
- large coarse work modes along the top
- thin sidebars / tool rails for the active mode
- game viewport remains primary
- huge slabs of overview/forms are bad
- “am I playing, editing the map, or working on assets?” should be obvious

The user strongly disliked the giant workspace slab version. Do not go back.

## Current UX / Shell State

Groundtruth recently went through a major UX restructuring.

Current broad shell direction:
- top-level mode buttons:
  - `Playtest`
  - `Map`
  - `Assets`
- utility buttons:
  - `Project`
  - `Debug`
  - `Docs`
  - `Pause`
  - `Hide HUD`
  - `Hide Workspace`

Current intended behavior:
- viewport is primary
- tools are supporting overlays/rails, not the whole app
- `Play` vs `Edit` is a meaningful distinction
- in `Edit`, gameplay sim is paused
- there is also an always-visible `Pause` / `Resume` control in the top chrome

Recent UX changes already in code:
- classic-editor-ish top bar + thinner left tool rail
- `Overview` slab reduced / removed from prominence
- `Map` and `Assets` are now first-class modes
- HUD has a top-level show/hide and corner anchoring instead of ugly scroll

Still rough:
- UX still needs more refinement
- some tool panels are still denser/noisier than ideal
- `Assets` is better, but still not yet a polished standalone asset/animation workflow

## Current Working Modes

### Playtest

Purpose:
- play the game
- see essential HUD / findings
- pause / resume
- check runtime behavior

### Map

Purpose:
- author the world directly
- place / move / resize / zone
- direct-manipulation editing

Important recent map improvements:
- translucent place preview on hover
- translucent zone preview on hover
- edit/play split is clearer
- keyboard shortcuts:
  - `1-4` tool switching
  - `Q/E` rotate
  - `[` / `]` resize
  - mouse wheel resize
  - `Delete` delete selected

### Assets

Purpose:
- prepare models for use in the game
- fit transforms
- inspect / preview animations
- tune collision

This mode is one of the most important differentiators for Groundtruth right now.

## Asset Fit: Current State

Asset Fit is no longer just a tiny helper. It is the beginning of the human+AI asset pipeline.

What it currently does:
- separate preview viewport
- select / cycle model prefabs
- preview asset on neutral floor/platform
- adjust:
  - scale
  - yaw
  - Y offset
- inspect semantic/raw clip options
- bind semantic clip names
- set per-slot clip speeds
- configure collision shape / offsets / solid-vs-sensor
- apply changes back into prefab config

Important corrections made recently:
- multi-child compound colliders are now preserved instead of being flattened by accident
- compound collision in Asset Fit is recognized honestly rather than misreported as a primitive
- selection now syncs Asset Fit to the selected entity’s prefab to reduce mismatch/confusion
- preview wireframes distinguish:
  - solid = green
  - sensor = orange

Very important nuance:
- Asset Fit edits the prefab type, not one instance
- the user expects those edits to affect all entities of that prefab type in the world

## Collision / Physics Findings

This was a major debugging area recently. Read carefully.

### Sensor bug

The `Solid (blocks movement)` toggle in Asset Fit originally appeared to work visually but did not change live gameplay blocking.

Real findings:
- Rapier character controller supports `QueryFilterFlags.EXCLUDE_SENSORS`
- Groundtruth was not using that flag
- we were only filtering by predicate afterward
- that was insufficient; sensors could still affect movement/grounding

Current fix:
- [physicsRuntime.ts](C:/Users/cobra/groundtruth/src/runtime/physicsRuntime.ts) now passes `QueryFilterFlags.EXCLUDE_SENSORS` into `computeColliderMovement(...)`
- player debug now also shows `Sensor: true/false` for the selected collider

Result:
- user confirmed they can now walk through sensor-marked objects

### Prefab/entity physics inheritance

Another real issue:
- `resolveEntity()` in [schema.ts](C:/Users/cobra/groundtruth/src/core/schema.ts) used to shallow-merge components
- entity-level `physics` could mask later prefab physics changes

Current fix:
- `physics` now merges field-by-field so prefab sensor/body/shape changes propagate more correctly

### Low obstacle traversal

The user wanted low obstacles to be walk-up-able.

Current change:
- character autostep height in [physicsRuntime.ts](C:/Users/cobra/groundtruth/src/runtime/physicsRuntime.ts) was raised to `0.5`

### Current unresolved / still-in-flux feel issue

There was a road/sidewalk hitch in the urban map.

Findings:
- urban road prefabs had solid colliders on top of the existing ground slab
- this created curb-like blocking/hitches

Changes made:
- removed physics from `urban_road_straight` and `urban_road_junction` in [worldFactory.ts](C:/Users/cobra/groundtruth/src/core/worldFactory.ts)
- added migration in [main.ts](C:/Users/cobra/groundtruth/src/main.ts) to strip stale saved road colliders from persisted project/autosave data
- then adjusted road render offsets to reduce visible foot sinking
- also added migration to normalize saved road model offsets

Status:
- user reported they can walk on roads fine now
- but there was a follow-up concern about feet sinking into the road
- the latest change was to set road `modelOffset.y = 0` and migrate saved road offsets to `0`
- this latest visual road fix needs live confirmation

If the sinking still persists, investigate road mesh placement / visual ground relation further, but do not reintroduce blocking road colliders casually.

## Current Game Slice

The current active project direction is a third-person zombie survival game.

Implemented enough to matter:
- third-person player control
- zombie model integration
- pistol loop
- objective loop
- urban city generation
- world/project save/open
- asset fitting

Still rough:
- richer worldbuilding
- better asset coherence
- stronger survival identity over time
- better readability / landmarking
- more polished level flow

The user repeatedly prefers improving coherence and real usability over adding endless mechanics.

## Current Asset State

### Zombie assets

Path:
- `public/assets/zombie_models`

Current default zombie base:
- `/assets/zombie_models/FBX/PS1_Zombie_2.fbx`

Known working clip names:
- `IdleZ`
- `WalkZ`
- `GrabBiteZ`
- `DamageZ`
- `DieZ`
- `ClimbGraveZ`

Important:
- zombie integration already hit several failure modes:
  - wrong clip names
  - invisible model
  - bad offset / sinking
  - preview issues
- use Asset Fit, not blind code tuning

### Urban assets

Path:
- `public/assets/urban_models`

Groundtruth currently uses:
- roads
- apartment block variants
- bus stops
- street lights
- traffic lights
- barriers
- cones
- fences
- plaster walls
- dumpsters
- trash cans
- trash bags

There are also some runtime-safe copied GLB paths under:
- `public/assets/urban_runtime/props`

Those exist because some original URBAN paths were returning HTML instead of model data through Vite due to awkward folder/path handling.

### Grass / terrain texture

The flat green terrain was replaced with a tiled grass texture from:
- `public/assets/asset_variety_pack`

Ground is now textured rather than flat green.

## Save / Open / Export

Groundtruth now has a real project workflow, not just one world in memory.

Important distinctions:
- `Save Project` / `Open Project`
  - whole editable project
- `Save World Variant` / `Open World Variant`
  - map variants within the current project
- `Export Project`
  - richer envelope
- `Build Playable Export`
  - playable build-oriented output

Also:
- `Ctrl+S` saves project
- autosave exists, but explicit save/open is the intended workflow

The user cares about this distinction and asked for the wording cleanup.

## Templates / Worlds / Generator State

Groundtruth currently has:
- flat outpost world
- town grid world
- urban city world
- project templates including `Urban City Survival`

Important recent fix:
- template dropdown / template start behavior used to reset/fall back incorrectly
- this was fixed in `src/main.ts`

Important urban-generation note:
- the user thinks of road straight / junction behavior as the same category of road issue
- treat them together unless there is a clear technical reason not to

## Current Code Areas To Read First

If resuming active work, read these first:

Must-read:
- `AGENTS.md`
- `docs/ENGINE_RULEBOOK.md`
- `docs/AI_OPERATOR_GUIDE.md`
- `docs/USER_GUIDE.md`
- `src/main.ts`
- `src/core/worldFactory.ts`
- `src/core/schema.ts`
- `src/core/worldStore.ts`
- `src/runtime/physicsRuntime.ts`
- `src/runtime/sceneRuntime.ts`
- `src/modules/thirdPersonAction.ts`
- `src/modules/thirdPersonSurvival.ts`
- `src/modules/actionModulePresets.ts`

Useful supporting files:
- `src/core/projectTemplates.ts`
- `src/core/worldRecipes.ts`
- `src/core/worldStamps.ts`
- `src/core/evaluation.ts`
- `src/core/exportFormat.ts`
- `src/docs/helpContent.ts`
- `scripts/export-playable-build.mjs`

## Current Dirty State

At the time of this handoff, there are local uncommitted modifications in:
- `src/core/schema.ts`
- `src/core/worldFactory.ts`
- `src/main.ts`
- `src/runtime/physicsRuntime.ts`
- `src/runtime/sceneRuntime.ts`
- docs files:
  - `docs/AI_OPERATOR_GUIDE.md`
  - `docs/USER_GUIDE.md`
  - `src/docs/helpContent.ts`

These local changes include the recent:
- pause button work
- asset-fit preview/solid-sensor UX work
- sensor collision fix
- road collider removal and road offset migration

`npm run build` was passing after the latest changes.

Untracked temp artifacts still exist and should generally be ignored unless the user explicitly asks about cleanup:
- `tmp-playable-build/`
- `tmp-playable-build-2/`
- `tmp.playable-test.project.json`

## User Preferences / Working Style

Important:
- the user prefers directness and architectural honesty
- they do not want lazy or cosmetic “fixes”
- they want real investigation before patching bugs
- they dislike vague “it should be fixed now” claims without understanding the cause

Recently the user explicitly called out:
- stop making random changes before investigating properly

Take that seriously.

## Blender MCP / Tooling Preference

Outside the repo, the user disabled Blender MCP auto-start in Codex config and prefers Blender/MCP to be used only when explicitly requested.

Practical implication:
- do not assume Blender MCP is available
- do not try to use it unless the user asks

## Best Next Work

The best next work is not “add more random game features.”

Priority areas:
1. validate and polish the new road visual alignment after the no-collider change
2. keep improving `Map` into a clean, direct level-editing workflow
3. keep improving `Assets` into a real model/animation prep tool
4. improve urban world coherence and readability
5. make human+AI collaboration surfaces more intentional and less noisy

The right mindset:
- simplify
- make visual workflows honest
- prefer elegant infrastructure that helps real use
- let game-driven friction reveal engine changes worth making

## Final Reminder

Groundtruth becomes valuable if it helps with:
- asset prep
- world coherence
- visual correctness
- project persistence
- human+AI collaboration

It does not become valuable by endlessly accreting more mechanics, templates, or genre labels.
