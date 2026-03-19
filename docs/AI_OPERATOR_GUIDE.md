# Groundtruth AI Operator Guide

This guide is for an AI agent that needs to build or modify a game inside Groundtruth.

Before making architecture changes, also read [ENGINE_RULEBOOK.md](./ENGINE_RULEBOOK.md).
If you are taking over active branch work and need the fullest current-state context, also read [LLM_HANDOFF.md](./LLM_HANDOFF.md).

Groundtruth should be treated as a semantic runtime/editor. The normal path is:

1. Choose the closest implemented game mode.
2. Start from a template in `Project` or a generator in `World`.
3. Apply stamps for larger structure.
4. Use semantic commands or authoring edits for fine-grained changes.
5. Validate with `World`, `Play`, `Assets`, and `Debug`.
6. Export a snapshot when the world reaches a useful state.

Current top-level workspaces:

- `Project`: templates, variants, save/open/export, features, gameplay policy, command script
- `World`: generators, authoring, scene/inspector/evaluation
- `Play`: overlay toggles, issues, playtest
- `Assets`: asset validation and asset fitting
- `Debug`: deep runtime/session/sector/event state

Current shell behavior:

- primary modes are along the top, not buried in the old sidebar
- the active workspace opens in a thin left tool rail
- `Play` should stay lighter than `World` and `Assets`
- `Hide Workspace` is the quick way to maximize viewport space for screenshots or playtesting

Asset-fit behavior now persists more than just placement:

- semantic clip bindings save into prefab render config
- semantic clip speeds also save into prefab render config
- runtime playback multiplies the live animation speed by the saved per-slot speed override
- multi-child compound collision is preserved and previewed as compound; do not flatten it unless you are intentionally replacing it

## What Groundtruth Is

Groundtruth is not primarily a raw three.js code-editing task surface.

It is a browser runtime/editor with:

- projects
- project-level feature toggles
- project-level gameplay policy overrides
- game modes
- project templates
- procedural generators
- reusable world stamps
- semantic entities and zones
- in-world authoring
- evaluation and debug tools
- command-script driven world mutation

## Before Editing Engine Code

Use this responsibility order:

1. project
2. preset / policy
3. feature
4. engine core

If a change is specific to one game, keep it in the project unless that becomes untenable.

## Implemented Modes

Use only these as fully implemented runtime targets:

- `third_person_survival`
- `first_person`
- `third_person`
- `top_down`
- `platformer`

Other listed modes are labels or future intent, not full implementations yet.

## Recommended Build Loop

1. Choose a mode based on the requested game slice.
2. Start from `Project` if a template is close enough.
3. Otherwise use `World`:
   - `Generate Flat Outpost` for general combat sandboxes
   - `Generate Town Grid` for street/block structure
   - `Generate Urban City` for denser modular city-block tests using the URBAN kit
   - `Generate Scale Test` for sector/scale behavior
   - `New Empty World` for a blank authored start
4. Use `World > Stamps` to add larger chunks before placing single entities.
5. Use `World > Authoring` for manual edits:
   - `Place`
   - `Move`
   - `Resize`
   - `Zone`
6. Use `Project > Command Script` for repeatable semantic changes.
7. Switch to `Play`, test the world, then read:
   - `World > Evaluation`
   - `Debug > Issues`
   - `Assets > Asset Fit` for asset-level problems
   - `Debug > Events`
8. Export a snapshot when the result or failure case is worth preserving.
9. Use `Save Project` for the normal editable working file and `Export Project` when you want the richer project envelope.
10. Use `Build > Features` when the project needs capability-level changes such as disabling hostile AI, combat, interaction, combat feedback, or sector population.
11. Use `Build > Gameplay Policy` when the module is correct but the rules need to change, such as facing mode, respawn behavior, loot behavior, or camera feel.
12. That same policy layer now also covers attack targeting, attack movement locking, and hostile aggro/leash tuning for the action-family modules.
13. Use `Build > Recipes` when a request maps cleanly to a coherent precomposed slice rather than a raw template or generator.
14. Use the Runtime playtest session/report flow when you want a structured artifact of a run, not just a snapshot.
15. Read the derived playtest findings as another evaluation surface, not just the raw event log.
16. Use iteration suggestions when you want Groundtruth to propose concrete follow-up commands from evaluation and playtest outcomes.
17. Read suggestion history before applying a suggestion again; Groundtruth now tracks how often each suggestion was applied in the current world and marks recently repeated suggestions.
18. Export playtest reports at meaningful checkpoints; Groundtruth stores the last exported playtest summary and compares the current session against that baseline.

## Mode Selection Guidance

- `third_person_survival`
  - Best for: zombies, loot, hostile AI, sector simulation, richest current slice
- `first_person`
  - Best for: street-level combat and first-person readability checks
