import {
  ResolvedEntity,
  Vec3,
  resolveEntity,
  sectorCoordForPoint,
  sectorKeyForPoint,
} from "../core/schema";
import { HostileActivityTier, ModuleContext, RuntimeFeature, RuntimeFeatureHost } from "./types";

export interface HostileAIStats {
  summary: string;
  activeSectors: number;
  occupiedSectors: number;
}

export class HostileAIFeature implements RuntimeFeature {
  readonly id = "hostile_ai" as const;

  private stats: HostileAIStats = {
    summary: "No hostile activity yet.",
    activeSectors: 0,
    occupiedSectors: 0,
  };

  onWorldRebuilt(): void {
    this.stats = {
      summary: "No hostile activity yet.",
      activeSectors: 0,
      occupiedSectors: 0,
    };
  }

  onUpdateHostiles(
    dtSeconds: number,
    context: ModuleContext,
    host: RuntimeFeatureHost,
    playerId: string,
  ): boolean {
    switch (host.getHostileBehavior()) {
      case "lane_2d":
        this.updateLaneHostiles(dtSeconds, context, host, playerId);
        return true;
      case "survival_zombie":
        this.updateSurvivalHostiles(dtSeconds, context, host, playerId);
        return true;
      case "arena_3d":
      default:
        this.updateArenaHostiles(dtSeconds, context, host, playerId);
        return true;
    }
  }

  getWorldDebug(): string[] {
    return [
      this.stats.summary,
      `Hostile sectors: ${this.stats.activeSectors} active / ${this.stats.occupiedSectors} occupied`,
    ];
  }

  getStats(): HostileAIStats {
    return { ...this.stats };
  }

  private updateArenaHostiles(
    dtSeconds: number,
    context: ModuleContext,
    host: RuntimeFeatureHost,
    playerId: string,
  ): void {
    const world = context.store.peekWorld();
    const player = world.entities.find((entity) => entity.id === playerId);
    if (!player) {
      return;
    }
    const resolvedPlayer = resolveEntity(world, player);
    const hostilePolicy = host.getGameplayPolicy().hostile;
    host.resetHostileActivity();
    const occupiedSectors = new Set<string>();
    const activeSectors = new Set<string>();

    for (const entity of world.entities) {
      if (entity.id === playerId) {
        continue;
      }
      const resolved = resolveEntity(world, entity);
      if (!host.isHostileEntity(resolved)) {
        continue;
      }

      occupiedSectors.add(sectorKeyForPoint(resolved.transform.position, world.settings.sectorSize));
      if (this.handleDeadOrDormantHostile(dtSeconds, context, host, resolvedPlayer, resolved, "arena_3d")) {
        continue;
      }

      const combat = resolved.components.combat;
      const distance = planarDistance(resolvedPlayer.transform.position, resolved.transform.position);
      const aggroRadius = (resolved.components.brain?.aggroRadius ?? 14) * hostilePolicy.aggroRadiusScale;
      const leashRadius = aggroRadius * hostilePolicy.leashRadiusScale;
      const activityTier: HostileActivityTier =
        distance <= aggroRadius
          ? "active"
          : distance <= aggroRadius + hostilePolicy.throttlePadding
            ? "throttled"
            : "sleeping";
      host.noteHostileActivity(entity.id, activityTier);
      if (activityTier === "active") {
        activeSectors.add(sectorKeyForPoint(resolved.transform.position, world.settings.sectorSize));
      }

      const updateDt = host.consumeHostileUpdateDt(
        entity.id,
        dtSeconds,
        activityTier === "throttled" ? resolved.components.brain?.farThinkIntervalSeconds ?? 0.35 : 0,
      );
      if (activityTier === "sleeping") {
        host.syncAnimationState(context, entity.id, "idle");
        host.recordHostileMotion(entity.id, resolved.transform.position, false, dtSeconds);
        continue;
      }
      if (updateDt === null) {
        continue;
      }

      if (this.tryHostileAttack(context, host, resolved, playerId, combat?.range ?? 0, combat?.damage ?? 0, combat?.cooldownSeconds ?? 0, distance, updateDt)) {
        continue;
      }

      const lockedAction = host.getCurrentLockedAction(context, entity.id);
      if (distance > leashRadius || (lockedAction?.lockMovement ?? false)) {
        host.syncAnimationState(context, entity.id, "idle");
        host.recordHostileMotion(entity.id, resolved.transform.position, false, updateDt);
        continue;
      }

      const speed = resolved.components.character?.moveSpeed ?? 2.4;
      const dirX = (resolvedPlayer.transform.position.x - resolved.transform.position.x) / Math.max(distance, 0.001);
      const dirZ = (resolvedPlayer.transform.position.z - resolved.transform.position.z) / Math.max(distance, 0.001);
      const movement = context.physics.moveCharacter(entity.id, {
        x: dirX * speed * updateDt,
        y: 0,
        z: dirZ * speed * updateDt,
      });
      if (!movement) {
        host.recordHostileMotion(entity.id, resolved.transform.position, true, updateDt);
        continue;
      }
      host.syncAnimationState(context, entity.id, "walk");
      updateActorTransform(context, entity.id, movement.position, {
        x: 0,
        y: Math.atan2(dirX, dirZ),
        z: 0,
      });
      host.recordHostileMotion(entity.id, movement.position, true, updateDt);
    }

    this.stats = {
      summary: `Hostile sectors ${activeSectors.size} active / ${occupiedSectors.size} occupied`,
      activeSectors: activeSectors.size,
      occupiedSectors: occupiedSectors.size,
    };
  }

