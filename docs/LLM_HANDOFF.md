# Groundtruth LLM Handoff

This document is for another LLM or future me to continue work on Groundtruth with minimal warmup.

It is intentionally blunt, operational, and context-heavy.

## What Groundtruth Is

Groundtruth is a browser-first semantic 3D runtime/editor aimed at becoming an AI-native game engine.

Current reality:
- It is not yet a mature general engine.
- It is an engine-shaped platform with:
  - a semantic project/world model
  - an in-browser runtime/editor
  - project/templates/recipes/stamps
  - playtest/evaluation tooling
  - several implemented runtime modules
  - several optional runtime features
- It still contains too many built-in action/survival assumptions, but those are gradually being turned into policies and project data rather than hardcoded truths.

The user is explicitly sensitive to this distinction. Do not casually treat Groundtruth as “the zombie game.” Treat the zombie survival slice as one project built on top of Groundtruth.

## Current Branch Strategy

Repository root:
- `C:\Users\cobra\groundtruth`

Branch model:
- `main` is the reusable engine baseline
- `game/zombie-survival` is where the current playable zombie-survival game work is happening

Current working branch during this handoff:
- `game/zombie-survival`

This strategy is intentional. The user wanted a branch where game-specific work can continue without contaminating the baseline too aggressively.

Do not propose a separate repo yet unless Groundtruth becomes much more dependency-like and stable.

## User’s Core Intent

The user wants Groundtruth to become a genuine AI-native engine.

That means:
- the easy part should be adding mechanics/items/rules
- the hard part Groundtruth should help with is:
  - asset integration
  - world coherence
  - semantic worldbuilding
  - visual readability
  - human + AI collaboration

The user repeatedly called out that humans are better at visual judgment tasks like:
- model scale
- offset / ground contact
- facing/orientation
- overall “does this look right?”

So Groundtruth should support:
- AI doing setup and analysis
- human doing fast visual approval/correction
- engine storing those corrections semantically

That is why the Asset Fit workflow was added.

## Important Product Principles

These principles came up repeatedly and should be preserved.

### 1. Do Not Bake One Game Into Groundtruth

Use this decision order:
- project
- preset/policy
- feature
- engine core

If a change is:
- specific to one project: keep it in project data
- shared across a genre family: preset/policy/feature
- shared across all uses: core

This rule is documented in:
- `AGENTS.md`
- `docs/ENGINE_RULEBOOK.md`
- `docs/AI_OPERATOR_GUIDE.md`

### 2. Groundtruth Needs Real Project/Export Lifecycle

Groundtruth should not feel like “a game that also has an editor.”

It now has:
- save/open project
- world variants inside a project
- playable export JSON
- standalone packaging script

But the workflow still needs hardening and validation.

### 3. Visual Workflows Matter

The user explicitly wants workflows like:
- show model on floor
- adjust scale / offset / yaw
- save to prefab/project config

Do not regress back to “edit constants blind in code” if you can avoid it.

## Current Architecture Overview

### Core Data Layer

Files:
- `src/core/schema.ts`
- `src/core/worldStore.ts`
- `src/core/commands.ts`
- `src/core/policies.ts`

Important concepts:
- `ProjectDocument`
- `WorldDocument`
- entities
- prefabs
- zones
- objectives
- project runtime config
- gameplay policy overrides
- objective progress snapshots

Durable gameplay state should live in world/project data, not only feature-local runtime memory.

This was a real bug with objectives and was fixed by persisting objective progress into world state.

### Runtime / Editor Layer

Files:
- `src/main.ts`
- `src/runtime/sceneRuntime.ts`
- `src/runtime/physicsRuntime.ts`

What it does:
- browser shell
- editor UI
- world generation/load/reset
- play mode / authoring
- save/open/export
- viewport
- asset-fit preview
- runtime HUD and overlays

### Modules / Features

Files:
- `src/modules/registry.ts`
- `src/modules/thirdPersonAction.ts`
- `src/modules/thirdPersonSurvival.ts`
- `src/modules/actionModulePresets.ts`
- `src/modules/runtimeFeatureRegistry.ts`

Implemented modules:
- `third_person_survival`
- `third_person`
- `first_person`
- `top_down`
- `platformer`

Feature system exists. Current meaningful features include:
- combat
- interaction_inventory
- combat_feedback
- hostile_ai
- sector_population
- objective_progress

The long-term direction is:
- modules become mostly preset + feature composition
- fewer special-case subclasses

### Project / Template / Recipe Layer

Files:
- `src/core/projectTemplates.ts`
- `src/core/worldRecipes.ts`
- `src/core/worldStamps.ts`
- `src/core/exportFormat.ts`
- `scripts/export-playable-build.mjs`

