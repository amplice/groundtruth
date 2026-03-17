# How To Use Groundtruth (Human Guide)

Groundtruth is currently best thought of as a browser-based game runtime and world editor.

If you are looking for the AI-facing instructions instead, use [AI_OPERATOR_GUIDE.md](./AI_OPERATOR_GUIDE.md).

The easiest way to use it is:

1. Pick a game mode.
2. Start from a template or generate a world.
3. Adjust project features or gameplay policy if the module is close but the rules are wrong.
4. Click `Play`.
5. Click once inside the 3D viewport.
6. Move around and test the world.
7. Switch back into authoring tools when you want to edit it.

## First Run

1. Open Groundtruth in the browser.
2. In the `Build` workspace, open the `Project` section.
3. Set the project template to `Survival Outpost`.
4. Click `Start Project From Template`.
5. In `Authoring`, click `Play`.
6. Click once in the viewport so keyboard input goes to the game.
7. Move around, attack, loot, and test the world.

If you do not want to use a template on the first run, open `Build > World`, pick `Third-Person Survival`, and click `Generate Flat Outpost` or `Generate Town Grid`.

## Recommended Walkthrough

If you want to understand Groundtruth quickly, use this order:

1. Start with `Third-Person Survival`.
2. Use `Start Project From Template` with `Survival Outpost`.
3. Click `Play` and test movement, combat, and looting.
4. Open `Runtime > Debug View` and enable `Aggro radii` and `Sector overlay`.
5. Switch to `Inspect > Evaluation` and read the world warnings.
6. Go back to `Build > Authoring`, switch to `Place`, and add a few crates or zombies.
7. Use `Build > Stamps` to apply an `Encounter Cluster` or `Loot Cluster`.
8. Export a snapshot before experimenting further.

## Game Modes

### Third-Person Survival

- Controls: `WASD` move, `Shift` sprint, `Space` attack, `E` loot/interact
- Best for: the fullest current slice, including zombies, loot, and sector simulation

### First-Person

- Controls: `WASD` move, `Shift` sprint, `Space` attack, `E` interact
- Best for: close-range prototype combat and first-person layout testing

### Third-Person

- Controls: `WASD` move, `Shift` sprint, `Space` attack, `E` interact
- Best for: general third-person combat and layout testing without the survival-specific layer

### Top-Down

- Controls: `WASD` move, `Shift` sprint, `Space` attack, `E` interact
- Best for: overhead combat and simpler action-space testing

### Platformer

- Controls: `A/D` move, `Shift` sprint, `Space` jump, `F` attack, `E` interact
- Best for: side-view movement and traversal testing

## Build Workspace

The `Build` workspace is where you create or reshape the world.

### Project

Use this when you want to start from a coherent template instead of a blank or procedural seed.

- Enter a project name
- Pick a template
- Click `Start Project From Template`
- The selected template will also switch the active game mode for you
- `Project Worlds` shows the worlds currently stored in the project
- `Save Current World Copy` stores the active world as another project world
- `Open Project World` switches the runtime to the selected project world
- `Export Project` saves the whole active project
- `Build Playable Export` saves a player-focused build document
- `Import Project` restores a previously exported project
- `Import Playable Export` loads a playable build document back into the editor as a project seed

Current templates include:

- Survival Outpost
- Third-Person Arena
- First-Person Patrol
- Top-Down Encounter
- Platformer Course

`First-Person Patrol` and `Top-Down Encounter` currently start from the town-grid style.

If you want a standalone playable folder instead of just a JSON export, use:

```bash
npm run build
npm run export:playable -- --project path/to/your.project.json --out path/to/output-folder
```

That copies the built web runtime into the output folder, writes `game.json`, and boots the export in player mode instead of the full editor shell.

### World

- `Generate Flat Outpost`: creates a normal procedural test world
- `Generate Town Grid`: creates a town-like road-and-block test world
- `Generate Scale Test`: creates a larger stress-test world
- `New Empty World`: gives you a blank world
- `Load Survival Slice`: loads the authored survival demo
- `Reset World`: resets to the default empty state
- `Export Snapshot`: saves the current world and screenshot
- snapshots also carry the current project context
- `Import Snapshot`: restores a saved snapshot
- `Capture Screenshot`: updates the screenshot preview
- `Stress Test Swaps`: repeatedly swaps worlds and selections to test rebuild stability

Use these as a rule of thumb:

- `Generate Flat Outpost` when you want a fast, general-purpose combat sandbox
- `Generate Town Grid` when you want clearer streets, blocks, and first-person/top-down readability
- `Generate Scale Test` when you want to stress sectors and large-world behavior

### Authoring

Use these modes to change the world directly:

- `Play`: control the character
- `Place`: click on the ground to place the selected prefab
- `Move`: drag a selected entity or zone to a new position
- `Resize`: drag outward to resize the selected entity or zone
- `Zone`: click to place semantic zones such as spawn, safe, loot, encounter, objective, or trigger

Useful fields:

- `Prefab`: what will be placed in `Place` mode
- `Place scale`: scale for newly placed entities
- `Place yaw deg`: rotation for newly placed entities
- `Zone kind`: what type of zone you are placing
- `Zone shape`: sphere or box
- `Zone size`: footprint size for new zones

Buttons:

- `Apply To Selected`: applies the current transform or zone settings to the selected object
- `Delete Selected`: removes the selected entity or zone

### Stamps

Stamps add reusable chunks of level structure into the current world.

Current stamps include:

- Street Block
- Arena Cluster
- Platform Run
- Loot Cluster
- Encounter Cluster

Use them when you want to grow the world quickly without placing every object manually.

A good pattern is:

1. Start from a template or generated world.
2. Add a stamp to create a new area.
3. Switch to `Place` or `Zone` for small edits.
4. Use `Move` and `Resize` to tune what you just added.

### Recipes

Recipes start a more coherent project slice than a plain generator.

Current recipes include:

- Survival Town
- First-Person Sweep
- Top-Down Hotzone
- Platformer Gauntlet

Use `Start Project From Recipe` when you want Groundtruth to combine a mode, base layout, stamps, and feature defaults in one step.

### Features

This section controls project-level runtime capabilities for the active mode.

- Toggle capabilities like hostile AI, combat, interaction, combat feedback, or sector population on and off
- These toggles are saved with the project
- Turning a feature off removes that capability from the active module instead of only hiding its UI

### Gameplay Policy

This section is where Groundtruth starts behaving more like an engine instead of one fixed built-in game.

Use it when the active module is close, but the rules need to change for your project.

Current first-pass policy controls include:

- `Facing`: move vector, cursor aim, or camera forward
- `Idle facing`: keep last, cursor aim, or camera forward
- `Camera distance`
- `Camera pitch`
- `Attack targeting`: nearest hostile or none
- `Lock movement on attack`
- `Loot transfer`: take one or take all
- `Empty container`: persist or despawn
- `Respawn mode`
- `Respawn key`
- `Aggro scale`
- `Leash scale`

Buttons:

- `Apply Policy`: saves the current policy override into the active project
- `Reset To Preset`: removes the project override and returns to the preset default

These are project-level behavior choices, not engine code edits.

### Command Script

This lets you change the world with JSON instead of clicking everything manually.

Use it when you want repeatable semantic edits.

Example:

```json
[
  { "op": "set_project_name", "name": "Town Patrol Prototype" },
  { "op": "start_world_recipe", "recipeId": "first_person_sweep" },
  { "op": "set_project_feature", "featureId": "sector_population", "enabled": false },
  {
    "op": "set_project_gameplay_policy",
    "policyId": "third_person_survival",
    "patch": {
      "facing": { "mode": "move_vector" },
      "loot": { "emptyContainerMode": "persist" }
    }
  },
  { "op": "save_project_world", "name": "Town Patrol Variant A" }
]
```

You can use the command script for both world changes and project changes.

## Inspect Workspace

The `Inspect` workspace is for understanding what is in the world and what is wrong with it.

### Scene

- Browse entities and zones
- Search by name or id
- Filter to actors, loot, zones, buildings, and more
- Click items to select them

### Inspector

Shows runtime, visual, and physics information for the selected entity or zone.

Use this first when something looks wrong.

### Evaluation

Shows world-level findings such as:

- missing player
- no enemies
- no loot
- sector density issues
- reachability problems
- other validation warnings

### Diagnostics

This is a more raw/debug-heavy view of world state.

### Assets

Shows asset load state and warnings for models and animation clips.

### Model Tuning

For selected model entities:

- change scale
- change yaw
- change Y offset

Then click `Apply Tuning`.

### Selection

Shows the raw JSON for the selected entity or zone.

## Runtime Workspace

The `Runtime` workspace is for reading live simulation behavior while you play.

### Debug View

Toggle:

- zone volumes
- combat ranges
- interaction ranges
- aggro radii
- sector overlay

### Session

Advanced runtime state dump. If something feels wrong but you are not sure where to look yet, start here.

### Sectors

Shows the sector population system, especially in `Third-Person Survival`.

### Issues

This is the combined problem list:

- runtime findings
- asset problems
- evaluation warnings
- command issues

### Iteration

This section turns findings into suggested next actions.

- `Load To Script`: puts the suggested commands into the command script for review
- `Apply Now`: executes the suggested commands immediately
- each suggestion also shows how many times it has already been applied in the current world
- `Recently applied` helps you avoid repeating the same fix blindly

Use this when you want Groundtruth to help you move from “what is wrong” to “what should I try next.”

### Events

Shows recent runtime events like combat, looting, deaths, and rebuilds.

### Playtest

Use this when you want to capture a real playtest run instead of relying on memory.

- `Start Session`: begins a named playtest session
- `Stop Session`: closes the session
- `Add Note`: records a quick observation
- `Export Report`: exports a playtest report with screenshot, project, world, evaluation, events, and notes
- Groundtruth also derives simple playtest findings from the session and surfaces them in the Runtime issues flow
- after you export a report, Groundtruth stores that summary as the current playtest baseline
- while a session is active, the Playtest panel compares deaths, loot events, and player-hit events against the last exported baseline

## Playtesting Tips

1. Start with `Third-Person Survival`.
2. Start from `Survival Outpost`, or generate a `Flat Outpost` or `Town Grid`.
3. Click `Play`.
4. Click the viewport.
5. Test movement, combat, looting, and world readability.
6. Turn on overlays only when you need them.
7. Use `Inspect > Evaluation` when something feels broken.
8. Export a snapshot before making big changes.

For specific use cases:

- Use `First-Person` + `Generate Town Grid` for street-level readability checks
- Use `Top-Down` + `Top-Down Encounter` for overhead combat layout checks
- Use `Platformer Course` when you want to test traversal quickly
- Use `Generate Scale Test` when you want to inspect sector behavior

## If Something Does Not Work

- If movement does nothing:
  - make sure `Authoring` is set to `Play`
  - click once inside the viewport
- If a mode change seems ignored:
  - change the game mode
  - generate or load a world again
- If the world looks confusing:
  - check `Inspect > Evaluation`
  - then check `Runtime > Issues`
- If you want a reproduction of a broken state:
  - use `Export Snapshot`

## In-App Docs

Groundtruth also exposes this guide directly in the UI through the `Docs` button in the viewport header.