  private updateLaneHostiles(
    dtSeconds: number,
    context: ModuleContext,
    host: RuntimeFeatureHost,
    playerId: string,
  ): void {
    const world = context.store.peekWorld();
    const player = world.entities.find((entity) => entity.id === playerId);
    if (!player) {
      return;
    }
    const resolvedPlayer = resolveEntity(world, player);
    const hostilePolicy = host.getGameplayPolicy().hostile;
    host.resetHostileActivity();

    for (const entity of world.entities) {
      if (entity.id === playerId) {
        continue;
      }
      const resolved = resolveEntity(world, entity);
      if (!host.isHostileEntity(resolved)) {
        continue;
      }

      if (host.isDeadEntity(resolved)) {
        const deathAction = host.resolveActionDefinition(resolved, "death");
        host.lockAnimationState(entity.id, deathAction.state, Number.POSITIVE_INFINITY);
        host.syncAction(context, entity.id, deathAction);
        continue;
      }

      const physics = resolved.components.physics;
      if (!physics || physics.body !== "kinematic") {
        continue;
      }

      const dx = resolvedPlayer.transform.position.x - resolved.transform.position.x;
      const verticalGap = Math.abs(resolvedPlayer.transform.position.y - resolved.transform.position.y);
      const distance = Math.abs(dx);
      const aggroRadius = (resolved.components.brain?.aggroRadius ?? 12) * hostilePolicy.aggroRadiusScale;
      const leashRadius = aggroRadius * hostilePolicy.leashRadiusScale;
      const activityTier: HostileActivityTier =
        distance <= aggroRadius
          ? "active"
          : distance <= aggroRadius + hostilePolicy.throttlePadding
            ? "throttled"
            : "sleeping";
      host.noteHostileActivity(entity.id, activityTier);

      if (activityTier === "sleeping" || verticalGap > 3.5 || host.isDeadEntity(resolvedPlayer)) {
        host.syncAnimationState(context, entity.id, "idle");
        host.recordHostileMotion(entity.id, resolved.transform.position, false, dtSeconds);
        continue;
      }

      const updateDt = host.consumeHostileUpdateDt(
        entity.id,
        dtSeconds,
        activityTier === "throttled" ? resolved.components.brain?.farThinkIntervalSeconds ?? 0.35 : 0,
      );
      if (updateDt === null) {
        continue;
      }

      const combat = resolved.components.combat;
      if (this.tryHostileAttack(context, host, resolved, playerId, combat?.range ?? 0, combat?.damage ?? 0, combat?.cooldownSeconds ?? 0, distance, updateDt)) {
        continue;
      }

      const lockedAction = host.getCurrentLockedAction(context, entity.id);
      if ((lockedAction?.lockMovement ?? false) || distance > leashRadius) {
        host.syncAnimationState(context, entity.id, "idle");
        host.recordHostileMotion(entity.id, resolved.transform.position, false, updateDt);
        continue;
      }

      const speed = resolved.components.character?.moveSpeed ?? 2.2;
      const direction = dx < 0 ? -1 : 1;
      const movement = context.physics.moveCharacter(entity.id, {
        x: direction * speed * updateDt,
        y: -0.03,
        z: 0,
      });
      if (!movement) {
        host.recordHostileMotion(entity.id, resolved.transform.position, true, updateDt);
        continue;
      }

      const nextPosition: Vec3 = {
        x: movement.position.x,
        y: movement.position.y,
        z: 0,
      };
      host.syncAnimationState(context, entity.id, "walk");
      updateActorTransform(context, entity.id, nextPosition, {
        x: 0,
        y: direction < 0 ? -Math.PI * 0.5 : Math.PI * 0.5,
        z: 0,
      });
      host.recordHostileMotion(entity.id, nextPosition, true, updateDt);
    }

    this.stats = {
      summary: "Lane hostiles track the player on the platform plane.",
      activeSectors: 0,
      occupiedSectors: 0,
    };
  }