Mental model:
- project = whole game workspace
- world variant = map/version within that project
- template = starting project slice
- recipe = stronger precomposed slice
- stamp = reusable world chunk

## Current Zombie Survival Game State

The user is now trying to build a real third-person zombie survival game on `game/zombie-survival`.

Current slice state:
- third-person player movement is working reasonably
- zombie animations are working on the current selected zombie asset
- pistol loop exists
- objective loop exists
- urban city world generation exists
- project save/open exists
- asset-fit exists

Still rough:
- richer worldbuilding
- better prop/environment integration
- weapon / inventory sophistication
- visual polish
- export validation
- more survival identity over time-based play

## Current Asset Situation

### Zombie Pack

Path:
- `public/assets/zombie_models`

Important notes:
- The current zombie uses:
  - `/assets/zombie_models/FBX/PS1_Zombie_2.fbx`
- Clip mapping that worked:
  - `IdleZ`
  - `WalkZ`
  - `GrabBiteZ`
  - `DamageZ`
  - `DieZ`
  - `ClimbGraveZ`

Do not blindly switch back to the other zombie FBX without rechecking fit/load behavior.

The zombie integration went through several failure modes:
- invisible model
- wrong clip names
- model sinking below ground
- asset preview issues

Treat zombie model changes cautiously and use Asset Fit.

### URBAN Pack

Path:
- `public/assets/urban_models`

Important structural findings:
- `Road type 2` is a modular 16x16 road kit
- `Buildings Prebuild` contains lot-sized blocks:
  - square flats about `17x17x17`
  - L-shape about `21x17x27`
- `Bus stops`, `Traffic lights`, `Cones & Barriers`, `Walls & Fences`, and `Litter` contain useful street dressing and blockers

Current URBAN integration lives in:
- `src/core/worldFactory.ts`

Current URBAN prefab coverage includes:
- roads
- apartment block variants
- bus stops
- street lights
- traffic lights
- jersey barriers
- cones
- metal fence
- plaster wall
- dumpster
- trash cans
- trash bag

Current generator:
- `makeUrbanCityWorld()`

Current UI entry points:
- `Build > World > Generate Urban City`
- `Build > Project > Urban City Survival`

### Why the URBAN Pack Matters

The user explicitly said the hard part of an AI-native engine is not “make another item.”
It is:
- coherent worldbuilding
- asset integration
- visual richness
- using human visual judgment where it matters

The URBAN work is directly aligned with that goal.

## Asset Fit Workflow

Groundtruth now has an Asset Fit workflow because blind code-based fitting was too brittle.

Where:
- `Inspect > Asset Fit`

What it does:
- separate preview viewport
- preview asset on neutral platform scene
- adjust:
  - scale
  - yaw
  - Y offset
- inspect raw/semantic clips
- apply the fit back into the prefab

Why it exists:
- user explicitly wanted a human-friendly visual fitting loop

Important:
- applied prefab fit should now survive template starts and refresh better than before
- but saved project flow is still the real intended persistence path

## Save / Open / Export State

Current workflow:
- `Save Project` = editable working file
- `Open Project` = load editable/saved project
- `Save World Variant` = save current world inside active project
- `Open World Variant` = switch world inside project
- `Export Project` = richer envelope
- `Build Playable Export` = player-oriented build doc

Keyboard:
- `Ctrl+S` saves project

Important UX cleanup already done:
- “project” vs “world variant” naming is explicit

## Known Important Bugs / Lessons

### Objective State Bug Class

We discovered a real class of bugs:
- gameplay-significant state living only in runtime feature instances
- that state disappearing on world rebuild/recreate

This happened with objective progress.

The fix:
- persist durable objective progress into world/project state

Carry this lesson forward:
- if the state answers “what has happened in the game?”
  - store it durably
- if it answers “what is happening this frame?”
  - runtime memory is fine

### Input/UI Collision Bug

There was a bug where `Space` could retrigger focused HTML controls and look like teleport/reset behavior.

Gameplay keys in play mode now explicitly capture/prevent default in the relevant input path.

Do not regress this.

### Template UI Reset Bug

The template dropdown used to reset itself to the first option when rebuilt.

This was fixed by preserving current selection and preferring project `templateId`.

If template behavior looks wrong again, inspect:
- `syncProjectTemplates()` in `src/main.ts`
- `startProjectFromTemplate()` in `src/main.ts`

## Current User Preferences / Expectations

These matter.

### The user values:
- directness
- architectural honesty
- clear separation between engine and game
- AI-native workflows that respect human strengths
- visual coherence / legibility

