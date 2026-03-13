import {
  ActionDefinition,
  AnimationComponent,
  AnimationLoopMode,
  CameraRigComponent,
  EntitySpec,
  InventoryComponent,
  ResolvedEntity,
  Vec3,
  resolveEntity,
} from "../core/schema";
import {
  ActionModulePreset,
  PLATFORMER_ACTION_PRESET,
  THIRD_PERSON_ACTION_PRESET,
} from "./actionModulePresets";
import { ModuleContext, RuntimeModule } from "./types";

interface AnimationLock {
  state: string;
  remainingSeconds: number;
}

interface MotionSample {
  position: Vec3;
  stalledSeconds: number;
}

type HostileActivityTier = "active" | "throttled" | "sleeping";

export class PresetActionModule implements RuntimeModule {
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

  constructor(protected readonly preset: ActionModulePreset) {
    this.id = preset.id;
  }

  update(dtSeconds: number, context: ModuleContext): void {
    this.beginFrame(dtSeconds, context);
    this.runFrame(dtSeconds, context);
  }

  protected beginFrame(dtSeconds: number, context: ModuleContext): void {
    this.tickCooldowns(dtSeconds);
    this.tickAnimationLocks(dtSeconds, context);
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
    if (!context.input.consumePress(this.getAttackKey()) || !this.cooldownReady(playerId)) {
      return;
    }

    const world = context.store.peekWorld();
    const player = world.entities.find((entity) => entity.id === playerId);
    if (!player) {
      return;
    }
    const resolvedPlayer = resolveEntity(world, player);
    const combat = resolvedPlayer.components.combat;
    if (!combat) {
      return;
    }

    const target = this.findNearestHostile(world, resolvedPlayer, combat.range, combat.targetTags);
    const attackAction = this.resolveActionDefinition(resolvedPlayer, "attack");
    const attackDuration = this.resolveActionDuration(context, playerId, attackAction);
    this.setCooldown(playerId, target ? combat.cooldownSeconds : combat.cooldownSeconds * 0.4);
    this.lockAnimationState(playerId, "attack", attackDuration);
    this.syncAction(context, playerId, attackAction);

    if (!target) {
      this.pushEvent("Player attack missed.");
      this.statusLines = [
        this.getControlLine(),
        `Player HP ${this.readHealth(resolvedPlayer)}`,
        "Attack missed. No hostile in range.",
      ];
      return;
    }

    this.applyDamage(context, target.id, combat.damage);
    this.pushEvent(`Player hit ${target.name} for ${combat.damage}.`);
  }