  private updateSurvivalHostiles(
    dtSeconds: number,
    context: ModuleContext,
    host: RuntimeFeatureHost,
    playerId: string,
  ): void {
    const world = context.store.peekWorld();
    const player = world.entities.find((entity) => entity.id === playerId);
    if (!player) {
      return;
    }
    const resolvedPlayer = resolveEntity(world, player);
    const sectorSize = world.settings.sectorSize;
    const playerSector = sectorCoordForPoint(resolvedPlayer.transform.position, sectorSize);
    const hostilePolicy = host.getGameplayPolicy().hostile;
    const occupiedSectors = new Set<string>();
    const activeSectors = new Set<string>();
    host.resetHostileActivity();

    for (const entity of world.entities) {
      if (entity.id === playerId) {
        continue;
      }
      const resolved = resolveEntity(world, entity);
      const brain = resolved.components.brain;
      if (brain?.archetype !== "zombie") {
        continue;
      }

      occupiedSectors.add(sectorKeyForPoint(resolved.transform.position, sectorSize));
      if (this.handleDeadOrDormantHostile(dtSeconds, context, host, resolvedPlayer, resolved, "survival_zombie")) {
        continue;
      }

      const deltaX = resolvedPlayer.transform.position.x - resolved.transform.position.x;
      const deltaZ = resolvedPlayer.transform.position.z - resolved.transform.position.z;
      const distance = Math.hypot(deltaX, deltaZ);
      const zombieSector = sectorCoordForPoint(resolved.transform.position, sectorSize);
      const sectorDistance = Math.max(
        Math.abs(zombieSector.x - playerSector.x),
        Math.abs(zombieSector.z - playerSector.z),
      );
      const aggroRadius = (brain.aggroRadius ?? 0) * hostilePolicy.aggroRadiusScale;
      const leashRadius = aggroRadius * hostilePolicy.leashRadiusScale;
      const activityRadius = brain.activityRadius ?? Math.max(aggroRadius + 4, 18);
      const sleepRadius = brain.sleepRadius ?? Math.max(activityRadius + hostilePolicy.sleepPadding, 42);
      const activityTier: HostileActivityTier =
        distance <= activityRadius || sectorDistance <= 1
          ? "active"
          : distance <= sleepRadius || sectorDistance <= 2
            ? "throttled"
            : "sleeping";
      host.noteHostileActivity(entity.id, activityTier);
      if (activityTier === "active") {
        activeSectors.add(sectorKeyForPoint(resolved.transform.position, sectorSize));
      }

      const updateDt = host.consumeHostileUpdateDt(
        entity.id,
        dtSeconds,
        activityTier === "throttled" ? brain.farThinkIntervalSeconds ?? 0.35 : 0,
      );

      if (activityTier === "sleeping") {
        host.syncAnimationState(context, entity.id, "idle");
        host.recordHostileMotion(entity.id, resolved.transform.position, false, dtSeconds);
        continue;
      }
      if (updateDt === null) {
        continue;
      }

      const combat = resolved.components.combat;
      if (this.tryHostileAttack(context, host, resolved, playerId, combat?.range ?? 0, combat?.damage ?? 0, combat?.cooldownSeconds ?? 0, distance, updateDt)) {
        continue;
      }

      const lockedAction = host.getCurrentLockedAction(context, entity.id);
      const chasing = distance > (combat?.range ?? 0) && distance <= leashRadius;
      if (!chasing || (lockedAction?.lockMovement ?? false)) {
        host.syncAnimationState(context, entity.id, "idle");
        host.recordHostileMotion(entity.id, resolved.transform.position, false, updateDt);
        continue;
      }

      const speed = resolved.components.character?.moveSpeed ?? 2;
      const movement = context.physics.moveCharacter(entity.id, {
        x: (deltaX / Math.max(distance, 0.001)) * speed * updateDt,
        y: 0,
        z: (deltaZ / Math.max(distance, 0.001)) * speed * updateDt,
      });
      if (!movement) {
        host.recordHostileMotion(entity.id, resolved.transform.position, true, updateDt);
        continue;
      }
      host.syncAnimationState(context, entity.id, "walk");
      updateActorTransform(context, entity.id, movement.position, {
        x: 0,
        y: Math.atan2(deltaX / Math.max(distance, 0.001), deltaZ / Math.max(distance, 0.001)),
        z: 0,
      });
      host.recordHostileMotion(entity.id, movement.position, true, updateDt);
    }

    this.stats = {
      summary: `Player sector ${playerSector.x}:${playerSector.z} | zombie sectors ${activeSectors.size} active / ${occupiedSectors.size} occupied`,
      activeSectors: activeSectors.size,
      occupiedSectors: occupiedSectors.size,
    };
  }

