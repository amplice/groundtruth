import { WorldStore } from "../core/worldStore";
import { SectorLifecycleState, SectorPopulationTrend, WorldDocument } from "../core/schema";
import { InputController } from "../runtime/input";
import { PhysicsRuntime } from "../runtime/physicsRuntime";
import { SceneRuntime } from "../runtime/sceneRuntime";

export interface ModuleContext {
  store: WorldStore;
  scene: SceneRuntime;
  physics: PhysicsRuntime;
  input: InputController;
}

export interface RuntimeSectorOverlay {
  sectorSize: number;
  centerSector: string;
  residentSectorKeys: string[];
  trackedSectors: Array<{
    sectorKey: string;
    status: SectorLifecycleState;
    trend: SectorPopulationTrend;
    live: number;
    pooled: number;
    dormant: number;
    recentSeconds: number;
    offlineSeconds: number;
  }>;
}

export type RuntimeFeatureId =
  | "sector_population"
  | "interaction_inventory"
  | "combat"
  | "combat_feedback";

export type RuntimeFeatureEvent =
  | {
      type: "damage_applied";
      targetId: string;
      amount: number;
      currentHealth: number;
      maxHealth: number;
    }
  | {
      type: "entity_died";
      entityId: string;
      wasPlayer: boolean;
    }
  | {
      type: "loot_collected";
      actorId: string;
      sourceId: string;
      itemId: string;
    }
  | {
      type: "player_danger_changed";
      level: number;
    };

export interface RuntimeFeatureHost {
  getControlLine(): string;
  getIdlePrompt(): string;
  getAttackKey(): string;
  emitFeatureEvent(event: RuntimeFeatureEvent, context: ModuleContext): void;
  resolveEntityById(context: ModuleContext, entityId: string): import("../core/schema").ResolvedEntity;
  findNearestHostile(
    world: WorldDocument,
    source: import("../core/schema").ResolvedEntity,
    range: number,
    targetTags: string[] | undefined,
  ): import("../core/schema").ResolvedEntity | null;
  findNearestInteractive(
    world: WorldDocument,
    source: import("../core/schema").ResolvedEntity,
  ): import("../core/schema").ResolvedEntity | null;
  resolveActionDefinition(
    entity: import("../core/schema").ResolvedEntity,
    actionId: string,
  ): import("../core/schema").ActionDefinition;
  resolveActionDuration(
    context: ModuleContext,
    entityId: string,
    action: import("../core/schema").ActionDefinition,
  ): number;
  syncAction(
    context: ModuleContext,
    entityId: string,
    action: import("../core/schema").ActionDefinition,
  ): void;
  lockAnimationState(entityId: string, state: string, durationSeconds: number): void;
  cooldownReady(entityId: string): boolean;
  setCooldown(entityId: string, seconds: number): void;
  applyDamage(context: ModuleContext, targetId: string, amount: number): void;
  readHealth(entity: import("../core/schema").ResolvedEntity): string;
  pushEvent(message: string): void;
}

export interface RuntimeFeatureFrameResult {
  shortCircuit?: boolean;
  statusLines?: string[];
  debugFindings?: string[];
  events?: string[];
}

export interface RuntimeFeature {
  readonly id: RuntimeFeatureId;
  beginFrame?(
    dtSeconds: number,
    context: ModuleContext,
    host: RuntimeFeatureHost,
  ): RuntimeFeatureFrameResult | void;
  getWorldDebug?(world: WorldDocument): string[];
  getSectorOverlay?(): RuntimeSectorOverlay | null;
  getStatusHint?(
    context: ModuleContext,
    host: RuntimeFeatureHost,
    player: import("../core/schema").ResolvedEntity,
  ): string | null;
  onPlayerAttack?(
    context: ModuleContext,
    host: RuntimeFeatureHost,
    playerId: string,
  ): boolean;
  onPlayerInteract?(
    context: ModuleContext,
    host: RuntimeFeatureHost,
    playerId: string,
  ): boolean;
  onApplyDamage?(
    context: ModuleContext,
    host: RuntimeFeatureHost,
    targetId: string,
    amount: number,
  ): boolean;
  onEvent?(
    event: RuntimeFeatureEvent,
    context: ModuleContext,
    host: RuntimeFeatureHost,
  ): void;
}

export interface RuntimeModule {
  readonly id: string;
  update(dtSeconds: number, context: ModuleContext): void;
  getStatusLines?(): string[];
  getDebugFindings?(): string[];
  getWorldDebug?(world: WorldDocument): string[];
  getSectorOverlay?(): RuntimeSectorOverlay | null;
  getEntityDebug?(world: WorldDocument, entityId: string): string[];
  getRecentEvents?(): string[];
}
