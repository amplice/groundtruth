export interface HelpSection {
  id: string;
  title: string;
  summary: string;
  steps: string[];
  notes?: string[];
  code?: string;
}

export type HelpAudience = "human" | "ai";

export const humanHelpSections: HelpSection[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    summary: "How to get from launch to a playable test world.",
    steps: [
      "Open Groundtruth and start with the top mode buttons: Project, World, Play, Assets, and Debug.",
      "Open the Project workspace, pick Survival Outpost, and click Start Project From Template if you want the quickest good first run.",
      "If you do not want a template, open the World workspace, pick a Game Mode, and start with Third-Person Survival if you want the fullest slice.",
      "Click Generate Flat Outpost for a normal test world, Generate Town Grid for a road-and-block style test world, Generate Urban City for a denser streetscape built from the URBAN kit, or Generate Scale Test for a larger stress scenario.",
      "Click Play in the Authoring section, then click once inside the 3D viewport so keyboard input goes to the game.",
      "Move around, fight enemies, and use the Play, World, Assets, and Debug workspaces to understand what the world is doing.",
    ],
    notes: [
      "The active workspace opens in a thin left rail. Use Hide Workspace when you want the viewport fully visible.",
      "Use the always-visible Pause button in the top chrome when you want to freeze gameplay without switching to edit mode.",
      "If you only want a blank canvas, click New Empty World.",
      "Load Survival Slice gives you the authored survival demo instead of a generated outpost.",
    ],
  },
  {
    id: "game-modes",
    title: "Game Modes And Controls",
    summary: "What the implemented modes do and how to control them.",
    steps: [
      "Third-Person Survival: use WASD to move, Shift to sprint, Space to attack, and E to loot or interact.",
      "First-Person: use WASD to move, Shift to sprint, Space to attack, and E to interact. It currently uses a simple prototype first-person camera.",
      "Third-Person: use the same controls as survival, but without the survival-specific sector emphasis.",
      "Top-Down: use WASD to move directly on the world axes, Shift to sprint, Space to attack, and E to interact.",
      "Platformer: use A and D to move, Shift to sprint, Space to jump, F to attack, and E to interact.",
      "After switching Game Mode, generate or load a world again so the new module is actually driving the runtime.",
    ],
    notes: [
      "Implemented modes today are Third-Person Survival, First-Person, Third-Person, Top-Down, and Platformer.",
      "Other listed modes are descriptors only right now, not playable implementations yet.",
    ],
  },
  {
    id: "projects",
    title: "Projects And Templates",
    summary: "How to start from a template instead of building everything from scratch.",
    steps: [
      "Open the Project workspace.",
      "Enter a Project Name. This becomes the active world name when the project starts.",
      "Pick a template such as Survival Outpost, Third-Person Arena, First-Person Patrol, Urban City Survival, Top-Down Encounter, or Platformer Course.",
      "Click Start Project From Template.",
      "The template will load the right game mode and create a starter world tuned for that style of game, so you do not need to switch the mode manually afterward.",
      "Use Save Project for the normal editable working file. This is the main way to persist project changes such as prefab fitting, feature toggles, and gameplay policy edits.",
      "Use Export Project when you want a richer project envelope with screenshot/context, not just the editable working file.",
      "Use Build Playable Export when you want a player-focused game package seed instead of an editable project export.",
      "Use Open Project to restore a previously saved or exported project file.",
      "Use Open Playable Export when you want to bring a player-focused build document back into the editor as a project seed.",
      "Use World Variants to switch between saved worlds inside the same project.",
      "Use Save World Variant when you want to preserve the active world as another project variant.",
      "Use Project > Gameplay Policy when the active mode is close but the rules need to change for your project.",
      "From there, switch to Play to test it or use the authoring tools to reshape it.",
    ],
    notes: [
      "Templates are the fastest way to get a coherent starting point.",
      "First-Person Patrol and Top-Down Encounter currently start from the town-grid style.",
      "You can still use Generate Flat Outpost or New Empty World when you do not want a template-driven start.",
      "Snapshot export/import remains world-oriented, while project save/export/import is for the broader project container.",
    ],
  },
  {
    id: "world-controls",
    title: "World Generation And File Actions",
    summary: "What each world action button does.",
    steps: [
      "Generate Flat Outpost creates a seeded playable world using the current seed, size, building, zombie, and crate values.",
      "Generate Town Grid creates a more road-and-block oriented world with intersections, block buildings, and street encounters.",
      "Generate Urban City creates a denser city-block world using URBAN roads, prebuilt flats, bus stops, and traffic props.",
      "Generate Scale Test creates a much larger stress scenario intended for sector and performance testing.",
      "New Empty World creates a blank semantic world with no generated layout.",
      "Load Survival Slice loads the authored survival example world instead of procedural output.",
      "Reset World applies the reset command and clears the current world back to the default empty-world state.",
      "Export Snapshot saves the current world plus a screenshot into JSON.",
      "Import Snapshot restores a previously exported world snapshot.",
      "Capture Screenshot saves the current viewport image into the screenshot preview area.",
      "Stress Test Swaps repeatedly swaps worlds and selections to shake out rebuild bugs.",
    ],
    notes: [
      "If you change Game Mode, generate or load again so the rebuilt world matches the selected module.",
      "Town Grid is useful when you want more legible lanes and block structure than the flat outpost provides.",
      "Urban City is useful when you want a more coherent streetscape and stronger landmarking than Town Grid provides.",
      "A good default pairing is First-Person or Top-Down with Town Grid, Third-Person Survival with Flat Outpost, and zombie-city slice testing with Urban City.",
    ],
  },
  {
    id: "authoring",
    title: "In-World Authoring",
    summary: "How to edit the world directly in the viewport.",
    steps: [
      "Use Play when you want live gameplay controls instead of editor placement.",
      "Use Place to spawn the selected prefab where you click on the ground plane.",
      "Use Move to drag a selected entity or zone to a new location in the world.",
      "Use Resize to drag outward from a selected entity or zone and change its scale or footprint.",
      "Use Zone to place semantic zones such as spawn, safe, loot, encounter, objective, or trigger zones.",
      "Use Apply To Selected after changing authoring values to push the current scale, yaw, or zone settings back onto the selected object.",
      "Use Delete Selected to remove the selected entity or selected zone.",
    ],
    notes: [
      "Place scale and Place yaw affect newly placed entities.",
      "Zone shape and Zone size affect newly placed zones and can also be applied to selected zones.",
      "The prefab palette gives you quick buttons for common prefabs, while the prefab dropdown gives you the full list.",
      "Map editing now shows a translucent preview on hover before you place a prefab or zone.",
      "Shortcuts: 1/2/3/4 switch tools, Q/E rotate, [ and ] resize, mouse wheel adjusts size, Delete removes the current selection.",
    ],
  },
  {
    id: "gameplay-policy",
    title: "Gameplay Policy",
    summary: "How to change third-person-style rules without editing engine code.",
    steps: [
      "Open Project > Gameplay Policy.",
      "Use Facing and Idle facing to choose whether the player faces the movement vector, the mouse cursor, or the camera forward direction.",
      "Use Camera distance and Camera pitch to tune the current project’s third-person-style camera.",
      "Use Attack targeting and Lock movement on attack to choose whether attacks need a hostile target and whether attacks root the player in place.",
      "Use Loot transfer and Empty container to control whether containers give one item or everything, and whether empty containers stay or disappear.",
      "Use Respawn mode and Respawn key to decide whether the current project allows manual respawn.",
      "Use Aggro scale and Leash scale to change how early hostiles wake up and how far they keep chasing.",
      "Click Apply Policy to save those behavior overrides into the active project.",
      "Click Reset To Preset to discard the project override and return to the built-in preset behavior.",
    ],
    notes: [
      "This is the first step toward treating Groundtruth presets as configurable engine policies instead of fixed game rules.",
      "Current policy editing focuses on the shared action-family modules: third-person, third-person survival, first-person, top-down, and platformer.",
    ],
  },
  {
    id: "stamps",
    title: "World Stamps",
    summary: "How to add reusable chunks of gameplay space onto the current world.",
    steps: [
      "Open World > Stamps.",
      "Pick a stamp such as Street Block, Arena Cluster, Platform Run, Loot Cluster, or Encounter Cluster.",
      "Click Apply Stamp To Current World.",
      "Groundtruth will add that prefab-and-zone pattern into the active world with unique ids so it does not overwrite previous work.",
      "Use stamps when you want to build worlds faster than placing every object by hand.",
      "A practical workflow is: start from a template or generator, apply one or two stamps, then use Place, Move, Resize, or Zone for cleanup.",
    ],
    notes: [
      "Stamps are reusable semantic chunks, not full map generators.",
      "You can combine stamps with manual placement, resizing, and zone editing.",
    ],
  },
  {
    id: "recipes",
    title: "World Recipes",
    summary: "How to start from a more coherent precomposed game slice.",
    steps: [
      "Open World > Recipes.",
      "Pick a recipe such as Survival Town, First-Person Sweep, Top-Down Hotzone, or Platformer Gauntlet.",
      "Click Start Project From Recipe.",
      "Groundtruth will create a project that already combines a game mode, base layout, stamps, and initial feature defaults.",
      "Use recipes when templates or generators alone are too low-level for the slice you want to test.",
    ],
    notes: [
      "Recipes are stronger starting points than raw generators.",
      "You can still edit, stamp, or reconfigure features after starting from a recipe.",
    ],
  },
  {
    id: "inspect",
    title: "Inspect Workspace",
    summary: "How to inspect world state, selected entities, and assets.",
    steps: [
      "Open World > Scene to browse entities and zones. Use Search and Filter to cut down the list.",
      "Click an entity or zone in the scene inventory, or click it in the viewport, to select it.",
      "Use Inspector to read runtime, visual, and physics details for the selected item.",
      "Use Evaluation to read world-level warnings and errors such as missing player, unreachable loot, dense sectors, or bad placements.",
      "Use Diagnostics when you need raw world/debug state rather than the cleaner evaluation summary.",
      "Use Assets to inspect model load state, missing clips, warnings, and binding problems.",
      "Use Model Tuning to adjust a selected model's scale, yaw, and Y offset, then click Apply Tuning.",
      "Use Selection if you want the raw JSON for the selected entity or zone.",
    ],
    notes: [
      "Scene selection is one of the main ways to understand what a generated world actually contains.",
      "Model Tuning only applies to entities using model-based render components.",
    ],
  },
  {
    id: "runtime",
    title: "Runtime Workspace And Debug Overlays",
    summary: "How to read what the simulation is doing while you play.",
    steps: [
      "Use Debug View to toggle zone volumes, combat ranges, interaction ranges, aggro radii, and the sector overlay.",
      "Use Session for the full runtime state dump, including authoring state, module info, and current editor settings.",
      "Use Sectors to inspect resident rings, pooled sectors, dormant sectors, and other far-field simulation details.",
      "Use Issues to see the combined list of runtime findings, asset findings, command issues, and evaluation problems.",
      "Use Iteration to turn evaluation and playtest findings into suggested next actions.",
      "Iteration suggestions now show how often they have already been applied in the current world and flag recently repeated suggestions.",
      "Use Playtest to start a named session, add notes, and export a report with project/world/evaluation context.",
      "Playtest sessions also produce simple derived findings, so the Runtime issue surface can reflect bad session outcomes instead of only static world issues.",
      "After you export a playtest report, Groundtruth stores that summary as the baseline and compares future sessions against it.",
      "Use Events to read the recent runtime event log, including attacks, looting, deaths, rebuilds, and other state transitions.",
      "Use the viewport HUD for fast human playtesting feedback while the sidebar gives you the deeper detail.",
    ],
    notes: [
      "The sector overlay is most useful in Third-Person Survival and Scale Test worlds.",
      "If the workspace gets in the way, use Hide Workspace to collapse the tool rail and give the viewport more room.",
      "A playable export can boot directly into player mode, which hides the editor workspace entirely.",
      "Assets can now save semantic clip bindings and per-slot playback speed, not just model fit and collision.",
      "Asset Fit now preserves real compound prefab collision instead of pretending it is a single primitive shape.",
    ],
  },
  {
    id: "commands",
    title: "Semantic Command Script",
    summary: "How to drive the world through JSON commands instead of manual editing.",
    steps: [
      "Open Project > Command Script.",
      "Write a JSON array of commands.",
      "Click Apply Commands to mutate the current world.",
      "Use this when you want repeatable semantic changes instead of hand-placing everything.",
    ],
    code: `[
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
]`,
    notes: [
      "Current commands include the world commands plus project-level commands such as set_project_name, set_project_feature, set_project_gameplay_policy, save_project_world, open_project_world, apply_world_stamp, start_project_template, and start_world_recipe.",
    ],
  },
  {
    id: "scale",
    title: "Scale And Sector Simulation",
    summary: "How the large-world simulation behaves today.",
    steps: [
      "Generate a Scale Test world if you want to exercise the sector system.",
      "In Third-Person Survival, move through the world and watch the Sectors panel and sector overlay.",
      "Near sectors are kept live, while far sectors can become dormant or pooled.",
      "Far sectors can drift offline instead of staying frozen, and sector state carries pressure and depletion memory.",
      "Use these tools to judge whether a world is scaling sensibly before trying to push enemy counts or world size further.",
    ],
    notes: [
      "Sector behavior is currently the most developed in Third-Person Survival.",
      "This is still an early scale architecture, not a finished massive-world simulation stack.",
    ],
  },
  {
    id: "playtest",
    title: "Playtesting And Troubleshooting",
    summary: "What to do when something looks wrong or you want to validate behavior quickly.",
    steps: [
      "For the fastest sanity check, start Survival Outpost or Generate Flat Outpost in Third-Person Survival, then verify movement, attack, looting, and enemy pursuit.",
      "For street readability, switch to First-Person or Top-Down and use Generate Town Grid.",
      "For traversal checks, start Platformer Course or switch to Platformer and generate a world again.",
      "If movement does nothing, make sure you are in Play mode and click the viewport once to focus it.",
      "If a mode change seems ignored, generate or load a world again after changing Game Mode.",
      "If combat feels unclear, use the built-in feedback: hit flashes, floating markers, health bars, world labels, and the player danger overlay.",
      "If you are doing a serious review pass, start a Playtest session first so you can export a report with notes instead of only relying on memory.",
      "Export a playtest report before and after a major change when you want Groundtruth to show whether deaths, loot flow, or player pressure improved.",
      "If an entity behaves strangely, select it and inspect the Inspector, Assets, and Selection panels together.",
      "If the world looks invalid, check Evaluation first and Issues second.",
      "If you suspect a hot-rebuild problem, use Stress Test Swaps to push the rebuild path repeatedly.",
      "If you want a record of a broken state, export a snapshot before changing anything.",
    ],
    notes: [
      "The recommended debugging order is: reproduce, inspect, evaluate, snapshot, then edit.",
    ],
  },
];

