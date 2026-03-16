# Groundtruth AI Operator Guide

This guide is for an AI agent that needs to build or modify a game inside Groundtruth.

Groundtruth should be treated as a semantic runtime/editor. The normal path is:

1. Choose the closest implemented game mode.
2. Start from a template or generator.
3. Apply stamps for larger structure.
4. Use semantic commands or authoring edits for fine-grained changes.
5. Validate with Evaluation, Issues, Assets, and Events.
6. Export a snapshot when the world reaches a useful state.

## What Groundtruth Is

Groundtruth is not primarily a raw three.js code-editing task surface.

It is a browser runtime/editor with:

- game modes
- project templates
- procedural generators
- reusable world stamps
- semantic entities and zones
- in-world authoring
- evaluation and debug tools
- command-script driven world mutation

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
2. Start from `Build > Project` if a template is close enough.
3. Otherwise use `Build > World`:
   - `Generate Flat Outpost` for general combat sandboxes
   - `Generate Town Grid` for street/block structure
   - `Generate Scale Test` for sector/scale behavior
   - `New Empty World` for a blank authored start
4. Use `Build > Stamps` to add larger chunks before placing single entities.
5. Use `Build > Authoring` for manual edits:
   - `Place`
   - `Move`
   - `Resize`
   - `Zone`
6. Use `Build > Command Script` for repeatable semantic changes.
7. Switch to `Play`, test the world, then read:
   - `Inspect > Evaluation`
   - `Runtime > Issues`
   - `Inspect > Assets`
   - `Runtime > Events`
8. Export a snapshot when the result or failure case is worth preserving.

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
- `Top-Down Encounter`
- `Platformer Course`

Templates automatically switch the active game mode to the correct one.

## Generators

- `Generate Flat Outpost`
  - General-purpose playable world
- `Generate Town Grid`
  - Road-and-block world with clearer first-person/top-down readability
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

## Command Script Guidance

The command script is the best repeatable mutation surface for another AI.

Prefer it for:

- changing game mode
- renaming worlds
- generating a base world
- spawning/updating/deleting entities
- defining/deleting zones
- updating prefab definitions

Example:

```json
[
  { "op": "set_world_name", "name": "Town Patrol Test" },
  { "op": "set_game_mode", "gameMode": "first_person" },
  { "op": "generate_town_world" },
  {
    "op": "spawn_entity",
    "entity": {
      "id": "zombie.spawned.1",
      "name": "Spawned Zombie",
      "prefabId": "zombie_basic",
      "transform": {
        "position": { "x": 6, "y": 1.1, "z": -4 },
        "rotation": { "x": 0, "y": 0, "z": 0 },
        "scale": { "x": 1, "y": 1, "z": 1 }
      }
    }
  }
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