  private handleDeadOrDormantHostile(
    dtSeconds: number,
    context: ModuleContext,
    host: RuntimeFeatureHost,
    player: ResolvedEntity,
    hostile: ResolvedEntity,
    _behavior: "arena_3d" | "survival_zombie",
  ): boolean {
    if (host.isDeadEntity(hostile)) {
      const deathAction = host.resolveActionDefinition(hostile, "death");
      host.lockAnimationState(hostile.id, deathAction.state, Number.POSITIVE_INFINITY);
      host.syncAction(context, hostile.id, deathAction);
      return true;
    }

    if (host.isDeadEntity(player)) {
      host.syncAnimationState(context, hostile.id, "idle");
      host.recordHostileMotion(hostile.id, hostile.transform.position, false, dtSeconds);
      return true;
    }

    const physics = hostile.components.physics;
    return !physics || physics.body !== "kinematic";
  }

  private tryHostileAttack(
    context: ModuleContext,
    host: RuntimeFeatureHost,
    hostile: ResolvedEntity,
    playerId: string,
    attackRange: number,
    damage: number,
    cooldownSeconds: number,
    distance: number,
    dtSeconds: number,
  ): boolean {
    if (!hostile.components.combat || distance > attackRange || !host.cooldownReady(hostile.id)) {
      return false;
    }
    const attackAction = host.resolveActionDefinition(hostile, "attack");
    const attackDuration = host.resolveActionDuration(context, hostile.id, attackAction);
    host.applyDamage(context, playerId, damage);
    host.setCooldown(hostile.id, cooldownSeconds);
    host.lockAnimationState(hostile.id, "attack", attackDuration);
    host.syncAction(context, hostile.id, attackAction);
    host.pushEvent(`${hostile.name} hit player for ${damage}.`);
    host.recordHostileMotion(hostile.id, hostile.transform.position, false, dtSeconds);
    return true;
  }
}

function updateActorTransform(
  context: ModuleContext,
  entityId: string,
  position: Vec3,
  rotation: Vec3,
): void {
  context.store.updateEntityTransform(entityId, { position, rotation });
  context.scene.updateEntityTransform(entityId, { position, rotation });
}

function planarDistance(left: Vec3, right: Vec3): number {
  return Math.hypot(left.x - right.x, left.z - right.z);
}