### The user dislikes:
- pretending Groundtruth is already more engine-like than it is
- hardcoding game-specific behavior without calling it out
- trial-and-error asset integration with no visual workflow
- vague terminology

### The user has explicitly pushed for:
- real project saving/loading
- branch separation between engine and game work
- docs for humans and AIs
- context preservation for future models

## Files Another LLM Should Know First

If you need to continue work, read these first:

### Must-read
- `AGENTS.md`
- `docs/ENGINE_RULEBOOK.md`
- `docs/AI_OPERATOR_GUIDE.md`
- `docs/USER_GUIDE.md`
- `docs/ROADMAP.md`
- `src/main.ts`
- `src/core/worldFactory.ts`
- `src/core/schema.ts`
- `src/core/worldStore.ts`
- `src/core/policies.ts`
- `src/modules/actionModulePresets.ts`
- `src/modules/thirdPersonAction.ts`
- `src/modules/thirdPersonSurvival.ts`
- `src/runtime/sceneRuntime.ts`

### Important supporting files
- `src/core/projectTemplates.ts`
- `src/core/worldRecipes.ts`
- `src/core/worldStamps.ts`
- `src/core/evaluation.ts`
- `src/core/exportFormat.ts`
- `scripts/export-playable-build.mjs`
- `src/docs/helpContent.ts`

## Where to Put Future Changes

Use this rubric every time:

### Put it in project data if:
- it is specific to the zombie game
- it is specific to a world slice
- it is content
- it is tuning
- it is a fit/placement choice for one project

### Put it in preset/policy if:
- multiple action-style games might want it
- it is a rule choice like:
  - facing mode
  - respawn mode
  - loot behavior
  - aggro/leash tuning
  - camera style

### Put it in a feature if:
- it is an optional runtime capability
- multiple modules may want it on/off
- examples:
  - hostile AI
  - objective tracking
  - combat feedback
  - sector population

### Put it in core if:
- every project/module will rely on it
- it is schema/runtime/editor infrastructure

## Session Work Log (2026-03-18)

This section documents everything done in the most recent working session. The user set 5 priorities and asked the AI to work through them continuously.

### Agreed Priorities

1. **P1: Fix spatial foundation** — dumpster collision bug, physics diagnostics
2. **P2: Simplify UI** — reduce sidebar noise, promote gameplay policy
3. **P3: Expand asset viewer** — collision controls, animation speed
4. **P4: Semantic map editing** — not started, needs design discussion
5. **P5: Keep scripting semantic** — already working (policies, features, presets)

### P1: Fix Spatial Foundation

**Rapier broad-phase fix** (`src/runtime/physicsRuntime.ts`):
- Added `nextWorld.step()` after creating all bodies/colliders in `syncWorld()` so Rapier populates its broad-phase acceleration structure before the character controller queries it. Without this, `computeColliderMovement()` could miss colliders that were just created.

**Physics diagnostics**:
- Added body count summary on each `syncWorld()`: logs static/kinematic/dynamic body counts and total collider count
- Added player physics debug to the in-game HUD (grounded state, collision count, physics position, desired delta) via `getEntityDebug()` method
- Removed ad-hoc per-entity debug logging for dumpsters/barriers/fences

**Status**: The dumpster collision bug is **still unresolved**. Exhaustive code analysis showed the physics setup is correct — all entities use the same placement convention, collider sizes and filter predicates check out. The broad-phase fix may resolve it but needs live testing. The diagnostics are in place to help debug if it persists.

**Key physics convention**: Entity position = object center. `modelOffset` = visual-only shift (THREE.js child offset). Physics collider sits at entity position with no offset (unless compound shape with explicit offset).

### P2: Simplify UI

Major restructuring of `src/main.ts` sidebar:

- **Gameplay Policy** moved to top of Build tab (right after Project), opened by default
- Camera distance/pitch are the first controls visible
- World parameters (seed, size, counts) collapsed behind “Advanced parameters” subsection
- Project buttons simplified — Save/Open Variant and Export behind “More project options” `<details>` subsection
- Authoring, Stamps, Sectors, Evaluation sections closed by default
- Overview card reduced from 9 rows to 5
- Brand text updated: “Game Engine” / “AI-native 3D game engine”
- “Generate Urban City” is the first/promoted world generator button

**Model Tuning section removed entirely** — it was redundant with Asset Fit. Removed: `syncModelTuningInputs`, `applySelectedModelTuning`, `modelTuningBoundEntityId`, all related HTML, event handlers, querySelector bindings, and null checks.

