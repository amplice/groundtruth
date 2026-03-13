import {
  ActionDefinition,
  AnimationComponent,
  AnimationLoopMode,
  CameraRigComponent,
  EntitySpec,
  ResolvedEntity,
  Vec3,
  resolveEntity,
} from "../core/schema";
import {
  ActionModulePreset,
  PLATFORMER_ACTION_PRESET,
  THIRD_PERSON_ACTION_PRESET,
} from "./actionModulePresets";
import { createRuntimeFeatures } from "./runtimeFeatureRegistry";
import {
  ModuleContext,
  RuntimeFeature,
  RuntimeFeatureEvent,
  RuntimeFeatureId,
  RuntimeFeatureHost,
  RuntimeModule,
  RuntimeSectorOverlay,
} from "./types";

interface AnimationLock {
  state: string;
  remainingSeconds: number;
}

interface MotionSample {
  position: Vec3;
  stalledSeconds: number;
}

type HostileActivityTier = "active" | "throttled" | "sleeping";

export class PresetActionModule implements RuntimeModule, RuntimeFeatureHost {
  readonly id: RuntimeModule["id"];

  protected readonly cooldowns = new Map<string, number>();

  protected readonly animationLocks = new Map<string, AnimationLock>();

  protected readonly motionSamples = new Map<string, MotionSample>();

  protected readonly hostileUpdateAccumulatedDt = new Map<string, number>();

  protected readonly hostileActivityTiers = new Map<string, HostileActivityTier>();

  protected recentEvents: string[] = [];

  protected statusLines = [
    "WASD move | Shift sprint | Space attack | E interact",
  ];

  protected debugFindings = ["No runtime findings."];

  protected hostileActivityCounts = {
    active: 0,
    throttled: 0,
    sleeping: 0,
  };

  protected readonly verticalVelocity = new Map<string, number>();

  protected readonly groundedState = new Map<string, boolean>();

  protected readonly features: RuntimeFeature[];

  constructor(protected readonly preset: ActionModulePreset) {
    this.id = preset.id;
    this.features = createRuntimeFeatures(preset.featureIds ?? []);
  }

  update(dtSeconds: number, context: ModuleContext): void {
    try {
      this.beginFrame(dtSeconds, context);
    } catch (error) {
      if (error instanceof FeatureShortCircuitError) {
        return;
      }
      throw error;
    }
    this.runFrame(dtSeconds, context);
  }

  protected beginFrame(dtSeconds: number, context: ModuleContext): void {
    this.tickCooldowns(dtSeconds);
    this.tickAnimationLocks(dtSeconds, context);
    for (const feature of this.features) {
      const result = feature.beginFrame?.(dtSeconds, context, this);
      if (!result) {
        continue;
      }
      for (const event of result.events ?? []) {
        this.pushEvent(event);
      }
      if (result.statusLines) {
        this.statusLines = [...result.statusLines];
      }
      if (result.debugFindings) {
        this.debugFindings = [...result.debugFindings];
      }
      if (result.shortCircuit) {
        throw new FeatureShortCircuitError();
      }
    }
  }

  protected runFrame(dtSeconds: number, context: ModuleContext): void {
    const world = context.store.peekWorld();
    const player = world.entities.find((entity) => entity.id === "player");
    if (!player) {
      this.statusLines = ["No player entity in world."];
      this.debugFindings = ["No player entity in world."];
      return;
    }

    const resolvedPlayer = resolveEntity(world, player);
    const character = resolvedPlayer.components.character;
    if (!character) {
      this.statusLines = ["Player entity has no character component."];
      this.debugFindings = ["Player entity has no character component."];
      return;
    }

    if (this.isDead(resolvedPlayer)) {
      const deathAction = this.resolveActionDefinition(resolvedPlayer, "death");
      this.lockAnimationState(player.id, deathAction.state, Number.POSITIVE_INFINITY);
      this.syncAction(context, player.id, deathAction);
      this.updateHostiles(dtSeconds, context, player.id);
      this.updateStatus(context, resolvedPlayer, "You are down. Reset or generate a new world to continue.");
      this.updateDebugFindings(context, resolvedPlayer);
      return;
    }

    this.updatePlayerMovement(
      dtSeconds,
      context,
      player.id,
      character.moveSpeed,
      character.sprintSpeed,
      resolvedPlayer.components.cameraRig,
    );
    this.tryPlayerAttack(context, player.id);
    this.tryPlayerInteraction(context, player.id);
    this.updateHostiles(dtSeconds, context, player.id);

    const livePlayer = resolveEntity(context.store.peekWorld(), this.mustFindEntity(context, player.id));
    this.updateStatus(context, livePlayer);
    this.updateDebugFindings(context, livePlayer);
  }

