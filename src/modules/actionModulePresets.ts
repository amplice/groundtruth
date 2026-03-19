import {
  GameplayPolicyProfileId,
  ThirdPersonActionGameplayPolicy,
  cloneThirdPersonActionGameplayPolicy,
  mergeThirdPersonActionGameplayPolicy,
} from "../core/policies";
import { CameraRigComponent, GameMode, ProjectDocument } from "../core/schema";
import { RuntimeFeatureId } from "./types";

export type ActionPlayerMovementMode = "first_person" | "third_person" | "top_down" | "platformer";

export type ActionHostileBehavior = "arena_3d" | "lane_2d" | "survival_zombie";

export interface ActionModulePreset {
  id: Extract<GameMode, "first_person" | "third_person" | "third_person_survival" | "top_down" | "platformer">;
  policyId: GameplayPolicyProfileId;
  controlLine: string;
  idlePrompt: string;
  playerMovementMode: ActionPlayerMovementMode;
  hostileBehavior: ActionHostileBehavior;
  worldLayout: "third_person" | "top_down" | "platformer";
  featureIds?: RuntimeFeatureId[];
  gameplayPolicy: ThirdPersonActionGameplayPolicy;
}

export const THIRD_PERSON_ACTION_PRESET: ActionModulePreset = {
  id: "third_person",
  policyId: "third_person_action",
  controlLine: "WASD move | Shift sprint | Space attack | E interact",
  idlePrompt: "Use generated worlds as a third-person action sandbox.",
  playerMovementMode: "third_person",
  hostileBehavior: "arena_3d",
  worldLayout: "third_person",
  featureIds: ["hostile_ai", "combat", "combat_feedback", "interaction_inventory", "objective_progress"],
  gameplayPolicy: {
    controls: {
      attackKey: "Space",
      interactKey: "KeyE",
      respawnKey: "KeyR",
      sprintMultiplier: 1.5,
    },
    camera: {
      mode: "follow",
      distance: 12.5,
      pitch: 1.0,
      yaw: 0.75,
    },
    facing: {
      mode: "cursor_aim",
      idleMode: "cursor_aim",
    },
    combat: {
      movementLockOnAttack: true,
      targetingMode: "nearest_hostile",
      missCooldownFactor: 0.4,
    },
    loot: {
      transferMode: "take_one",
      emptyContainerMode: "persist",
    },
    respawn: {
      mode: "manual",
      key: "KeyR",
      target: "safe_then_objective_then_spawn",
    },
    hostile: {
      activityBubbleEnabled: false,
      aggroRadiusScale: 1,
      leashRadiusScale: 1.1,
      throttlePadding: 14,
      sleepPadding: 14,
    },
    feedback: {
      damageMarkers: true,
      healthBars: "contextual",
      dangerOverlay: true,
    },
  },
};

export const FIRST_PERSON_ACTION_PRESET: ActionModulePreset = {
  id: "first_person",
  policyId: "first_person_action",
  controlLine: "WASD move | Shift sprint | Space attack | E interact",
  idlePrompt: "Use generated worlds as a first-person action sandbox.",
  playerMovementMode: "first_person",
  hostileBehavior: "arena_3d",
  worldLayout: "third_person",
  featureIds: ["hostile_ai", "combat", "combat_feedback", "interaction_inventory", "objective_progress"],
  gameplayPolicy: {
    controls: {
      attackKey: "Space",
      interactKey: "KeyE",
      respawnKey: "KeyR",
      sprintMultiplier: 1.45,
    },
    camera: {
      mode: "first_person",
      distance: 0,
      pitch: 0.08,
      yaw: 0,
    },
    facing: {
      mode: "camera_forward",
      idleMode: "camera_forward",
    },
    combat: {
      movementLockOnAttack: true,
      targetingMode: "nearest_hostile",
      missCooldownFactor: 0.4,
    },
    loot: {
      transferMode: "take_one",
      emptyContainerMode: "persist",
    },
    respawn: {
      mode: "manual",
      key: "KeyR",
      target: "safe_then_objective_then_spawn",
    },
    hostile: {
      activityBubbleEnabled: false,
      aggroRadiusScale: 1,
      leashRadiusScale: 1.1,
      throttlePadding: 14,
      sleepPadding: 14,
    },
    feedback: {
      damageMarkers: true,
      healthBars: "contextual",
      dangerOverlay: true,
    },
  },
};

export const THIRD_PERSON_SURVIVAL_PRESET: ActionModulePreset = {
  id: "third_person_survival",
  policyId: "third_person_survival",
  controlLine: "WASD move | Shift sprint | Space attack | E loot",
  idlePrompt: "Explore the generated world or load the authored slice.",
  playerMovementMode: "third_person",
  hostileBehavior: "survival_zombie",
  worldLayout: "third_person",
  featureIds: ["hostile_ai", "combat", "combat_feedback", "interaction_inventory", "objective_progress", "sector_population"],
  gameplayPolicy: {
    controls: {
      attackKey: "Space",
      interactKey: "KeyE",
      respawnKey: "KeyR",
      sprintMultiplier: 1.5,
    },
    camera: {
      mode: "follow",
      distance: 10.5,
      pitch: 0.78,
      yaw: 0.75,
    },
    facing: {
      mode: "cursor_aim",
      idleMode: "cursor_aim",
    },
    combat: {
      movementLockOnAttack: true,
      targetingMode: "nearest_hostile",
      missCooldownFactor: 0.4,
    },
    loot: {
      transferMode: "take_all",
      emptyContainerMode: "despawn",
    },
    respawn: {
      mode: "manual",
      key: "KeyR",
      target: "safe_then_objective_then_spawn",
    },
    hostile: {
      activityBubbleEnabled: true,
      aggroRadiusScale: 1,
      leashRadiusScale: 1.15,
      throttlePadding: 14,
      sleepPadding: 24,
    },
    feedback: {
      damageMarkers: true,
      healthBars: "contextual",
      dangerOverlay: true,
    },
  },
};

