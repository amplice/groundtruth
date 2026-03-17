# Groundtruth Engine Rulebook

This document exists to keep Groundtruth from collapsing back into "one built-in game with editor powers."

Use it when deciding where a change belongs.

## The Four Layers

Groundtruth should be developed through four layers:

1. `project`
2. `preset / policy`
3. `feature`
4. `engine core`

The safest rule is:

> put a change in the lowest layer that can express it cleanly

## 1. Project

This is where a specific game should live.

Typical project responsibilities:

- world variants
- prefab selection
- entity placement
- zones
- recipes and stamps used by the project
- project metadata
- project-level gameplay policy overrides
- project-level feature toggles

Examples:

- "this zombie does 12 damage"
- "this town has three loot clusters"
- "this project uses move-vector facing instead of cursor aim"
- "this survival project disables manual respawn"

If another game would probably want a different answer, it should usually start here.

## 2. Preset / Policy

This is where genre-shaping decisions should live.

Typical preset/policy responsibilities:

- camera behavior
- facing behavior
- respawn behavior
- loot behavior
- combat targeting
- attack movement locking
- hostile aggro/leash tuning

Examples:

- `third_person_action`
- `third_person_survival`
- `first_person_action`
- `top_down_action`

If a behavior is reusable across many games of the same family, it belongs here before it belongs in core.

## 3. Feature

This is where optional capabilities should live.

Typical feature responsibilities:

- combat
- hostile AI
- interaction/inventory
- combat feedback
- sector population

Features should be:

- optional
- composable
- cheap when disabled

If a game does not enable a feature, the runtime should not behave as if that feature exists.

## 4. Engine Core

This is where universal systems live.

Typical core responsibilities:

- project format
- world schema
- semantic commands
- policy format
- save/load
- export/build pipeline
- editor/player boot paths
- authoring shell
- runtime/render/physics integration

Core should not carry the taste of one game.

## Decision Matrix

Use this matrix before editing:

### Put it in project data if:

- it is specific to one game
- it is specific to one world
- it is content, not reusable behavior

### Put it in preset/policy if:

- many games in the same genre family could use it
- different projects might want different answers
- it changes the feel or rule set, not the existence of a capability

### Put it in a feature if:

- it is optional
- it should consume little or no runtime work when disabled
- it represents a reusable system, not a one-game rule

### Put it in core if:

- every project depends on it
- it is infrastructure
- it is needed regardless of genre

## Anti-Patterns

Avoid these:

- hardcoding zombie-survival assumptions into shared runtime code
- changing engine defaults just because one project prefers them
- putting world content into `src/modules`
- putting reusable policies into project-only ad hoc fields
- making exported playable builds depend on editor-only assumptions

## Folder Structure

### `src/core`

Purpose:

- engine-level data formats and semantic systems

Contains:

- schema
- commands
- policies
- templates
- recipes
- stamps
- evaluation
- iteration logic
- export format

### `src/modules`

Purpose:

- reusable gameplay modules and optional runtime features

Contains:

- mode presets
- module registry
- feature implementations

Should not contain:

- project-specific enemy rosters
- one-off world content
- game-specific layout data

### `src/runtime`

Purpose:

- browser/runtime execution layer

Contains:

- scene runtime
- physics runtime
- input
- player/editor boot behavior

### `docs`

Purpose:

- persistent repo docs for humans and other AIs

### `src/docs`

Purpose:

- in-app docs/tutorial content

## Export Rule

Groundtruth must continue to distinguish:

- snapshot export
- editable project export
- playable build export
- packaged standalone playable folder

Do not merge these concepts back together.

## Practical Guidance For Future AI Agents

If a user says:

- "change how this specific game feels"
  - prefer project policy override
- "make this optional capability exist"
  - prefer feature
- "support a reusable genre behavior"
  - prefer preset/policy
- "make exports/save/load/editor/player work"
  - prefer core

When in doubt, choose the more data-driven layer first.
