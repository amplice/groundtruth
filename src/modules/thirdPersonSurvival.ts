import {
  ResolvedEntity,
  resolveEntity,
  sectorCoordForPoint,
  sectorKeyForPoint,
} from "../core/schema";
import { THIRD_PERSON_SURVIVAL_PRESET } from "./actionModulePresets";
import { SectorPopulationFeature } from "./sectorPopulationFeature";
import { PresetActionModule } from "./thirdPersonAction";
import { ModuleContext } from "./types";

type ZombieActivityTier = "active" | "throttled" | "sleeping";

export class ThirdPersonSurvivalModule extends PresetActionModule {
  private sectorSummary = "No sector activity yet.";

  private readonly sectorPopulation: SectorPopulationFeature;

  constructor() {
    super(THIRD_PERSON_SURVIVAL_PRESET);
    this.sectorPopulation = this.requireFeature<SectorPopulationFeature>("sector_population");
  }

  protected override updateHostiles(
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
    const sectorSize = world.settings.sectorSize;
    const playerSector = sectorCoordForPoint(resolvedPlayer.transform.position, sectorSize);
    const occupiedZombieSectors = new Set<string>();
    const activeZombieSectors = new Set<string>();
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
        this.recordHostileMotion(entity.id, resolved.transform.position, false, dtSeconds);
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
      this.hostileActivityTiers.set(entity.id, activityTier);
      this.hostileActivityCounts[activityTier] += 1;
      if (activityTier === "active") {
        activeZombieSectors.add(sectorKeyForPoint(entity.transform.position, sectorSize));
      }
      const attackRange = combat?.range ?? 0;
      const updateDt = this.consumeHostileUpdateDt(
        entity.id,
        dtSeconds,
        activityTier === "throttled" ? brain.farThinkIntervalSeconds ?? 0.35 : 0,
      );

      if (activityTier === "sleeping") {
        this.syncAnimationState(context, entity.id, "idle");
        this.recordHostileMotion(entity.id, resolved.transform.position, false, dtSeconds);
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
        this.recordHostileMotion(entity.id, resolved.transform.position, false, updateDt);
        continue;
      }

      const chasing = distance > attackRange && distance <= aggroRadius;
      if (!chasing || (lockedAction?.lockMovement ?? false)) {
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

    this.sectorSummary = `Player sector ${playerSector.x}:${playerSector.z} | zombie sectors ${activeZombieSectors.size} active / ${occupiedZombieSectors.size} occupied`;
  }

  protected override updateStatus(
    context: ModuleContext,
    player: ResolvedEntity,
    overrideLine?: string,
  ): void {
    const populationStats = this.sectorPopulation.getStats();
    const interactive = this.findNearestInteractive(context.store.peekWorld(), player);
    const inventory = player.components.inventory;
    const baseLines = [
      this.getControlLine(),
      `Player HP ${this.readHealth(player)} | Inventory ${inventory?.itemIds.length ?? 0}/${inventory?.maxSlots ?? 0}`,
      `Zombies ${this.hostileActivityCounts.active} active | ${this.hostileActivityCounts.throttled} throttled | ${this.hostileActivityCounts.sleeping} sleeping`,
      `${this.sectorSummary} | Dormant ${populationStats.dormantCount} | Pooled ${populationStats.pooledCount} | Growing ${populationStats.growingSectorCount} | Cooling ${populationStats.shrinkingSectorCount}`,
    ];
    if (player.components.health) {
      context.scene.setPlayerDangerLevel(
        1 - (player.components.health.current / Math.max(1, player.components.health.max)),
      );
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

  protected override updateDebugFindings(
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
      `Zombie activity: ${this.hostileActivityCounts.active} active, ${this.hostileActivityCounts.throttled} throttled, ${this.hostileActivityCounts.sleeping} sleeping`,
      `${this.sectorSummary} | Dormant ${populationStats.dormantCount} | Pooled ${populationStats.pooledCount} | Growing ${populationStats.growingSectorCount} | Cooling ${populationStats.shrinkingSectorCount}`,
    ];

    if (stuckZombies.length > 0) {
      findings.push(`Potentially stuck zombies: ${stuckZombies.join(", ")}`);
    }

    this.debugFindings = findings;
  }

  protected override isHostile(entity: ResolvedEntity): boolean {
    return entity.components.brain?.archetype === "zombie" || super.isHostile(entity);
  }
}
