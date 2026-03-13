import {
  ActionDefinition,
  AnimationComponent,
  AnimationLoopMode,
  EntitySpec,
  InventoryComponent,
  ResolvedEntity,
  Vec3,
  resolveEntity,
  sectorCoordForPoint,
  sectorKeyForPoint,
} from "../core/schema";
import { SectorPopulationManager } from "../runtime/sectorPopulationManager";
import { ModuleContext, RuntimeModule, RuntimeSectorOverlay } from "./types";

interface AnimationLock {
  state: string;
  remainingSeconds: number;
}

interface MotionSample {
  position: Vec3;
  stalledSeconds: number;
}

type ZombieActivityTier = "active" | "throttled" | "sleeping";

export class ThirdPersonSurvivalModule implements RuntimeModule {
  readonly id = "third_person_survival";

  private readonly cooldowns = new Map<string, number>();

  private readonly animationLocks = new Map<string, AnimationLock>();

  private readonly motionSamples = new Map<string, MotionSample>();

  private readonly zombieUpdateAccumulatedDt = new Map<string, number>();

  private readonly zombieActivityTiers = new Map<string, ZombieActivityTier>();

  private recentEvents: string[] = [];

  private statusLines = [
    "WASD move | Shift sprint | Space attack | E loot",
  ];

  private debugFindings = ["No runtime findings."];

  private zombieActivityCounts = {
    active: 0,
    throttled: 0,
    sleeping: 0,
  };

  private sectorSummary = "No sector activity yet.";

  private readonly sectorPopulation = new SectorPopulationManager();

  update(dtSeconds: number, context: ModuleContext): void {
    this.tickCooldowns(dtSeconds);
    this.tickAnimationLocks(dtSeconds, context);

    let world = context.store.peekWorld();
    const player = world.entities.find((entity) => entity.id === "player");
    if (!player) {
      this.statusLines = ["No player entity in world."];
      this.debugFindings = ["No player entity in world."];
      return;
    }

    const resolvedPlayer = resolveEntity(world, player);
    if (this.sectorPopulation.reconcile(context.store, world, resolvedPlayer.transform.position, dtSeconds)) {
      const populationStats = this.sectorPopulation.getStats();
      this.pushEvent(
        `Sector population swap: +${populationStats.lastActivated} activated, -${populationStats.lastParked} parked.`,
      );
      this.statusLines = [
        "WASD move | Shift sprint | Space attack | E loot",
        `Sector swap in progress | Dormant ${populationStats.dormantCount} | Pooled ${populationStats.pooledCount} | Growing ${populationStats.growingSectorCount} | Cooling ${populationStats.shrinkingSectorCount}`,
      ];
      this.debugFindings = [
        `Sector population rebalance at ${populationStats.centerSector}.`,
        `Activated ${populationStats.lastActivated}, parked ${populationStats.lastParked}, pooled ${populationStats.pooledCount}, tracked ${populationStats.trackedSectorCount}.`,
      ];
      return;
    }
    world = context.store.peekWorld();
    const livePlayer = world.entities.find((entity) => entity.id === "player");
    if (!livePlayer) {
      this.statusLines = ["No player entity in world."];
      this.debugFindings = ["No player entity in world."];
      return;
    }
    const liveResolvedPlayer = resolveEntity(world, livePlayer);
    const character = liveResolvedPlayer.components.character;
    if (!character) {
      this.statusLines = ["Player entity has no character component."];
      this.debugFindings = ["Player entity has no character component."];
      return;
    }

    if (this.isDead(liveResolvedPlayer)) {
      const deathAction = this.resolveActionDefinition(liveResolvedPlayer, "death");
      this.lockAnimationState("player", deathAction.state, Number.POSITIVE_INFINITY);
      this.syncAction(context, "player", deathAction);
      this.updateZombies(dtSeconds, context, context.store.peekWorld(), livePlayer.id);
      this.updateStatus(context, liveResolvedPlayer, "You are dead. Generate or reset the world to continue.");
      this.updateDebugFindings(context, liveResolvedPlayer);
      return;
    }

    this.updatePlayerMovement(
      dtSeconds,
      context,
      livePlayer.id,
      character.moveSpeed,
      character.sprintSpeed,
      liveResolvedPlayer.components.cameraRig,
    );
    this.tryPlayerAttack(context, livePlayer.id);
    this.tryPlayerInteraction(context, livePlayer.id);
    this.updateZombies(dtSeconds, context, context.store.peekWorld(), livePlayer.id);
    this.updateStatus(context, resolveEntity(context.store.peekWorld(), this.mustFindEntity(context, "player")));
    this.updateDebugFindings(context, resolveEntity(context.store.peekWorld(), this.mustFindEntity(context, "player")));
  }

