# Groundtruth Roadmap

This roadmap is the current large-scale plan for moving Groundtruth from a strong prototype toward a reusable AI-native game construction platform.

## Phase 1: Project System

Goal: make `project` the top-level unit of work instead of just the current world.

Steps:

1. Add `ProjectDocument` schema and metadata.
2. Make the store project-aware while preserving current world access for runtime modules.
3. Add project import/export.
4. Add project-first UI workflow around templates and current world tracking.
5. Teach snapshots to carry project context.

## Phase 2: Capability Completion

Goal: make runtime features the main extension model.

Steps:

1. Continue extracting optional systems into runtime features.
2. Add per-feature config and persistence.
3. Reduce mode-specific logic to presets plus feature composition.
4. Expose feature toggles in the UI.

## Phase 2.5: Gameplay Policies

Goal: stop treating the built-in third-person survival slice as engine truth.

Steps:

1. Define policy objects for third-person-style action modules.
2. Move camera, facing, loot, respawn, and related behavior out of hardcoded runtime paths.
3. Persist project-level policy overrides alongside feature overrides.
4. Expose the first batch of policy controls in the UI and semantic command surface.
5. Keep extending that policy layer until presets like `third_person` and `third_person_survival` are mostly declarative.

## Phase 3: World Recipes

Goal: give humans and AIs a higher-level construction language than generators plus manual edits.

Steps:

1. Add recipe definitions that combine generators, stamps, prefab placement, and zones.
2. Add recipe previews and summaries.
3. Allow recipe-driven command scripts.
4. Make evaluation recipe-aware.

## Phase 4: Structured Playtesting

Goal: make the iteration loop explicit.

Steps:

1. Add playtest sessions.
2. Capture structured runtime telemetry.
3. Export playtest reports with snapshots and findings.
4. Feed those reports back into evaluation.

## Phase 5: Scale Architecture

Goal: make the sector system more believable as a large-world substrate.

Steps:

1. Add sector budgets.
2. Move toward semantic group reactivation instead of exact actor memory where possible.
3. Improve scale diagnostics and stress tooling.
4. Tighten feature-aware performance reporting.

## Phase 6: Non-Action Pressure Test

Goal: prove the engine substrate is broader than adjacent action modes.

Candidate next deep module:

- `puzzle`, or
- `driving`

The purpose is not feature count. The purpose is testing whether Groundtruth's abstractions stay coherent when the gameplay model changes substantially.

## Parallel Track: Project Export

Goal: separate editable project state from a future standalone playable export.

Steps:

1. Formalize the project manifest and current editable project export format.
2. Separate editable project export from playable game export.
3. Add a player-only runtime shell for built games.
4. Make exported builds loadable again as project seeds for further editing.