  getStatusLines(): string[] {
    return [...this.statusLines];
  }

  getDebugFindings(): string[] {
    return [...this.debugFindings];
  }

  getEntityDebug(
    world: ReturnType<ModuleContext["store"]["peekWorld"]>,
    entityId: string,
  ): string[] {
    const entity = world.entities.find((item) => item.id === entityId);
    if (!entity) {
      return ["Selected entity no longer exists."];
    }

    const resolved = resolveEntity(world, entity);
    const animationLock = this.animationLocks.get(entityId);
    const lines = [
      `Health: ${this.readHealth(resolved)}`,
      `Anim state: ${resolved.components.animation?.state ?? "none"}`,
      `Cooldown: ${this.cooldowns.get(entityId)?.toFixed(2) ?? "0.00"}s`,
      `Anim lock: ${animationLock ? `${animationLock.state} (${formatSeconds(animationLock.remainingSeconds)})` : "none"}`,
    ];

    if (this.isHostile(resolved)) {
      const motion = this.motionSamples.get(entityId);
      lines.push(`Activity: ${this.hostileActivityTiers.get(entityId) ?? "unknown"}`);
      lines.push(`Stall timer: ${motion ? formatSeconds(motion.stalledSeconds) : "0.00s"}`);
    }

    return lines;
  }

  getRecentEvents(): string[] {
    return [...this.recentEvents];
  }

  emitFeatureEvent(event: RuntimeFeatureEvent, context: ModuleContext): void {
    for (const feature of this.features) {
      feature.onEvent?.(event, context, this);
    }
  }

  getWorldDebug(world: ReturnType<ModuleContext["store"]["peekWorld"]>): string[] {
    return this.features.flatMap((feature) => feature.getWorldDebug?.(world) ?? []);
  }

  getSectorOverlay(): RuntimeSectorOverlay | null {
    for (const feature of this.features) {
      const overlay = feature.getSectorOverlay?.();
      if (overlay) {
        return overlay;
      }
    }
    return null;
  }

  protected requireFeature<T extends RuntimeFeature>(featureId: RuntimeFeatureId): T {
    const feature = this.features.find((item) => item.id === featureId);
    if (!feature) {
      throw new Error(`Expected runtime feature '${featureId}' to be installed.`);
    }
    return feature as T;
  }

  protected updatePlayerMovement(
    dtSeconds: number,
    context: ModuleContext,
    playerId: string,
    moveSpeed: number,
    sprintSpeed: number | undefined,
    cameraRig: ResolvedEntity["components"]["cameraRig"],
  ): void {
    switch (this.preset.playerMovementMode) {
      case "top_down":
        this.updateTopDownPlayerMovement(dtSeconds, context, playerId, moveSpeed, sprintSpeed);
        return;
      case "platformer":
        this.updatePlatformerPlayerMovement(dtSeconds, context, playerId, moveSpeed, sprintSpeed);
        return;
      default:
        break;
    }

    const activeCameraRig = this.resolveCameraRig(cameraRig);
    const axes = context.input.movementAxes();
    const length = Math.hypot(axes.x, axes.z);
    const resolvedPlayer = resolveEntity(context.store.peekWorld(), this.mustFindEntity(context, playerId));
    const currentLock = this.animationLocks.get(playerId);
    const lockedAction = currentLock
      ? this.resolveActionDefinition(resolvedPlayer, currentLock.state)
      : null;
    if (length <= 0.001 || (lockedAction?.lockMovement ?? false)) {
      this.syncAnimationState(context, playerId, "idle");
      context.scene.updateFollowCamera(playerId, activeCameraRig);
      return;
    }

    const speed = axes.sprint
      ? sprintSpeed ?? moveSpeed * (this.preset.sprintMultiplier ?? 1.5)
      : moveSpeed;
    const basis = context.scene.getMovementBasis();
    const dirX = (basis.right.x * axes.x + basis.forward.x * axes.z) / length;
    const dirZ = (basis.right.z * axes.x + basis.forward.z * axes.z) / length;
    const movement = context.physics.moveCharacter(playerId, {
      x: dirX * speed * dtSeconds,
      y: 0,
      z: dirZ * speed * dtSeconds,
    });
    if (!movement) {
      return;
    }

    this.syncAnimationState(context, playerId, axes.sprint ? "run" : "walk");
    const rotation = {
      x: 0,
      y: Math.atan2(dirX, dirZ),
      z: 0,
    };
    context.store.updateEntityTransform(playerId, {
      position: movement.position,
      rotation,
    });
    context.scene.updateEntityTransform(playerId, {
      position: movement.position,
      rotation,
    });
    context.scene.updateFollowCamera(playerId, activeCameraRig);
  }