  getStatusLines(): string[] {
    return [...this.statusLines];
  }

  getDebugFindings(): string[] {
    return [...this.debugFindings];
  }

  getWorldDebug(_world: ReturnType<ModuleContext["store"]["peekWorld"]>): string[] {
    return this.sectorPopulation.getDebugLines();
  }

  getSectorOverlay(): RuntimeSectorOverlay | null {
    return this.sectorPopulation.getOverlayData();
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

    if (resolved.components.brain?.archetype === "zombie") {
      const motion = this.motionSamples.get(entityId);
      lines.push(`Activity: ${this.zombieActivityTiers.get(entityId) ?? "unknown"}`);
      lines.push(`Stall timer: ${motion ? formatSeconds(motion.stalledSeconds) : "0.00s"}`);
    }

    return lines;
  }

  getRecentEvents(): string[] {
    return [...this.recentEvents];
  }

  private updatePlayerMovement(
    dtSeconds: number,
    context: ModuleContext,
    playerId: string,
    moveSpeed: number,
    sprintSpeed: number | undefined,
    cameraRig: ResolvedEntity["components"]["cameraRig"],
  ): void {
    const axes = context.input.movementAxes();
    const length = Math.hypot(axes.x, axes.z);
    const world = context.store.peekWorld();
    const resolvedPlayer = resolveEntity(world, this.mustFindEntity(context, playerId));
    const currentLock = this.animationLocks.get(playerId);
    const lockedAction = currentLock
      ? this.resolveActionDefinition(resolvedPlayer, currentLock.state)
      : null;
    if (length <= 0.001 || (lockedAction?.lockMovement ?? false)) {
      this.syncAnimationState(context, playerId, "idle");
      context.scene.updateFollowCamera(playerId, cameraRig);
      return;
    }

    const speed = axes.sprint
      ? sprintSpeed ?? moveSpeed * 1.5
      : moveSpeed;
    const basis = context.scene.getMovementBasis();
    const dirX =
      (basis.right.x * axes.x + basis.forward.x * axes.z) / length;
    const dirZ =
      (basis.right.z * axes.x + basis.forward.z * axes.z) / length;
    const desiredDelta = {
      x: dirX * speed * dtSeconds,
      y: 0,
      z: dirZ * speed * dtSeconds,
    };
    const movement = context.physics.moveCharacter(playerId, desiredDelta);
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
    context.scene.updateFollowCamera(playerId, cameraRig);
  }

  private tryPlayerAttack(context: ModuleContext, playerId: string): void {
    if (!context.input.consumePress("Space")) {
      return;
    }
    if (!this.cooldownReady(playerId)) {
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

    const target = this.findNearestTarget(world, resolvedPlayer, combat.range, combat.targetTags);
    const attackAction = this.resolveActionDefinition(resolvedPlayer, "attack");
    const attackDuration = this.resolveActionDuration(context, playerId, attackAction);
    this.setCooldown(playerId, target ? combat.cooldownSeconds : combat.cooldownSeconds * 0.4);
    this.lockAnimationState(playerId, "attack", attackDuration);
    this.syncAction(context, playerId, attackAction);

    if (!target) {
      this.pushEvent("Player attack missed.");
      this.statusLines = [
        "WASD move | Shift sprint | Space attack | E loot",
        `Player HP ${this.readHealth(resolvedPlayer)}`,
        "Attack missed. No target in range.",
      ];
      return;
    }

    this.applyDamage(context, target.id, combat.damage);
    this.pushEvent(`Player hit ${target.name} for ${combat.damage}.`);
    this.statusLines = [
      "WASD move | Shift sprint | Space attack | E loot",
      `Player HP ${this.readHealth(resolvedPlayer)}`,
      `Hit ${target.name} for ${combat.damage}.`,
    ];
  }

  private tryPlayerInteraction(context: ModuleContext, playerId: string): void {
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
        "WASD move | Shift sprint | Space attack | E loot",
        `Player HP ${this.readHealth(resolvedPlayer)}`,
        "Nothing to interact with.",
      ];
      return;
    }

