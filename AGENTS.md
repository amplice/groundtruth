# Groundtruth Agent Rules

Groundtruth is an AI-native game engine project. Treat it as an engine under construction, not as a single built-in game that happens to have editing tools.

## Core Rule

Before changing code, decide which layer the change belongs to:

1. `project`
2. `preset / policy`
3. `feature`
4. `engine core`

Always choose the lowest layer that solves the problem cleanly.

## Placement Rules

### Put it in the project when it is game-specific

Examples:

- zombie stats
- loot tables
- building placement
- world variants
- objective zones
- encounter density
- game-specific prefab choices
- project-level gameplay policy overrides

### Put it in a preset or policy when it is a reusable design choice

Examples:

- facing mode
- camera feel
- respawn behavior
- loot behavior
- attack targeting
- attack movement lock
- hostile aggro/leash tuning

### Put it in a feature when it is an optional capability

Examples:

- combat
- hostile AI
- interaction/inventory
- combat feedback
- sector population

### Put it in engine core only when all games need it

Examples:

- project format
- world schema
- prefab/entity/zone system
- runtime feature system
- export/build pipeline
- authoring shell
- save/load
- player/editor boot separation

## Things To Avoid

- Do not bake the zombie survival game into Groundtruth core.
- Do not hardcode project taste into shared runtime code.
- Do not change engine defaults for one project unless the behavior becomes policy-driven.
- Do not add UI copy that assumes survival/zombies are the engine's default identity.
- Do not put game content into `src/modules` unless it is actually reusable module logic.

## Decision Test

Ask these questions before editing:

1. Is this only true for one game project?
2. Would another third-person action game reasonably want a different answer?
3. Is this a reusable capability or just content?
4. Can this be expressed with project data before changing engine code?

If the answer to 1 or 2 is yes, it probably does not belong in core.

## Folder Map

- `src/core`
  - engine-level data formats and semantic systems
  - project/world schema
  - commands
  - policies
  - recipes/stamps/templates
  - evaluation
- `src/modules`
  - reusable runtime modules and runtime features
  - not project content
- `src/runtime`
  - renderer, physics, input, player/editor boot behavior
- `src/docs`
  - in-app docs content
- `docs`
  - human and AI repo docs

## Content Placement Guidance

If building a specific game, prefer these containers:

- project JSON / project export
- world variants
- prefab specs
- zones
- recipes
- stamps
- gameplay policy overrides
- feature toggles

Only create new engine files when those are not enough.

## Export Guidance

Groundtruth distinguishes:

- snapshot export
- editable project export
- playable build export
- standalone packaged playable folder

Do not blur these concepts in future changes.

## Documentation Rule

If you change:

- engine boundaries
- where content should live
- export workflow
- project/preset/feature/core responsibilities

you must update the human and/or AI docs in the same change.