export const aiHelpSections: HelpSection[] = [
  {
    id: "ai-overview",
    title: "AI Operating Model",
    summary: "How another AI should think about Groundtruth.",
    steps: [
      "Treat Groundtruth as a semantic runtime/editor, not as a raw three.js codebase you should edit directly for normal world-building tasks.",
      "Prefer changing the world through templates, generators, stamps, authoring operations, and semantic command scripts before proposing core engine edits.",
      "Assume the active world is data-first: game mode, prefabs, entities, zones, stamps, evaluation, and runtime issues are the primary control surface.",
      "When a user asks for a game or level, start by selecting the closest implemented game mode, then choose a template or generator that best matches that mode.",
      "Use the last exported playtest baseline and suggestion history as part of your reasoning, not just the current frame.",
    ],
    notes: [
      "Implemented modes today are Third-Person Survival, First-Person, Third-Person, Top-Down, and Platformer.",
      "The most reliable way to mutate content repeatably is the semantic command script and the world/template/stamp systems.",
    ],
  },
  {
    id: "ai-world-loop",
    title: "Recommended AI Build Loop",
    summary: "The safest high-leverage loop for building a game in Groundtruth.",
    steps: [
      "Pick a target mode first: third_person_survival, first_person, third_person, top_down, or platformer.",
      "Start from Build > Project with the closest template, or use Build > World to generate Flat Outpost, Town Grid, Scale Test, or an Empty World.",
      "Use stamps to add larger structural chunks quickly before doing fine-grained edits.",
      "Use Build > Features when the project needs capability-level changes such as disabling hostile AI, sector population, combat, or interaction.",
      "Use Build > Gameplay Policy when the module is close but the rules are wrong, such as facing mode, loot behavior, camera feel, or respawn behavior.",
      "That same policy surface now also covers attack targeting, attack movement locking, and hostile aggro/leash tuning.",
      "Use Build > Recipes when the user asks for a coherent slice that maps to an existing recipe better than a raw generator or template.",
      "Use prefab/entity/zone edits only after the broad layout is in place.",
      "Run playtests in Play mode, then inspect Evaluation, Issues, Assets, and Runtime panels before making more changes.",
      "Check Runtime > Iteration before repeating a change; prefer suggestions that are not already marked as recently applied unless you are deliberately retrying an intervention.",
      "Export snapshots when a world state is useful or when you need a reproducible failure case.",
      "Export the whole project when the structure of the project itself is worth preserving beyond the current world state.",
    ],
    notes: [
      "Do not switch game mode and assume the current world automatically changes; always regenerate or load again after changing mode.",
      "Town Grid is usually a better baseline than Flat Outpost for First-Person and Top-Down experiments.",
    ],
  },
  {
    id: "ai-game-modes",
    title: "Choosing The Right Mode",
    summary: "Which implemented mode to use for which kind of game slice.",
    steps: [
      "Use Third-Person Survival for the richest current gameplay slice: combat, loot, hostile AI, and sector population.",
      "Use First-Person for street-level combat and closer-range readability checks.",
      "Use Third-Person for general action combat without the survival-specific sector emphasis.",
      "Use Top-Down for overhead combat, simpler arena logic, and MOBA/RTS-like spatial experiments.",
      "Use Platformer for side-view traversal and lane-based combat tests.",
    ],
    notes: [
      "Many other genre labels exist in the registry, but they are not implemented gameplay modules yet.",
      "If the requested game is outside implemented modes, choose the nearest implemented mode and explain the approximation.",
    ],
  },
  {
    id: "ai-commands",
    title: "Semantic Commands",
    summary: "How an AI should modify worlds repeatably.",
    steps: [
      "Prefer command scripts when the requested change is structured and repeatable.",
      "Use set_world_name and set_game_mode first when establishing a new scenario.",
      "Use set_project_gameplay_policy when the module is right but the rules need to change.",
      "Use generate_flat_world or generate_town_world before spawning many entities manually.",
      "Use spawn_entity, update_entity, delete_entity, define_zone, and delete_zone for precise world shaping.",
      "Use upsert_prefab only when you need to change prefab definitions rather than individual entity placement.",
    ],
    code: `[
  { "op": "set_project_name", "name": "Town Patrol Test" },
  {
    "op": "set_project_gameplay_policy",
    "policyId": "first_person_action",
    "patch": {
      "loot": { "emptyContainerMode": "persist" },
      "respawn": { "mode": "disabled" }
    }
  },
  { "op": "set_world_name", "name": "Town Patrol Test" },
  { "op": "set_game_mode", "gameMode": "first_person" },
  { "op": "generate_town_world" },
  {
    "op": "define_zone",
    "zone": {
      "id": "objective.patrol.1",
      "name": "Patrol Objective",
      "kind": "objective",
      "transform": {
        "position": { "x": 18, "y": 0, "z": -12 }
      },
      "shape": {
        "type": "sphere",
        "radius": 6
      }
    }
  }
]`,
    notes: [
      "Command scripts are the best way for another AI to express world mutations without touching engine internals.",
      "The current policy surface is strongest for the shared action-family modules.",
      "After applying commands, inspect Evaluation and Issues to catch invalid or incoherent results.",
    ],
  },
  {
    id: "ai-templates-stamps",
    title: "Templates And Stamps",
    summary: "How to use higher-level world-building primitives instead of micro-editing from nothing.",
    steps: [
      "Use templates when you want a coherent starting point that already selects an appropriate game mode.",
      "Use stamps when you want to expand a world incrementally with reusable chunks such as Street Block, Arena Cluster, Platform Run, Loot Cluster, or Encounter Cluster.",
      "Prefer templates for starting a new project and stamps for growing or reshaping an existing one.",
      "After applying a stamp, use Move, Resize, and Zone edits to align it with the rest of the world.",
    ],
    notes: [
      "Templates are better for bootstrapping a full slice.",
      "Stamps are better for controlled extension of an existing slice.",
    ],
  },
  {
    id: "ai-validation",
    title: "Validation And Debugging",
    summary: "What an AI should read before deciding whether a world is good enough.",
    steps: [
      "Check Inspect > Evaluation for world-level validity issues such as missing player, no enemies, no loot, reachability problems, and dense sectors.",
      "Check Runtime > Issues for the combined surface of runtime findings, asset problems, evaluation warnings, and command issues.",
      "Check Inspect > Assets for model/animation load failures or clip warnings.",
      "Check Runtime > Events to understand what actually happened during playtest or simulation.",
      "Use the selected entity Inspector and Selection panels when a specific actor or zone seems wrong.",
    ],
    notes: [
      "The most reliable debugging order is: reproduce, inspect, evaluate, snapshot, then edit.",
      "Do not assume a generated world is valid just because it renders.",
    ],
  },
  {
    id: "ai-scale",
    title: "Scale And Sector Guidance",
    summary: "What an AI should know about Groundtruth's current large-world behavior.",
    steps: [
      "Use Third-Person Survival when testing sector behavior; that is where sector_population is most developed.",
      "Use Generate Scale Test when you want to inspect resident sectors, pooled far sectors, and offline drift.",
      "Read the Sectors panel and sector overlay to understand activation, dormancy, pressure, and depletion state.",
      "Treat current sector simulation as an early-scale architecture, not as proof of final large-world performance.",
    ],
    notes: [
      "If a request depends on truly massive-world simulation, explain that Groundtruth currently provides an early sector architecture rather than a finished server-scale system.",
    ],
  },
  {
    id: "ai-dont-do-this",
    title: "Common AI Mistakes To Avoid",
    summary: "Failure modes another AI is likely to hit.",
    steps: [
      "Do not change game mode and assume behavior changed without regenerating or loading a world again.",
      "Do not judge a world from visuals alone; always check Evaluation, Issues, and Assets.",
      "Do not overfit on the survival slice when the user really wants a cleaner top-down, first-person, or platformer experiment.",
      "Do not default to low-level engine edits when templates, stamps, commands, or in-world authoring can solve the task faster.",
      "Do not claim unsupported genres are implemented; approximate them with the nearest active module and state the gap.",
    ],
    notes: [
      "Groundtruth is currently best used as a semantic runtime/editor with several implemented modules, not as a fully mature general-purpose engine.",
    ],
  },
];

export const helpContentByAudience: Record<HelpAudience, HelpSection[]> = {
  human: humanHelpSections,
  ai: aiHelpSections,
};
