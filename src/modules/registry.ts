import { GameMode } from "../core/schema";
import { SandboxModule } from "./sandboxModule";
import { ThirdPersonSurvivalModule } from "./thirdPersonSurvival";
import { RuntimeModule } from "./types";

export interface RuntimeModuleDescriptor {
  id: GameMode;
  label: string;
  description: string;
  implemented: boolean;
}

const runtimeModuleDescriptors: RuntimeModuleDescriptor[] = [
  {
    id: "third_person_survival",
    label: "Third-Person Survival",
    description: "Playable survival slice with zombies, combat, loot, sectors, and authored worlds.",
    implemented: true,
  },
  {
    id: "open_world",
    label: "Open World Sandbox",
    description: "Generic open-world semantic sandbox built on the core runtime.",
    implemented: false,
  },
  {
    id: "first_person",
    label: "First-Person",
    description: "First-person camera, weapons, and interaction presets.",
    implemented: false,
  },
  {
    id: "third_person",
    label: "Third-Person Action",
    description: "Third-person follow-camera action preset without survival assumptions.",
    implemented: false,
  },
  {
    id: "action",
    label: "Action",
    description: "General-purpose combat/action module.",
    implemented: false,
  },
  {
    id: "rpg",
    label: "RPG",
    description: "Quest, progression, inventory, and party-oriented runtime preset.",
    implemented: false,
  },
  {
    id: "rts",
    label: "RTS",
    description: "Top-down selection, squad control, and economy-oriented runtime preset.",
    implemented: false,
  },
  {
    id: "fighting",
    label: "Fighting",
    description: "State-heavy combat preset with hit/hurt-box oriented timing.",
    implemented: false,
  },
  {
    id: "moba",
    label: "MOBA",
    description: "Lane, wave, hero, and team-objective preset.",
    implemented: false,
  },
  {
    id: "puzzle",
    label: "Puzzle",
    description: "Trigger, logic, and discrete interaction preset.",
    implemented: false,
  },
  {
    id: "platformer",
    label: "Platformer",
    description: "Platform movement, jump arcs, and traversal challenge preset.",
    implemented: false,
  },
  {
    id: "driving",
    label: "Driving",
    description: "Vehicle, road, and traversal-oriented runtime preset.",
    implemented: false,
  },
  {
    id: "racing",
    label: "Racing",
    description: "Lap, checkpoint, and competitive driving preset.",
    implemented: false,
  },
  {
    id: "city_builder",
    label: "City Builder",
    description: "Grid, zoning, and simulation-management preset.",
    implemented: false,
  },
  {
    id: "tower_defense",
    label: "Tower Defense",
    description: "Lane, wave, tower, and path-pressure preset.",
    implemented: false,
  },
  {
    id: "roguelike",
    label: "Roguelike",
    description: "Run-based progression and procedural encounter preset.",
    implemented: false,
  },
];

export function listRuntimeModules(): RuntimeModuleDescriptor[] {
  return runtimeModuleDescriptors.map((descriptor) => ({ ...descriptor }));
}

export function createRuntimeModule(gameMode: GameMode): RuntimeModule {
  switch (gameMode) {
    case "third_person_survival":
      return new ThirdPersonSurvivalModule();
    default:
      return new SandboxModule(gameMode);
  }
}