  protected tryPlayerAttack(context: ModuleContext, playerId: string): void {
    for (const feature of this.features) {
      if (feature.onPlayerAttack?.(context, this, playerId)) {
        return;
      }
    }
  }

  protected tryPlayerInteraction(context: ModuleContext, playerId: string): void {
    for (const feature of this.features) {
      if (feature.onPlayerInteract?.(context, this, playerId)) {
        return;
      }
    }
  }

  protected updateHostiles(
    dtSeconds: number,
    context: ModuleContext,
    playerId: string,
  ): void {
    if (this.preset.hostileBehavior === "lane_2d") {
      this.updateLaneHostiles(dtSeconds, context, playerId);
      return;
    }

    const world = context.store.peekWorld();
    const player = world.entities.find((entity) => entity.id === playerId);
    if (!player) {
      return;
    }
    const resolvedPlayer = resolveEntity(world, player);
    this.hostileActivityCounts = {
      active: 0,
      throttled: 0,
      sleeping: 0,
    };

    for (const entity of world.entities) {
      if (entity.id === playerId) {
        continue;
      }
      const resolved = resolveEntity(world, entity);
      if (!this.isHostile(resolved)) {
        continue;
      }

      if (this.isDead(resolved)) {
        const deathAction = this.resolveActionDefinition(resolved, "death");
        this.lockAnimationState(entity.id, deathAction.state, Number.POSITIVE_INFINITY);
        this.syncAction(context, entity.id, deathAction);
        continue;
      }

      if (this.isDead(resolvedPlayer)) {
        this.syncAnimationState(context, entity.id, "idle");
        this.recordHostileMotion(entity.id, resolved.transform.position, false, dtSeconds);
        continue;
      }

      const physics = resolved.components.physics;
      if (!physics || physics.body !== "kinematic") {
        continue;
      }

      const speed = resolved.components.character?.moveSpeed ?? 2.4;
      const combat = resolved.components.combat;
      const currentLock = this.animationLocks.get(entity.id);
      const lockedAction = currentLock
        ? this.resolveActionDefinition(resolved, currentLock.state)
        : null;
      const deltaX = player.transform.position.x - entity.transform.position.x;
      const deltaZ = player.transform.position.z - entity.transform.position.z;
      const distance = Math.hypot(deltaX, deltaZ);
      const aggroRadius = resolved.components.brain?.aggroRadius ?? 14;
      const activityTier = distance <= aggroRadius
        ? "active"
        : distance <= aggroRadius + 14
          ? "throttled"
          : "sleeping";
      this.hostileActivityTiers.set(entity.id, activityTier);
      this.hostileActivityCounts[activityTier] += 1;
      const updateDt = this.consumeHostileUpdateDt(
        entity.id,
        dtSeconds,
        activityTier === "throttled" ? resolved.components.brain?.farThinkIntervalSeconds ?? 0.35 : 0,
      );

      if (activityTier === "sleeping") {
        this.syncAnimationState(context, entity.id, "idle");
        this.recordHostileMotion(entity.id, resolved.transform.position, false, dtSeconds);
        continue;
      }
      if (updateDt === null) {
        continue;
      }

      const attackRange = combat?.range ?? 0;
      if (combat && distance <= attackRange && this.cooldownReady(entity.id)) {
        const attackAction = this.resolveActionDefinition(resolved, "attack");
        const attackDuration = this.resolveActionDuration(context, entity.id, attackAction);
        this.applyDamage(context, playerId, combat.damage);
        this.setCooldown(entity.id, combat.cooldownSeconds);
        this.lockAnimationState(entity.id, "attack", attackDuration);
        this.syncAction(context, entity.id, attackAction);
        this.pushEvent(`${resolved.name} hit player for ${combat.damage}.`);
        this.recordHostileMotion(entity.id, resolved.transform.position, false, updateDt);
        continue;
      }

      if (distance > aggroRadius || (lockedAction?.lockMovement ?? false)) {
        this.syncAnimationState(context, entity.id, "idle");
        this.recordHostileMotion(entity.id, resolved.transform.position, false, updateDt);
        continue;
      }

      const dirX = deltaX / Math.max(distance, 0.001);
      const dirZ = deltaZ / Math.max(distance, 0.001);
      const movement = context.physics.moveCharacter(entity.id, {
        x: dirX * speed * updateDt,
        y: 0,
        z: dirZ * speed * updateDt,
      });
      if (!movement) {
        this.recordHostileMotion(entity.id, resolved.transform.position, true, updateDt);
        continue;
      }

      this.syncAnimationState(context, entity.id, "walk");
      const rotation = {
        x: 0,
        y: Math.atan2(dirX, dirZ),
        z: 0,
      };
      context.store.updateEntityTransform(entity.id, {
        position: movement.position,
        rotation,
      });
      context.scene.updateEntityTransform(entity.id, {
        position: movement.position,
        rotation,
      });
      this.recordHostileMotion(entity.id, movement.position, true, updateDt);
    }
  }