  protected tryPlayerInteraction(context: ModuleContext, playerId: string): void {
    if (!context.input.consumePress("KeyE")) {
      return;
    }

    const world = context.store.peekWorld();
    const player = world.entities.find((entity) => entity.id === playerId);
    if (!player) {
      return;
    }
    const resolvedPlayer = resolveEntity(world, player);
    const playerInventory = resolvedPlayer.components.inventory;
    if (!playerInventory) {
      return;
    }

    const interactive = this.findNearestInteractive(world, resolvedPlayer);
    if (!interactive || !interactive.components.interaction) {
      this.statusLines = [
        this.getControlLine(),
        `Player HP ${this.readHealth(resolvedPlayer)}`,
        "Nothing to interact with.",
      ];
      return;
    }

    if (interactive.components.interaction.kind !== "loot") {
      this.statusLines = [
        this.getControlLine(),
        `Player HP ${this.readHealth(resolvedPlayer)}`,
        interactive.components.interaction.prompt,
      ];
      return;
    }

    const containerInventory = interactive.components.inventory;
    if (!containerInventory || containerInventory.itemIds.length === 0) {
      this.statusLines = [
        this.getControlLine(),
        `Player HP ${this.readHealth(resolvedPlayer)}`,
        `${interactive.name} is empty.`,
      ];
      return;
    }
    if (playerInventory.itemIds.length >= playerInventory.maxSlots) {
      this.statusLines = [
        this.getControlLine(),
        `Player HP ${this.readHealth(resolvedPlayer)}`,
        "Inventory full.",
      ];
      return;
    }

    const [itemId, ...remainingItems] = containerInventory.itemIds;
    const nextPlayerInventory: InventoryComponent = {
      ...playerInventory,
      itemIds: [...playerInventory.itemIds, itemId],
    };
    const nextContainerInventory: InventoryComponent = {
      ...containerInventory,
      itemIds: remainingItems,
    };

    context.store.updateEntityComponents(playerId, { inventory: nextPlayerInventory });
    context.store.updateEntityComponents(interactive.id, { inventory: nextContainerInventory });
    context.scene.flashEntity(interactive.id, "#f4d35e", 0.22, 0.8);
    context.scene.flashEntity(playerId, "#7cc6fe", 0.16, 0.45);
    context.scene.spawnFloatingMarker(interactive.id, itemId, "loot");
    this.pushEvent(`Player looted ${itemId} from ${interactive.name}.`);
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

  protected applyDamage(
    context: ModuleContext,
    targetId: string,
    amount: number,
  ): void {
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
    context.scene.updateEntityHealth(targetId, nextCurrent, health.max);

    if (nextCurrent <= 0) {
      const deathAction = this.resolveActionDefinition(resolvedTarget, "death");
      this.lockAnimationState(targetId, deathAction.state, Number.POSITIVE_INFINITY);
      this.syncAction(context, targetId, deathAction);
      context.scene.flashEntity(
        targetId,
        resolvedTarget.id === "player" ? "#ff9c9c" : "#ffffff",
        0.32,
        1,
      );
      context.scene.spawnFloatingMarker(targetId, "DOWN", "down");
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
    context.scene.flashEntity(
      targetId,
      resolvedTarget.id === "player" ? "#ff8f8f" : "#ff4d4d",
      resolvedTarget.id === "player" ? 0.24 : 0.18,
      resolvedTarget.id === "player" ? 0.9 : 1,
    );
    context.scene.spawnFloatingMarker(
      targetId,
      `-${amount}`,
      resolvedTarget.id === "player" ? "danger" : "damage",
    );
    if (resolvedTarget.id === "player") {
      context.scene.setPlayerDangerLevel(1 - (nextCurrent / Math.max(1, health.max)));
    }
    this.pushEvent(`${resolvedTarget.name} took ${amount} damage.`);
  }

  protected findNearestHostile(
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

  protected findNearestInteractive(
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
    const interactive = this.findNearestInteractive(context.store.peekWorld(), player);
    const inventory = player.components.inventory;
    const baseLines = [
      this.getControlLine(),
      `Player HP ${this.readHealth(player)} | Inventory ${inventory?.itemIds.length ?? 0}/${inventory?.maxSlots ?? 0}`,
      `Hostiles ${this.hostileActivityCounts.active} active | ${this.hostileActivityCounts.throttled} throttled | ${this.hostileActivityCounts.sleeping} sleeping`,
    ];
    if (player.components.health) {
      context.scene.setPlayerDangerLevel(1 - (player.components.health.current / Math.max(1, player.components.health.max)));
    }

    if (overrideLine) {
      this.statusLines = [...baseLines, overrideLine];
      return;
    }
    if (interactive?.components.interaction) {
      this.statusLines = [...baseLines, interactive.components.interaction.prompt];
      return;
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

  protected lockAnimationState(entityId: string, state: string, durationSeconds: number): void {
    this.animationLocks.set(entityId, {
      state,
      remainingSeconds: durationSeconds,
    });
  }

  protected cooldownReady(entityId: string): boolean {
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

  protected setCooldown(entityId: string, seconds: number): void {
    this.cooldowns.set(entityId, seconds);
  }

  protected pushEvent(message: string): void {
    const line = `${new Date().toLocaleTimeString()} | ${message}`;
    this.recentEvents.unshift(line);
    if (this.recentEvents.length > 24) {
      this.recentEvents.length = 24;
    }
  }

  protected resolveActionDuration(
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

  protected resolveActionDefinition(entity: ResolvedEntity, actionId: string): ActionDefinition {
    return entity.components.actions?.[actionId] ?? {
      state: actionId,
      loop: this.defaultLoopModeForState(actionId),
      speed: 1,
      fadeSeconds: 0.08,
      fallbackSeconds: 0.6,
    };
  }

  protected syncAction(
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

  protected readHealth(entity: ResolvedEntity): string {
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

  protected resolveEntityById(context: ModuleContext, entityId: string): ResolvedEntity {
    return resolveEntity(context.store.peekWorld(), this.mustFindEntity(context, entityId));
  }

  protected resolveCameraRig(
    entityRig?: ResolvedEntity["components"]["cameraRig"],
  ): CameraRigComponent {
    return entityRig ?? this.preset.cameraRig;
  }

  protected getControlLine(): string {
    return this.preset.controlLine;
  }

  protected getIdlePrompt(): string {
    return this.preset.idlePrompt;
  }

  protected getAttackKey(): string {
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