export const TOP_DOWN_ACTION_PRESET: ActionModulePreset = {
  id: "top_down",
  policyId: "top_down_action",
  controlLine: "WASD move | Shift sprint | Space attack | E interact",
  idlePrompt: "Use generated worlds as a top-down action sandbox.",
  playerMovementMode: "top_down",
  hostileBehavior: "arena_3d",
  worldLayout: "top_down",
  featureIds: ["hostile_ai", "combat", "combat_feedback", "interaction_inventory", "objective_progress"],
  gameplayPolicy: {
    controls: {
      attackKey: "Space",
      interactKey: "KeyE",
      respawnKey: "KeyR",
      sprintMultiplier: 1.4,
    },
    camera: {
      mode: "top_down",
      distance: 24,
      pitch: 1.35,
      yaw: 0,
    },
    facing: {
      mode: "move_vector",
      idleMode: "keep_last",
    },
    combat: {
      movementLockOnAttack: true,
      targetingMode: "nearest_hostile",
      missCooldownFactor: 0.4,
    },
    loot: {
      transferMode: "take_one",
      emptyContainerMode: "persist",
    },
    respawn: {
      mode: "manual",
      key: "KeyR",
      target: "safe_then_objective_then_spawn",
    },
    hostile: {
      activityBubbleEnabled: false,
      aggroRadiusScale: 1,
      leashRadiusScale: 1.05,
      throttlePadding: 10,
      sleepPadding: 10,
    },
    feedback: {
      damageMarkers: true,
      healthBars: "contextual",
      dangerOverlay: true,
    },
  },
};

export const PLATFORMER_ACTION_PRESET: ActionModulePreset = {
  id: "platformer",
  policyId: "platformer_action",
  controlLine: "A/D move | Shift sprint | Space jump | F attack | E interact",
  idlePrompt: "Use generated worlds as a platformer sandbox.",
  playerMovementMode: "platformer",
  hostileBehavior: "lane_2d",
  worldLayout: "platformer",
  featureIds: ["hostile_ai", "combat", "combat_feedback", "interaction_inventory", "objective_progress"],
  gameplayPolicy: {
    controls: {
      attackKey: "KeyF",
      interactKey: "KeyE",
      jumpKey: "Space",
      respawnKey: "KeyR",
      sprintMultiplier: 1.3,
    },
    camera: {
      mode: "follow",
      distance: 13.5,
      pitch: 0.12,
      yaw: -Math.PI * 0.5,
    },
    facing: {
      mode: "move_vector",
      idleMode: "keep_last",
    },
    combat: {
      movementLockOnAttack: true,
      targetingMode: "nearest_hostile",
      missCooldownFactor: 0.4,
    },
    loot: {
      transferMode: "take_one",
      emptyContainerMode: "persist",
    },
    respawn: {
      mode: "manual",
      key: "KeyR",
      target: "safe_then_objective_then_spawn",
    },
    hostile: {
      activityBubbleEnabled: false,
      aggroRadiusScale: 1,
      leashRadiusScale: 1.05,
      throttlePadding: 10,
      sleepPadding: 10,
    },
    feedback: {
      damageMarkers: true,
      healthBars: "contextual",
      dangerOverlay: true,
    },
  },
};

const actionModulePresetMap: Record<ActionModulePreset["id"], ActionModulePreset> = {
  first_person: FIRST_PERSON_ACTION_PRESET,
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

export function resolvePresetFeatureIds(
  preset: ActionModulePreset,
  project: ProjectDocument,
): RuntimeFeatureId[] {
  return (preset.featureIds ?? []).filter((featureId) => {
    const override = project.runtime.featureOverrides[featureId];
    return override?.enabled ?? true;
  });
}

export function resolvePresetGameplayPolicy(
  preset: ActionModulePreset,
  project: ProjectDocument,
): ThirdPersonActionGameplayPolicy {
  return mergeThirdPersonActionGameplayPolicy(
    preset.gameplayPolicy,
    project.runtime.gameplayPolicies[preset.policyId],
  );
}

export function clonePresetGameplayPolicy(
  preset: ActionModulePreset,
): ThirdPersonActionGameplayPolicy {
  return cloneThirdPersonActionGameplayPolicy(preset.gameplayPolicy);
}

export function policyCameraRig(
  preset: ActionModulePreset,
  project?: ProjectDocument,
): CameraRigComponent {
  const policy = project
    ? resolvePresetGameplayPolicy(preset, project)
    : clonePresetGameplayPolicy(preset);
  return {
    mode: policy.camera.mode,
    distance: policy.camera.distance,
    pitch: policy.camera.pitch,
    yaw: policy.camera.yaw,
  };
}