  protected updateTopDownPlayerMovement(
    dtSeconds: number,
    context: ModuleContext,
    playerId: string,
    moveSpeed: number,
    sprintSpeed: number | undefined,
  ): void {
    const axes = context.input.movementAxes();
    const length = Math.hypot(axes.x, axes.z);
    const resolvedPlayer = this.resolveEntityById(context, playerId);
    const currentLock = this.animationLocks.get(playerId);
    const lockedAction = currentLock
      ? this.resolveActionDefinition(resolvedPlayer, currentLock.state)
      : null;
    const cameraRig = this.resolveCameraRig();

    if (length <= 0.001 || (lockedAction?.lockMovement ?? false)) {
      this.syncAnimationState(context, playerId, "idle");
      context.scene.updateFollowCamera(playerId, cameraRig);
      return;
    }

    const speed = axes.sprint
      ? sprintSpeed ?? moveSpeed * (this.preset.sprintMultiplier ?? 1.4)
      : moveSpeed;
    const dirX = axes.x / length;
    const dirZ = axes.z / length;
    const movement = context.physics.moveCharacter(playerId, {
      x: dirX * speed * dtSeconds,
      y: 0,
      z: dirZ * speed * dtSeconds,
    });
    if (!movement) {
      context.scene.updateFollowCamera(playerId, cameraRig);
      return;
    }

    this.syncAnimationState(context, playerId, axes.sprint ? "run" : "walk");
    const rotation = {
      x: 0,
      y: Math.atan2(dirX, dirZ),
      z: 0,
    };
    context.store.updateEntityTransform(playerId, {
      position: movement.position,
      rotation,
    });
    context.scene.updateEntityTransform(playerId, {
      position: movement.position,
      rotation,
    });
    context.scene.updateFollowCamera(playerId, cameraRig);
  }

  protected updatePlatformerPlayerMovement(
    dtSeconds: number,
    context: ModuleContext,
    playerId: string,
    moveSpeed: number,
    sprintSpeed: number | undefined,
  ): void {
    const axes = context.input.movementAxes();
    const resolvedPlayer = this.resolveEntityById(context, playerId);
    const currentLock = this.animationLocks.get(playerId);
    const lockedAction = currentLock
      ? this.resolveActionDefinition(resolvedPlayer, currentLock.state)
      : null;
    const jumpPressed = this.preset.jumpKey
      ? context.input.consumePress(this.preset.jumpKey)
      : false;
    const wasGrounded = this.groundedState.get(playerId) ?? false;
    let velocityY = this.verticalVelocity.get(playerId) ?? 0;

    if (wasGrounded && jumpPressed && !(lockedAction?.lockMovement ?? false)) {
      velocityY = resolvedPlayer.components.character?.jumpSpeed ?? 7.2;
      context.scene.spawnFloatingMarker(playerId, "JUMP", "info");
    }

    velocityY += -20 * dtSeconds;
    const moveX = axes.x === 0 || (lockedAction?.lockMovement ?? false)
      ? 0
      : (axes.x / Math.abs(axes.x))
        * (axes.sprint
          ? sprintSpeed ?? moveSpeed * (this.preset.sprintMultiplier ?? 1.3)
          : moveSpeed);
    const movement = context.physics.moveCharacter(playerId, {
      x: moveX * dtSeconds,
      y: (velocityY * dtSeconds) + (wasGrounded && velocityY <= 0 ? -0.04 : 0),
      z: 0,
    });
    const cameraRig = this.resolveCameraRig();

    if (!movement) {
      context.scene.updateFollowCamera(playerId, cameraRig);
      return;
    }

    const grounded = movement.grounded;
    if (grounded && velocityY < 0) {
      velocityY = 0;
    }
    this.verticalVelocity.set(playerId, velocityY);
    this.groundedState.set(playerId, grounded);

    let state: AnimationComponent["state"] = "idle";
    if (!grounded) {
      state = "run";
    } else if (Math.abs(moveX) > 0.001) {
      state = axes.sprint ? "run" : "walk";
    }
    this.syncAnimationState(context, playerId, state);

    const facing = moveX < -0.001
      ? -Math.PI * 0.5
      : moveX > 0.001
        ? Math.PI * 0.5
        : resolvedPlayer.transform.rotation?.y ?? Math.PI * 0.5;
    const nextPosition = {
      x: movement.position.x,
      y: movement.position.y,
      z: 0,
    };
    context.store.updateEntityTransform(playerId, {
      position: nextPosition,
      rotation: {
        x: 0,
        y: facing,
        z: 0,
      },
    });
    context.scene.updateEntityTransform(playerId, {
      position: nextPosition,
      rotation: {
        x: 0,
        y: facing,
        z: 0,
      },
    });
    context.scene.updateFollowCamera(playerId, cameraRig);
  }

