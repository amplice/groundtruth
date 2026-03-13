import { CameraRigComponent, GameMode } from "../core/schema";
import { RuntimeFeatureId } from "./types";

export type ActionPlayerMovementMode = "third_person" | "top_down" | "platformer";

export type ActionHostileBehavior = "arena_3d" | "lane_2d";

export interface ActionModulePreset {
  id: Extract<GameMode, "third_person" | "third_person_survival" | "top_down" | "platformer">;
  controlLine: string;
  idlePrompt: string;
  attackKey: string;
  jumpKey?: string;
  cameraRig: CameraRigComponent;
  playerMovementMode: ActionPlayerMovementMode;
  hostileBehavior: ActionHostileBehavior;
  worldLayout: "third_person" | "top_down" | "platformer";
  featureIds?: RuntimeFeatureId[];
  sprintMultiplier?: number;
}

export const THIRD_PERSON_ACTION_PRESET: ActionModulePreset = {
  id: "third_person",
  controlLine: "WASD move | Shift sprint | Space attack | E interact",
  idlePrompt: "Use generated worlds as a third-person action sandbox.",
  attackKey: "Space",
  cameraRig: {
    mode: "follow",
    distance: 8.5,
    pitch: 0.55,
    yaw: 0.75,
  },
  playerMovementMode: "third_person",
  hostileBehavior: "arena_3d",
  worldLayout: "third_person",
  featureIds: ["combat", "combat_feedback", "interaction_inventory"],
  sprintMultiplier: 1.5,
};

export const THIRD_PERSON_SURVIVAL_PRESET: ActionModulePreset = {
  id: "third_person_survival",
  controlLine: "WASD move | Shift sprint | Space attack | E loot",
  idlePrompt: "Explore the generated world or load the authored slice.",
  attackKey: "Space",
  cameraRig: {
    mode: "follow",
    distance: 8.5,
    pitch: 0.55,
    yaw: 0.75,
  },
  playerMovementMode: "third_person",
  hostileBehavior: "arena_3d",
  worldLayout: "third_person",
  featureIds: ["combat", "combat_feedback", "interaction_inventory", "sector_population"],
  sprintMultiplier: 1.5,
};

export const TOP_DOWN_ACTION_PRESET: ActionModulePreset = {
  id: "top_down",
  controlLine: "WASD move | Shift sprint | Space attack | E interact",
  idlePrompt: "Use generated worlds as a top-down action sandbox.",
  attackKey: "Space",
  cameraRig: {
    mode: "top_down",
    distance: 24,
    pitch: 1.35,
    yaw: 0,
  },
  playerMovementMode: "top_down",
  hostileBehavior: "arena_3d",
  worldLayout: "top_down",
  featureIds: ["combat", "combat_feedback", "interaction_inventory"],
  sprintMultiplier: 1.4,
};

export const PLATFORMER_ACTION_PRESET: ActionModulePreset = {
  id: "platformer",
  controlLine: "A/D move | Shift sprint | Space jump | F attack | E interact",
  idlePrompt: "Use generated worlds as a platformer sandbox.",
  attackKey: "KeyF",
  jumpKey: "Space",
  cameraRig: {
    mode: "follow",
    distance: 13.5,
    pitch: 0.12,
    yaw: -Math.PI * 0.5,
  },
  playerMovementMode: "platformer",
  hostileBehavior: "lane_2d",
  worldLayout: "platformer",
  featureIds: ["combat", "combat_feedback", "interaction_inventory"],
  sprintMultiplier: 1.3,
};

const actionModulePresetMap: Record<ActionModulePreset["id"], ActionModulePreset> = {
  third_person: THIRD_PERSON_ACTION_PRESET,
  third_person_survival: THIRD_PERSON_SURVIVAL_PRESET,
  top_down: TOP_DOWN_ACTION_PRESET,
  platformer: PLATFORMER_ACTION_PRESET,
};

export function getActionModulePreset(
  gameMode: GameMode,
): ActionModulePreset | null {
  if (gameMode in actionModulePresetMap) {
    return actionModulePresetMap[gameMode as ActionModulePreset["id"]];
  }
  return null;
}