    if (interactive.components.interaction.kind !== "loot") {
      return;
    }
    const containerInventory = interactive.components.inventory;
    if (!containerInventory || containerInventory.itemIds.length === 0) {
      this.statusLines = [
        "WASD move | Shift sprint | Space attack | E loot",
        `Player HP ${this.readHealth(resolvedPlayer)}`,
        `${interactive.name} is empty.`,
      ];
      return;
    }
    if (playerInventory.itemIds.length >= playerInventory.maxSlots) {
      this.statusLines = [
        "WASD move | Shift sprint | Space attack | E loot",
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
    this.statusLines = [
      "WASD move | Shift sprint | Space attack | E loot",
      `Player HP ${this.readHealth(resolveEntity(context.store.peekWorld(), this.mustFindEntity(context, playerId)))}`,
      `Looted ${itemId} from ${interactive.name}.`,
    ];
  }

  private updateZombies(
    dtSeconds: number,
    context: ModuleContext,
    world: ReturnType<ModuleContext["store"]["peekWorld"]>,
    playerId: string,
  ): void {
    const player = world.entities.find((entity) => entity.id === playerId);
    if (!player) {
      return;
    }
    const resolvedPlayer = resolveEntity(world, player);
    const sectorSize = world.settings.sectorSize;
    const playerSector = sectorCoordForPoint(resolvedPlayer.transform.position, sectorSize);
    const occupiedZombieSectors = new Set<string>();
    const activeZombieSectors = new Set<string>();
    this.zombieActivityCounts = {
      active: 0,
      throttled: 0,
      sleeping: 0,
    };

    for (const entity of world.entities) {
      if (entity.id === playerId) {
        continue;
      }

      const resolved = resolveEntity(world, entity);
      const brain = resolved.components.brain;
      if (brain?.archetype !== "zombie") {
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
        this.recordZombieMotion(entity.id, resolved.transform.position, false, dtSeconds);
        continue;
      }

      const physics = resolved.components.physics;
      if (!physics || physics.body !== "kinematic") {
        continue;
      }

      const speed = resolved.components.character?.moveSpeed ?? 2;
      const combat = resolved.components.combat;
      const currentLock = this.animationLocks.get(entity.id);
      const lockedAction = currentLock
        ? this.resolveActionDefinition(resolved, currentLock.state)
        : null;
      const deltaX = player.transform.position.x - entity.transform.position.x;
      const deltaZ = player.transform.position.z - entity.transform.position.z;
      const distance = Math.hypot(deltaX, deltaZ);
      const zombieSector = sectorCoordForPoint(entity.transform.position, sectorSize);
      const sectorDistance = Math.max(
        Math.abs(zombieSector.x - playerSector.x),
        Math.abs(zombieSector.z - playerSector.z),
      );
      occupiedZombieSectors.add(sectorKeyForPoint(entity.transform.position, sectorSize));
      const aggroRadius = brain.aggroRadius ?? 0;
      const activityRadius = brain.activityRadius ?? Math.max(aggroRadius + 4, 18);
      const sleepRadius = brain.sleepRadius ?? Math.max(activityRadius + 24, 42);
      const activityTier: ZombieActivityTier =
        distance <= activityRadius || sectorDistance <= 1
          ? "active"
          : distance <= sleepRadius || sectorDistance <= 2
            ? "throttled"
            : "sleeping";
      this.zombieActivityTiers.set(entity.id, activityTier);
      this.zombieActivityCounts[activityTier] += 1;
      if (activityTier === "active") {
        activeZombieSectors.add(sectorKeyForPoint(entity.transform.position, sectorSize));
      }
      const attackRange = combat?.range ?? 0;
      const updateDt = this.consumeZombieUpdateDt(
        entity.id,
        dtSeconds,
        activityTier === "throttled" ? brain.farThinkIntervalSeconds ?? 0.35 : 0,
      );

      if (activityTier === "sleeping") {
        this.syncAnimationState(context, entity.id, "idle");
        this.recordZombieMotion(entity.id, resolved.transform.position, false, dtSeconds);
        continue;
      }

      if (updateDt === null) {
        continue;
      }

      if (combat && distance <= attackRange && this.cooldownReady(entity.id)) {
        const attackAction = this.resolveActionDefinition(resolved, "attack");
        const attackDuration = this.resolveActionDuration(context, entity.id, attackAction);
        this.applyDamage(context, playerId, combat.damage);
        this.setCooldown(entity.id, combat.cooldownSeconds);
        this.lockAnimationState(entity.id, "attack", attackDuration);
        this.syncAction(context, entity.id, attackAction);
        this.pushEvent(`${resolved.name} hit player for ${combat.damage}.`);
        this.recordZombieMotion(entity.id, resolved.transform.position, false, updateDt);
        continue;
      }

      const chasing = distance > attackRange && distance <= aggroRadius;
      if (!chasing || (lockedAction?.lockMovement ?? false)) {
        this.syncAnimationState(context, entity.id, "idle");
        this.recordZombieMotion(entity.id, resolved.transform.position, false, updateDt);
        continue;
      }

      const dirX = deltaX / distance;
      const dirZ = deltaZ / distance;
      const movement = context.physics.moveCharacter(entity.id, {
        x: dirX * speed * updateDt,
        y: 0,
        z: dirZ * speed * updateDt,
      });
      if (!movement) {
        this.recordZombieMotion(entity.id, resolved.transform.position, true, updateDt);
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
      this.recordZombieMotion(entity.id, movement.position, true, updateDt);
    }
    this.sectorSummary = `Player sector ${playerSector.x}:${playerSector.z} | zombie sectors ${activeZombieSectors.size} active / ${occupiedZombieSectors.size} occupied`;
  }

  private applyDamage(
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

  private findNearestTarget(
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
      if (this.isDead(resolved)) {
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

  private findNearestInteractive(
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

  private updateStatus(
    context: ModuleContext,
    player: ResolvedEntity,
    overrideLine?: string,
  ): void {
    const populationStats = this.sectorPopulation.getStats();
    const interactive = this.findNearestInteractive(context.store.peekWorld(), player);
    const inventory = player.components.inventory;
    const baseLines = [
      "WASD move | Shift sprint | Space attack | E loot",
      `Player HP ${this.readHealth(player)} | Inventory ${inventory?.itemIds.length ?? 0}/${inventory?.maxSlots ?? 0}`,
      `Zombies ${this.zombieActivityCounts.active} active | ${this.zombieActivityCounts.throttled} throttled | ${this.zombieActivityCounts.sleeping} sleeping`,
      `${this.sectorSummary} | Dormant ${populationStats.dormantCount} | Pooled ${populationStats.pooledCount} | Growing ${populationStats.growingSectorCount} | Cooling ${populationStats.shrinkingSectorCount}`,
    ];
    if (player.components.health) {
      context.scene.setPlayerDangerLevel(1 - (player.components.health.current / Math.max(1, player.components.health.max)));
    }

    if (overrideLine) {
      this.statusLines = [...baseLines, overrideLine];
      return;
    }

    if (interactive?.components.interaction) {
      this.statusLines = [
        ...baseLines,
        interactive.components.interaction.prompt,
      ];
      return;
    }

    this.statusLines = [...baseLines, "Explore the generated world or load the authored slice."];
  }

  private updateDebugFindings(
    context: ModuleContext,
    player: ResolvedEntity,
  ): void {
    const populationStats = this.sectorPopulation.getStats();
    const world = context.store.peekWorld();
    const deadZombies = world.entities
      .map((entity) => resolveEntity(world, entity))
      .filter((entity) => entity.components.brain?.archetype === "zombie" && this.isDead(entity))
      .length;
    const emptyCrates = world.entities
      .map((entity) => resolveEntity(world, entity))
      .filter((entity) => entity.components.interaction?.kind === "loot")
      .filter((entity) => (entity.components.inventory?.itemIds.length ?? 0) === 0)
      .length;
    const stuckZombies = [...this.motionSamples.entries()]
      .filter(([id, sample]) => id.startsWith("zombie.") && sample.stalledSeconds >= 2.5)
      .map(([id]) => id)
      .slice(0, 4);

    const findings = [
      `Player HP: ${this.readHealth(player)}`,
      `Dead zombies: ${deadZombies}`,
      `Empty loot crates: ${emptyCrates}`,
      `Zombie activity: ${this.zombieActivityCounts.active} active, ${this.zombieActivityCounts.throttled} throttled, ${this.zombieActivityCounts.sleeping} sleeping`,
      `${this.sectorSummary} | Dormant ${populationStats.dormantCount} | Pooled ${populationStats.pooledCount} | Growing ${populationStats.growingSectorCount} | Cooling ${populationStats.shrinkingSectorCount}`,
    ];

    if (stuckZombies.length > 0) {
      findings.push(`Potentially stuck zombies: ${stuckZombies.join(", ")}`);
    }

    this.debugFindings = findings;
  }

  private syncAnimationState(
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

  private tickCooldowns(dtSeconds: number): void {
    for (const [entityId, remaining] of this.cooldowns) {
      const next = remaining - dtSeconds;
      if (next <= 0) {
        this.cooldowns.delete(entityId);
      } else {
        this.cooldowns.set(entityId, next);
      }
    }
  }

  private tickAnimationLocks(dtSeconds: number, context: ModuleContext): void {
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

  private recordZombieMotion(
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

  private lockAnimationState(
    entityId: string,
    state: string,
    durationSeconds: number,
  ): void {
    this.animationLocks.set(entityId, {
      state,
      remainingSeconds: durationSeconds,
    });
  }

  private cooldownReady(entityId: string): boolean {
    return !this.cooldowns.has(entityId);
  }

  private consumeZombieUpdateDt(
    entityId: string,
    dtSeconds: number,
    intervalSeconds: number,
  ): number | null {
    if (intervalSeconds <= 0) {
      this.zombieUpdateAccumulatedDt.delete(entityId);
      return dtSeconds;
    }

    const accumulated = (this.zombieUpdateAccumulatedDt.get(entityId) ?? 0) + dtSeconds;
    if (accumulated < intervalSeconds) {
      this.zombieUpdateAccumulatedDt.set(entityId, accumulated);
      return null;
    }

    this.zombieUpdateAccumulatedDt.set(entityId, 0);
    return accumulated;
  }

  private setCooldown(entityId: string, seconds: number): void {
    this.cooldowns.set(entityId, seconds);
  }

  private pushEvent(message: string): void {
    const line = `${new Date().toLocaleTimeString()} | ${message}`;
    this.recentEvents.unshift(line);
    if (this.recentEvents.length > 24) {
      this.recentEvents.length = 24;
    }
  }

  private resolveActionDuration(
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

  private resolveActionDefinition(
    entity: ResolvedEntity,
    actionId: string,
  ): ActionDefinition {
    return entity.components.actions?.[actionId] ?? {
      state: actionId,
      loop: this.defaultLoopModeForState(actionId),
      speed: 1,
      fadeSeconds: 0.08,
      fallbackSeconds: 0.6,
    };
  }

  private syncAction(
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

  private defaultLoopModeForState(state: string): AnimationLoopMode {
    if (state === "attack" || state === "death" || state === "hurt") {
      return "once";
    }
    return "repeat";
  }

  private isDead(entity: ResolvedEntity): boolean {
    return (entity.components.health?.current ?? 1) <= 0;
  }

  private readHealth(entity: ResolvedEntity): string {
    const health = entity.components.health;
    if (!health) {
      return "n/a";
    }
    return `${health.current}/${health.max}`;
  }

  private distanceBetween(left: ResolvedEntity, right: ResolvedEntity): number {
    return Math.hypot(
      left.transform.position.x - right.transform.position.x,
      left.transform.position.z - right.transform.position.z,
    );
  }

  private mustFindEntity(context: ModuleContext, entityId: string): EntitySpec {
    const entity = context.store.peekWorld().entities.find((item) => item.id === entityId);
    if (!entity) {
      throw new Error(`Expected entity '${entityId}' to exist.`);
    }
    return entity;
  }
}

function formatSeconds(seconds: number): string {
  if (!Number.isFinite(seconds)) {
    return "locked";
  }
  return `${seconds.toFixed(2)}s`;
}