  protected updateLaneHostiles(
    dtSeconds: number,
    context: ModuleContext,
    playerId: string,
  ): void {
    const world = context.store.peekWorld();
    const player = world.entities.find((entity) => entity.id === playerId);
    if (!player) {
      return;
    }
    const resolvedPlayer = resolveEntity(world, player);
    this.hostileActivityCounts = {
      active: 0,
      throttled: 0,
      sleeping: 0,
    };

    for (const entity of world.entities) {
      if (entity.id === playerId) {
        continue;
      }
      const resolved = resolveEntity(world, entity);
      if (!this.isHostile(resolved)) {
        continue;
      }

      if (this.isDead(resolved)) {
        const deathAction = this.resolveActionDefinition(resolved, "death");
        this.lockAnimationState(entity.id, deathAction.state, Number.POSITIVE_INFINITY);
        this.syncAction(context, entity.id, deathAction);
        continue;
      }

      const physics = resolved.components.physics;
      if (!physics || physics.body !== "kinematic") {
        continue;
      }

      const dx = resolvedPlayer.transform.position.x - resolved.transform.position.x;
      const verticalGap = Math.abs(resolvedPlayer.transform.position.y - resolved.transform.position.y);
      const distance = Math.abs(dx);
      const aggroRadius = resolved.components.brain?.aggroRadius ?? 12;
      const activityTier = distance <= aggroRadius
        ? "active"
        : distance <= aggroRadius + 10
          ? "throttled"
          : "sleeping";
      this.hostileActivityTiers.set(entity.id, activityTier);
      this.hostileActivityCounts[activityTier] += 1;

      if (activityTier === "sleeping" || verticalGap > 3.5 || this.isDead(resolvedPlayer)) {
        this.syncAnimationState(context, entity.id, "idle");
        this.recordHostileMotion(entity.id, resolved.transform.position, false, dtSeconds);
        continue;
      }

      const updateDt = this.consumeHostileUpdateDt(
        entity.id,
        dtSeconds,
        activityTier === "throttled" ? resolved.components.brain?.farThinkIntervalSeconds ?? 0.35 : 0,
      );
      if (updateDt === null) {
        continue;
      }

      const combat = resolved.components.combat;
      const attackRange = combat?.range ?? 0;
      if (combat && distance <= attackRange && this.cooldownReady(entity.id)) {
        const attackAction = this.resolveActionDefinition(resolved, "attack");
        const attackDuration = this.resolveActionDuration(context, entity.id, attackAction);
        this.applyDamage(context, playerId, combat.damage);
        this.setCooldown(entity.id, combat.cooldownSeconds);
        this.lockAnimationState(entity.id, "attack", attackDuration);
        this.syncAction(context, entity.id, attackAction);
        this.pushEvent(`${resolved.name} hit player for ${combat.damage}.`);
        this.recordHostileMotion(entity.id, resolved.transform.position, false, updateDt);
        continue;
      }

      const currentLock = this.animationLocks.get(entity.id);
      const lockedAction = currentLock
        ? this.resolveActionDefinition(resolved, currentLock.state)
        : null;
      if ((lockedAction?.lockMovement ?? false) || distance > aggroRadius) {
        this.syncAnimationState(context, entity.id, "idle");
        this.recordHostileMotion(entity.id, resolved.transform.position, false, updateDt);
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
        this.recordHostileMotion(entity.id, resolved.transform.position, true, updateDt);
        continue;
      }

      const nextPosition: Vec3 = {
        x: movement.position.x,
        y: movement.position.y,
        z: 0,
      };
      this.syncAnimationState(context, entity.id, "walk");
      context.store.updateEntityTransform(entity.id, {
        position: nextPosition,
        rotation: {
          x: 0,
          y: direction < 0 ? -Math.PI * 0.5 : Math.PI * 0.5,
          z: 0,
        },
      });
      context.scene.updateEntityTransform(entity.id, {
        position: nextPosition,
        rotation: {
          x: 0,
          y: direction < 0 ? -Math.PI * 0.5 : Math.PI * 0.5,
          z: 0,
        },
      });
      this.recordHostileMotion(entity.id, nextPosition, true, updateDt);
    }
  }

