export type GameplayPolicyProfileId =
  | "third_person_action"
  | "third_person_survival"
  | "first_person_action"
  | "top_down_action"
  | "platformer_action";

export type ThirdPersonFacingMode =
  | "move_vector"
  | "cursor_aim"
  | "camera_forward";

export type ThirdPersonIdleFacingMode =
  | "keep_last"
  | "cursor_aim"
  | "camera_forward";

export type RespawnMode = "disabled" | "manual";

export type RespawnTargetMode =
  | "safe_then_objective_then_spawn"
  | "spawn_only"
  | "world_origin";

export type LootTransferMode = "take_one" | "take_all";

export type EmptyContainerMode = "persist" | "despawn";

export type ActionCameraMode = "follow" | "first_person" | "top_down" | "isometric";

export interface ThirdPersonActionControlPolicy {
  attackKey: string;
  interactKey: string;
  jumpKey?: string;
  respawnKey?: string;
  sprintMultiplier: number;
}

export interface ThirdPersonActionCameraPolicy {
  mode: ActionCameraMode;
  distance: number;
  pitch: number;
  yaw: number;
}

export interface ThirdPersonActionFacingPolicy {
  mode: ThirdPersonFacingMode;
  idleMode: ThirdPersonIdleFacingMode;
}

export interface ThirdPersonActionCombatPolicy {
  movementLockOnAttack: boolean;
  targetingMode: "nearest_hostile" | "none";
  missCooldownFactor: number;
}

export interface ThirdPersonActionLootPolicy {
  transferMode: LootTransferMode;
  emptyContainerMode: EmptyContainerMode;
}

export interface ThirdPersonActionRespawnPolicy {
  mode: RespawnMode;
  key?: string;
  target: RespawnTargetMode;
}

export interface ThirdPersonActionHostilePolicy {
  activityBubbleEnabled: boolean;
  aggroRadiusScale: number;
  leashRadiusScale: number;
  throttlePadding: number;
  sleepPadding: number;
}

export interface ThirdPersonActionFeedbackPolicy {
  damageMarkers: boolean;
  healthBars: "none" | "enemies" | "all" | "contextual";
  dangerOverlay: boolean;
}

export interface ThirdPersonActionGameplayPolicy {
  controls: ThirdPersonActionControlPolicy;
  camera: ThirdPersonActionCameraPolicy;
  facing: ThirdPersonActionFacingPolicy;
  combat: ThirdPersonActionCombatPolicy;
  loot: ThirdPersonActionLootPolicy;
  respawn: ThirdPersonActionRespawnPolicy;
  hostile: ThirdPersonActionHostilePolicy;
  feedback: ThirdPersonActionFeedbackPolicy;
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object
    ? T[K] extends Array<unknown>
      ? T[K]
      : DeepPartial<T[K]>
    : T[K];
};

export type ThirdPersonActionGameplayPolicyPatch =
  DeepPartial<ThirdPersonActionGameplayPolicy>;

export type ProjectGameplayPolicyOverrides = Partial<
  Record<GameplayPolicyProfileId, ThirdPersonActionGameplayPolicyPatch>
>;

export function mergeThirdPersonActionGameplayPolicy(
  base: ThirdPersonActionGameplayPolicy,
  patch?: ThirdPersonActionGameplayPolicyPatch,
): ThirdPersonActionGameplayPolicy {
  if (!patch) {
    return cloneThirdPersonActionGameplayPolicy(base);
  }

  return {
    controls: {
      ...base.controls,
      ...patch.controls,
    },
    camera: {
      ...base.camera,
      ...patch.camera,
    },
    facing: {
      ...base.facing,
      ...patch.facing,
    },
    combat: {
      ...base.combat,
      ...patch.combat,
    },
    loot: {
      ...base.loot,
      ...patch.loot,
    },
    respawn: {
      ...base.respawn,
      ...patch.respawn,
    },
    hostile: {
      ...base.hostile,
      ...patch.hostile,
    },
    feedback: {
      ...base.feedback,
      ...patch.feedback,
    },
  };
}

export function mergeThirdPersonActionGameplayPolicyPatch(
  base: ThirdPersonActionGameplayPolicyPatch | undefined,
  patch: ThirdPersonActionGameplayPolicyPatch,
): ThirdPersonActionGameplayPolicyPatch {
  return {
    controls: {
      ...(base?.controls ?? {}),
      ...(patch.controls ?? {}),
    },
    camera: {
      ...(base?.camera ?? {}),
      ...(patch.camera ?? {}),
    },
    facing: {
      ...(base?.facing ?? {}),
      ...(patch.facing ?? {}),
    },
    combat: {
      ...(base?.combat ?? {}),
      ...(patch.combat ?? {}),
    },
    loot: {
      ...(base?.loot ?? {}),
      ...(patch.loot ?? {}),
    },
    respawn: {
      ...(base?.respawn ?? {}),
      ...(patch.respawn ?? {}),
    },
    hostile: {
      ...(base?.hostile ?? {}),
      ...(patch.hostile ?? {}),
    },
    feedback: {
      ...(base?.feedback ?? {}),
      ...(patch.feedback ?? {}),
    },
  };
}

export function cloneThirdPersonActionGameplayPolicy(
  policy: ThirdPersonActionGameplayPolicy,
): ThirdPersonActionGameplayPolicy {
  return JSON.parse(JSON.stringify(policy)) as ThirdPersonActionGameplayPolicy;
}