- `third_person`
  - Best for: general action combat without survival-specific sector emphasis
- `top_down`
  - Best for: overhead layout and action-space experiments
- `platformer`
  - Best for: side-view traversal and lane-based combat tests

If the requested genre is unsupported, pick the closest implemented mode and state the approximation.

## Templates

Use templates first when possible.

Current templates:

- `Survival Outpost`
- `Third-Person Arena`
- `First-Person Patrol`
- `Urban City Survival`
- `Top-Down Encounter`
- `Platformer Course`

Templates automatically switch the active game mode to the correct one.

Project export/import now exists separately from snapshot export/import. Prefer project export when you want to preserve project metadata and future project structure.

Projects can now store multiple world variants. Use that when you want alternate layouts or variants inside the same project instead of exporting separate single-world snapshots for everything.

Playable export is now a separate concept from editable project export:

- editable project export: preserve authoring state for Groundtruth
- playable build export: preserve a player-facing package seed

To package a standalone folder after exporting a project or playable build JSON:

```bash
npm run build
npm run export:playable -- --project path/to/project-or-playable.json --out path/to/output-folder
```

## Generators

- `Generate Flat Outpost`
  - General-purpose playable world
- `Generate Town Grid`
  - Road-and-block world with clearer first-person/top-down readability
- `Generate Urban City`
  - Denser city-block world built from URBAN roads, flats, bus stops, and traffic landmarks
- `Generate Scale Test`
  - Larger stress scenario for sector behavior

Important: if you change Game Mode, generate or load a world again. The mode switch alone does not rebuild the world.

## Stamps

Use stamps to grow an existing world without rebuilding from scratch.

Current stamps:

- `Street Block`
- `Arena Cluster`
- `Platform Run`
- `Loot Cluster`
- `Encounter Cluster`

Recommended pattern:

1. Start from a template or generator.
2. Apply one or two stamps.
3. Use authoring tools to clean up placement, size, and zones.

## Recipes

Use recipes when you want a stronger starting point than a plain template or generator.

Current recipes:

- `survival_town`
- `first_person_sweep`
- `top_down_hotzone`
- `platformer_gauntlet`

Recipes combine:

- a game mode
- a base generated world
- one or more stamps
- initial project-level feature defaults

## Command Script Guidance

The command script is the best repeatable mutation surface for another AI.

Prefer it for:

- setting project metadata
- enabling or disabling project features
- starting a project from a template
- saving or reopening world variants
- changing game mode
- renaming worlds
- generating a base world
- spawning/updating/deleting entities
- defining/deleting zones
- updating prefab definitions

Example:

```json
[
  { "op": "set_project_name", "name": "Town Patrol Test" },
  {
    "op": "set_project_gameplay_policy",
    "policyId": "first_person_action",
    "patch": {
      "loot": { "emptyContainerMode": "persist" },
      "respawn": { "mode": "disabled" }
    }
  },
  { "op": "start_world_recipe", "recipeId": "first_person_sweep" },
  { "op": "set_project_feature", "featureId": "sector_population", "enabled": false },
  { "op": "save_project_world", "name": "Town Patrol Variant A" }
]
```

## Validation Workflow

Do not assume a rendered world is valid.

Check these surfaces in this order:

1. `Inspect > Evaluation`
2. `Runtime > Issues`
3. `Inspect > Assets`
4. `Runtime > Events`
5. `Inspect > Inspector` / `Inspect > Selection` for specific entities or zones

Useful signals:

- missing player/enemies/loot
- reachability problems
- sector density issues
- asset/clip load failures
- runtime findings
- suspicious event patterns

When running iterative repair loops:

1. Start a playtest session.
2. Reproduce the problem.
3. Export a playtest report to establish a baseline.
4. Review `Runtime > Iteration`.
5. Prefer suggestions that have not already been applied repeatedly unless you are intentionally A/B testing.
6. Apply one suggestion, regenerate or replay as needed, then compare the new playtest session against the last exported baseline.

## Scale Guidance

Sector behavior is most developed in `third_person_survival`.

Use `Generate Scale Test` and inspect:

- `Runtime > Sectors`
- sector overlay
- `Inspect > Evaluation`

Current scale support is an early sector architecture, not a finished massive-world simulation stack.

## Things An AI Should Avoid

- Do not change mode without regenerating or loading a world again.
- Do not overuse low-level engine edits when templates, stamps, commands, or authoring are enough.
- Do not assume unsupported mode labels are fully implemented.
- Do not judge only by visuals; always check evaluation/runtime surfaces.
- Do not keep mutating a broken world without exporting a snapshot first.

## Human Handoff

If a human is involved, the most useful requests back to them are:

- playtest feel feedback
- visual readability feedback
- art/animation fit
- whether the chosen mode is the right approximation