  applyDamage(
    context: ModuleContext,
    targetId: string,
    amount: number,
  ): void {
    for (const feature of this.features) {
      if (feature.onApplyDamage?.(context, this, targetId, amount)) {
        return;
      }
    }

    const world = context.store.peekWorld();
    const target = world.entities.find((entity) => entity.id === targetId);
    if (!target) {
      return;
    }
    const resolvedTarget = resolveEntity(world, target);
    const health = resolvedTarget.components.health;
    if (!health || health.current <= 0) {
      return;
    }

    const nextCurrent = Math.max(0, health.current - amount);
    context.store.updateEntityComponents(targetId, {
      health: {
        ...health,
        current: nextCurrent,
      },
    });
    this.emitFeatureEvent(
      {
        type: "damage_applied",
        targetId,
        amount,
        currentHealth: nextCurrent,
        maxHealth: health.max,
      },
      context,
    );

    if (nextCurrent <= 0) {
      const deathAction = this.resolveActionDefinition(resolvedTarget, "death");
      this.lockAnimationState(targetId, deathAction.state, Number.POSITIVE_INFINITY);
      this.syncAction(context, targetId, deathAction);
      this.emitFeatureEvent(
        {
          type: "entity_died",
          entityId: targetId,
          wasPlayer: resolvedTarget.id === "player",
        },
        context,
      );
      this.pushEvent(`${resolvedTarget.name} died.`);
      return;
    }

    const hurtAction = this.resolveActionDefinition(resolvedTarget, "hurt");
    this.lockAnimationState(
      targetId,
      hurtAction.state,
      Math.min(this.resolveActionDuration(context, targetId, hurtAction), 0.45),
    );
    this.syncAction(context, targetId, hurtAction);
    this.pushEvent(`${resolvedTarget.name} took ${amount} damage.`);
  }

  findNearestHostile(
    world: ReturnType<ModuleContext["store"]["peekWorld"]>,
    source: ResolvedEntity,
    range: number,
    targetTags: string[] | undefined,
  ): ResolvedEntity | null {
    let best: ResolvedEntity | null = null;
    let bestDistance = range;

    for (const entity of world.entities) {
      if (entity.id === source.id) {
        continue;
      }
      const resolved = resolveEntity(world, entity);
      if (!this.isHostile(resolved) || this.isDead(resolved)) {
        continue;
      }
      if (targetTags && !targetTags.some((tag) => resolved.tags.includes(tag))) {
        continue;
      }

      const distance = this.distanceBetween(source, resolved);
      if (distance <= bestDistance) {
        best = resolved;
        bestDistance = distance;
      }
    }

    return best;
  }

  findNearestInteractive(
    world: ReturnType<ModuleContext["store"]["peekWorld"]>,
    source: ResolvedEntity,
  ): ResolvedEntity | null {
    let best: ResolvedEntity | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const entity of world.entities) {
      if (entity.id === source.id) {
        continue;
      }
      const resolved = resolveEntity(world, entity);
      const interaction = resolved.components.interaction;
      if (!interaction) {
        continue;
      }

      const distance = this.distanceBetween(source, resolved);
      if (distance <= interaction.radius && distance < bestDistance) {
        best = resolved;
        bestDistance = distance;
      }
    }