**Merged Open Project + Open Playable Export** into a single “Open” button. `resolveImportedProject()` in `src/core/exportFormat.ts` already handles all three formats (raw ProjectDocument, export envelope, playable build), so two separate buttons and file inputs were unnecessary. The handler now auto-detects format and shows an appropriate import message.

**Removed beforeunload popup** — the “Reload site? Changes that you made may not be saved” dialog was disabled because it was disruptive during development. Project state is saved explicitly via Save Project.

### P3: Expand Asset Viewer

**Collision controls** added to Asset Fit panel:
- Shape type dropdown (none / box / cylinder / sphere / capsule)
- Solid/sensor toggle checkbox
- Size X/Y/Z inputs
- Offset X/Y/Z inputs — non-zero offset creates a single-child compound shape (`PhysicsCompoundShape`), loading a single-child compound populates the offset fields back

Key functions added to `src/main.ts`:
- `buildAssetFitPrimitiveShape()` — reads shape type + size inputs → `PhysicsPrimitiveShape`
- `buildAssetFitCollisionOffset()` — reads offset inputs → `Vec3`
- `buildAssetFitPhysicsShape()` — combines primitive + offset → `PhysicsShape` (compound if offset is non-zero)
- `buildAssetFitPhysicsComponent()` — wraps shape with body type + sensor flag
- `syncAssetFitInputs()` updated to populate collision fields from prefab (handles simple shapes, single-child compounds, and no-physics)

**Apply To Prefab** now saves collision settings (preserves existing body type from prefab).

**Live collision wireframe preview** in Asset Fit viewport — `sceneRuntime.setAssetFitPreview()` extended with optional `physicsShape` parameter that renders wireframe collider geometry.

**Animation speed control** added:
- New “Anim speed” input next to animation dropdown
- Wired through `parseAssetFitAnimationSelection()` → `AnimationComponent.speed`
- Scene runtime already supported `animation.speed` via `setEffectiveTimeScale()`
- Resets to 1.0 when switching prefabs

### P4: Semantic Map Editing
Not started. Needs design discussion with user.

### P5: Keep Scripting Semantic
Already working via policies, features, and presets. No changes needed.

### CSS Changes

Added `.subsection` style to `src/styles.css` for nested collapsible parameter groups:
- Thin top border, smaller font, `+`/`-` toggle markers
- Used by “Advanced” in World section and “More project options” in Project section

### Type Error Fixed

`TS2352` in `buildAssetFitPhysicsComponent` — `PhysicsShape` couldn’t cast directly to `Record<string, unknown>` because `PhysicsCompoundShape` doesn’t have an index signature. Fixed with double-cast: `shape as unknown as Record<string, unknown>`.

## Current “Next Best Work”

If continuing the zombie game / Groundtruth hybrid path, the highest-value areas are:

1. **Live-test dumpster collision fix** — the broad-phase fix and diagnostics are in place, user needs to play and see if dumpsters/barriers now block the player. Check console for `[physics-sync]` log and HUD for collision count.
2. richer urban world coherence
3. more URBAN prop integration
4. better extraction / landmark readability
5. targeted real asset integration for player / weapon / buildings
6. validation of save/open/export workflow in real use

The user currently cares more about:
- world richness
- asset integration
- coherence

than about endlessly adding more mechanics.

## Concrete Next Steps After This Handoff

Good next moves:

1. **Test collision fix** — play the game and walk into dumpsters/barriers/fences. If they still don’t block, look at HUD collision count and `[physics-sync]` log to narrow down.
2. **Semantic map editing (P4)** — design discussion needed. Possible directions: click-to-place entities, drag-to-move, entity property inspector in viewport.
3. **Asset Fit remaining work** — standalone panel mode (pop out into separate window), batch fitting
4. Tune newly added URBAN clutter props that float/sink
5. Add more lot dressing: fences, barriers, dumpsters, curb clutter
6. Add clearer objective/extraction landmarking in the urban slice
7. Start integrating more of the user’s real models through Asset Fit

## Operational Notes

- Always run `npm run build` or `npx tsc --noEmit` after changes to verify.
- The repo may have untracked asset folders (`public/assets/urban_models/`, `public/assets/zombie_models/`, `public/assets/items_models/`) and temp export artifacts (`tmp-playable-build/`, `tmp-playable-build-2/`).
- Do not revert unrelated dirty worktree changes unless explicitly asked.
- The user finds the beforeunload popup annoying — it has been disabled. Don’t re-enable it.

## Final Reminder

Do not optimize for “adding more features” unless they solve the real bottleneck.

The real bottleneck the user identified is:
- how to make a rich, coherent, playable world
- with assets and human visual judgment in the loop

Groundtruth becomes valuable if it makes that easier.
