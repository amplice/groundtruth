import { ResolvedEntity, resolveEntity } from "../core/schema";
import { THIRD_PERSON_SURVIVAL_PRESET } from "./actionModulePresets";
import { HostileAIFeature } from "./hostileAIFeature";
import { SectorPopulationFeature } from "./sectorPopulationFeature";
import { PresetActionModule } from "./thirdPersonAction";
import { ModuleContext } from "./types";

export class ThirdPersonSurvivalModule extends PresetActionModule {
  private sectorPopulation: SectorPopulationFeature | null = null;

  private hostileAI: HostileAIFeature | null = null;

  constructor() {
    super(THIRD_PERSON_SURVIVAL_PRESET);
  }

  override onWorldRebuilt(world: ReturnType<ModuleContext["store"]["peekWorld"]>, context: ModuleContext): void {
    super.onWorldRebuilt(world, context);
    this.sectorPopulation = this.requireFeature<SectorPopulationFeature>("sector_population");
    this.hostileAI = this.requireFeature<HostileAIFeature>("hostile_ai");
  }

  protected override updateStatus(
    context: ModuleContext,
    player: ResolvedEntity,
    overrideLine?: string,
  ): void {
    const populationStats = this.sectorPopulation?.getStats();
    const hostileStats = this.hostileAI?.getStats();
    const inventory = player.components.inventory;
    const baseLines = [
      this.getControlLine(),
      `Player HP ${this.readHealth(player)} | Inventory ${inventory?.itemIds.length ?? 0}/${inventory?.maxSlots ?? 0}`,
      `Zombies ${this.hostileActivityCounts.active} active | ${this.hostileActivityCounts.throttled} throttled | ${this.hostileActivityCounts.sleeping} sleeping`,
      hostileStats && populationStats
        ? `${hostileStats.summary} | Dormant ${populationStats.dormantCount} | Pooled ${populationStats.pooledCount} | Growing ${populationStats.growingSectorCount} | Cooling ${populationStats.shrinkingSectorCount}`
        : "Waiting for survival features to initialize.",
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

  protected override updateDebugFindings(
    context: ModuleContext,
    player: ResolvedEntity,
  ): void {
    const populationStats = this.sectorPopulation?.getStats();
    const hostileStats = this.hostileAI?.getStats();
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
      hostileStats && populationStats
        ? `${hostileStats.summary} | Dormant ${populationStats.dormantCount} | Pooled ${populationStats.pooledCount} | Growing ${populationStats.growingSectorCount} | Cooling ${populationStats.shrinkingSectorCount}`
        : "Survival features not initialized yet.",
    ];

    if (stuckZombies.length > 0) {
      findings.push(`Potentially stuck zombies: ${stuckZombies.join(", ")}`);
    }

    this.debugFindings = findings;
  }
}