    return best;
  }

  protected updateStatus(
    context: ModuleContext,
    player: ResolvedEntity,
    overrideLine?: string,
  ): void {
    const inventory = player.components.inventory;
    const baseLines = [
      this.getControlLine(),
      `Player HP ${this.readHealth(player)} | Inventory ${inventory?.itemIds.length ?? 0}/${inventory?.maxSlots ?? 0}`,
      `Hostiles ${this.hostileActivityCounts.active} active | ${this.hostileActivityCounts.throttled} throttled | ${this.hostileActivityCounts.sleeping} sleeping`,
    ];
    if (player.components.health) {
      this.emitFeatureEvent(
        {
          type: "player_danger_changed",
          level: 1 - (player.components.health.current / Math.max(1, player.components.health.max)),
        },
        context,
      );
    }

    if (overrideLine) {
      this.statusLines = [...baseLines, overrideLine];
      return;
    }
    for (const feature of this.features) {
      const statusHint = feature.getStatusHint?.(context, this, player);
      if (statusHint) {
        this.statusLines = [...baseLines, statusHint];
        return;
      }
    }
    this.statusLines = [...baseLines, this.getIdlePrompt()];
  }

  protected updateDebugFindings(
    context: ModuleContext,
    player: ResolvedEntity,
  ): void {
    const world = context.store.peekWorld();
    const hostiles = world.entities
      .map((entity) => resolveEntity(world, entity))
      .filter((entity) => this.isHostile(entity));
    const deadHostiles = hostiles.filter((entity) => this.isDead(entity)).length;
    const emptyCrates = world.entities
      .map((entity) => resolveEntity(world, entity))
      .filter((entity) => entity.components.interaction?.kind === "loot")
      .filter((entity) => (entity.components.inventory?.itemIds.length ?? 0) === 0)
      .length;
    const stuckHostiles = [...this.motionSamples.entries()]
      .filter(([id, sample]) => id !== "player" && sample.stalledSeconds >= 2.5)
      .map(([id]) => id)
      .slice(0, 4);

    const findings = [
      `Player HP: ${this.readHealth(player)}`,
      `Dead hostiles: ${deadHostiles}`,
      `Empty loot crates: ${emptyCrates}`,
      `Hostile activity: ${this.hostileActivityCounts.active} active, ${this.hostileActivityCounts.throttled} throttled, ${this.hostileActivityCounts.sleeping} sleeping`,
    ];
    if (stuckHostiles.length > 0) {
      findings.push(`Potentially stuck hostiles: ${stuckHostiles.join(", ")}`);
    }
    this.debugFindings = findings;
  }

  protected syncAnimationState(
    context: ModuleContext,
    entityId: string,
    state: string,
    overrides: Partial<AnimationComponent> = {},
  ): void {
    const lock = this.animationLocks.get(entityId);
    if (lock && lock.state !== state) {
      return;
    }

    const world = context.store.peekWorld();
    const entity = world.entities.find((item) => item.id === entityId);
    if (!entity) {
      return;
    }

    const currentState = entity.components?.animation?.state;
    const nextAnimation: AnimationComponent = {
      ...entity.components?.animation,
      state,
      fadeSeconds: overrides.fadeSeconds ?? entity.components?.animation?.fadeSeconds ?? 0.15,
      speed: overrides.speed ?? entity.components?.animation?.speed,
      loop: overrides.loop ?? this.defaultLoopModeForState(state),
    };

    if (
      currentState === nextAnimation.state &&
      entity.components?.animation?.loop === nextAnimation.loop
    ) {
      return;
    }

    context.store.updateEntityComponents(entityId, { animation: nextAnimation });
    context.scene.updateEntityAnimation(entityId, nextAnimation);
  }

  protected tickCooldowns(dtSeconds: number): void {
    for (const [entityId, remaining] of this.cooldowns) {
      const next = remaining - dtSeconds;
      if (next <= 0) {
        this.cooldowns.delete(entityId);
      } else {
        this.cooldowns.set(entityId, next);
      }
    }
  }

  protected tickAnimationLocks(dtSeconds: number, context: ModuleContext): void {
    for (const [entityId, lock] of this.animationLocks) {
      if (!Number.isFinite(lock.remainingSeconds)) {
        continue;
      }

      lock.remainingSeconds -= dtSeconds;
      if (lock.remainingSeconds <= 0) {
        this.animationLocks.delete(entityId);
        const world = context.store.peekWorld();
        const entity = world.entities.find((item) => item.id === entityId);
        if (!entity) {
          continue;
        }
        const resolved = resolveEntity(world, entity);
        if (this.isDead(resolved)) {
          this.syncAction(context, entityId, this.resolveActionDefinition(resolved, "death"));
        }
      } else {
        this.animationLocks.set(entityId, lock);
      }
    }
  }

  protected recordHostileMotion(
    entityId: string,
    position: Vec3,
    chasing: boolean,
    dtSeconds: number,
  ): void {
    const previous = this.motionSamples.get(entityId);
    if (!previous || !chasing) {
      this.motionSamples.set(entityId, {
        position: { ...position },
        stalledSeconds: 0,
      });
      return;
    }

    const moved = Math.hypot(
      previous.position.x - position.x,
      previous.position.z - position.z,
    );
    this.motionSamples.set(entityId, {
      position: { ...position },
      stalledSeconds: moved < 0.03 ? previous.stalledSeconds + dtSeconds : 0,
    });
  }

  lockAnimationState(entityId: string, state: string, durationSeconds: number): void {
    this.animationLocks.set(entityId, {
      state,
      remainingSeconds: durationSeconds,
    });
  }

  cooldownReady(entityId: string): boolean {
    return !this.cooldowns.has(entityId);
  }

  protected consumeHostileUpdateDt(
    entityId: string,
    dtSeconds: number,
    intervalSeconds: number,
  ): number | null {
    if (intervalSeconds <= 0) {
      this.hostileUpdateAccumulatedDt.delete(entityId);
      return dtSeconds;
    }

    const accumulated = (this.hostileUpdateAccumulatedDt.get(entityId) ?? 0) + dtSeconds;
    if (accumulated < intervalSeconds) {
      this.hostileUpdateAccumulatedDt.set(entityId, accumulated);
      return null;
    }

    this.hostileUpdateAccumulatedDt.set(entityId, 0);
    return accumulated;
  }

  setCooldown(entityId: string, seconds: number): void {
    this.cooldowns.set(entityId, seconds);
  }

  pushEvent(message: string): void {
    const line = `${new Date().toLocaleTimeString()} | ${message}`;
    this.recentEvents.unshift(line);
    if (this.recentEvents.length > 24) {
      this.recentEvents.length = 24;
    }
  }

  resolveActionDuration(
    context: ModuleContext,
    entityId: string,
    action: ActionDefinition,
  ): number {
    const clipDuration = context.scene.getAnimationDuration(entityId, action.state);
    const speed = action.speed ?? 1;
    if (!clipDuration || clipDuration <= 0) {
      return action.fallbackSeconds ?? 0.6;
    }
    return Math.max(clipDuration / Math.max(speed, 0.01) + 0.06, 0.2);
  }

  resolveActionDefinition(entity: ResolvedEntity, actionId: string): ActionDefinition {
    return entity.components.actions?.[actionId] ?? {
      state: actionId,
      loop: this.defaultLoopModeForState(actionId),
      speed: 1,
      fadeSeconds: 0.08,
      fallbackSeconds: 0.6,
    };
  }

  syncAction(
    context: ModuleContext,
    entityId: string,
    action: ActionDefinition,
  ): void {
    this.syncAnimationState(context, entityId, action.state, {
      loop: action.loop,
      speed: action.speed,
      fadeSeconds: action.fadeSeconds,
    });
  }

  protected defaultLoopModeForState(state: string): AnimationLoopMode {
    if (state === "attack" || state === "death" || state === "hurt") {
      return "once";
    }
    return "repeat";
  }

  protected isHostile(entity: ResolvedEntity): boolean {
    if (entity.id === "player") {
      return false;
    }
    if (entity.tags.includes("enemy")) {
      return true;
    }
    const archetype = entity.components.brain?.archetype;
    return archetype === "zombie" || archetype === "turret";
  }

  protected isDead(entity: ResolvedEntity): boolean {
    return (entity.components.health?.current ?? 1) <= 0;
  }

  readHealth(entity: ResolvedEntity): string {
    const health = entity.components.health;
    if (!health) {
      return "n/a";
    }
    return `${health.current}/${health.max}`;
  }

  protected distanceBetween(left: ResolvedEntity, right: ResolvedEntity): number {
    return Math.hypot(
      left.transform.position.x - right.transform.position.x,
      left.transform.position.z - right.transform.position.z,
    );
  }

  protected mustFindEntity(context: ModuleContext, entityId: string): EntitySpec {
    const entity = context.store.peekWorld().entities.find((item) => item.id === entityId);
    if (!entity) {
      throw new Error(`Expected entity '${entityId}' to exist.`);
    }
    return entity;
  }

  resolveEntityById(context: ModuleContext, entityId: string): ResolvedEntity {
    return resolveEntity(context.store.peekWorld(), this.mustFindEntity(context, entityId));
  }

  protected resolveCameraRig(
    entityRig?: ResolvedEntity["components"]["cameraRig"],
  ): CameraRigComponent {
    return entityRig ?? this.preset.cameraRig;
  }

  getControlLine(): string {
    return this.preset.controlLine;
  }

  getIdlePrompt(): string {
    return this.preset.idlePrompt;
  }

  getAttackKey(): string {
    return this.preset.attackKey;
  }
}

export class ThirdPersonActionModule extends PresetActionModule {
  constructor() {
    super(THIRD_PERSON_ACTION_PRESET);
  }
}

export class PlatformerActionModule extends PresetActionModule {
  constructor() {
    super(PLATFORMER_ACTION_PRESET);
  }
}

function formatSeconds(seconds: number): string {
  if (!Number.isFinite(seconds)) {
    return "locked";
  }
  return `${seconds.toFixed(2)}s`;
}

class FeatureShortCircuitError extends Error {
  constructor() {
    super("feature-short-circuit");
  }
}
