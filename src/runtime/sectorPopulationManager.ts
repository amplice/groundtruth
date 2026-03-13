import { WorldCommand } from "../core/commands";
import {
  EntityComponents,
  EntitySpec,
  SectorLifecycleState,
  SectorPoolSnapshot,
  SectorStateSnapshot,
  ZoneSpec,
  WorldDocument,
  sectorCoordForPoint,
  sectorKeyForPoint,
} from "../core/schema";
import { WorldStore } from "../core/worldStore";
import { RuntimeSectorOverlay } from "../modules/types";

export interface SectorPopulationStats {
  centerSector: string;
  residentSectorCount: number;
  dormantCount: number;
  pooledCount: number;
  trackedSectorCount: number;
  growingSectorCount: number;
  shrinkingSectorCount: number;
  lastParked: number;
  lastActivated: number;
}

interface SectorSpawnPool {
  sectorKey: string;
  prefabId: string;
  count: number;
  homeZoneId?: string;
  groundY: number;
}

interface SectorDebugRecord {
  sectorKey: string;
  status: SectorLifecycleState;
  trend: SectorStateSnapshot["trend"];
  live: number;
  pooled: number;
  dormant: number;
  recentSeconds: number;
  offlineSeconds: number;
  pressure: number;
  depletion: number;
}

export class SectorPopulationManager {
  private static readonly ACTIVATION_BUDGET_PER_SECTOR = 8;

  private static readonly RESIDENT_TARGET_PER_SECTOR = 6;

  private static readonly RESIDENT_TOP_UP_PER_SECTOR = 3;

  private static readonly RESIDENT_TOP_UP_INTERVAL_SECONDS = 1.2;

  private static readonly RECENT_STATE_SECONDS = 8;

  private static readonly OFFLINE_SIMULATION_INTERVAL_SECONDS = 4;

  private static readonly OFFLINE_TARGET_WITH_HOME_ZONE = 10;

  private static readonly OFFLINE_TARGET_WITHOUT_HOME_ZONE = 4;

  private static readonly PRESSURE_DECAY_PER_SECOND = 0.04;

  private static readonly DEPLETION_DECAY_PER_SECOND = 0.025;

  private readonly dormantEntities = new Map<string, EntitySpec>();

  private readonly sectorPools = new Map<string, SectorSpawnPool>();

  private readonly sectorStates = new Map<string, SectorStateSnapshot>();

  private trackedRevision: number | null = null;

  private expectedRevision: number | null = null;

  private residentSignature = "";

  private residentSectorKeys: string[] = [];

  private spawnCounter = 1;

  private currentSectorSize = 1;

  private residentTopUpElapsedSeconds = 0;

  private stats: SectorPopulationStats = {
    centerSector: "n/a",
    residentSectorCount: 0,
    dormantCount: 0,
    pooledCount: 0,
    trackedSectorCount: 0,
    growingSectorCount: 0,
    shrinkingSectorCount: 0,
    lastParked: 0,
    lastActivated: 0,
  };

  reconcile(
    store: WorldStore,
    world: WorldDocument,
    center: { x: number; y: number; z: number },
    dtSeconds: number,
    sectorRadius = 2,
  ): boolean {
    this.syncRevision(store.getWorldRevision(), world);
    this.residentTopUpElapsedSeconds += dtSeconds;
    const decayedStateChanged = this.decaySectorStates(dtSeconds);

    const sectorSize = world.settings.sectorSize;
    this.currentSectorSize = sectorSize;
    const centerCoord = sectorCoordForPoint(center, sectorSize);
    const residentKeys = new Set<string>();
    for (let dz = -sectorRadius; dz <= sectorRadius; dz += 1) {
      for (let dx = -sectorRadius; dx <= sectorRadius; dx += 1) {
        residentKeys.add(`${centerCoord.x + dx}:${centerCoord.z + dz}`);
      }
    }
    const signature = [...residentKeys].sort().join("|");
    const signatureChanged = signature !== this.residentSignature;
    this.residentSectorKeys = [...residentKeys].sort();
    this.stats.centerSector = `${centerCoord.x}:${centerCoord.z}`;
    this.stats.residentSectorCount = residentKeys.size;
    const offlineSimulationChanged = this.simulateFarSectors(residentKeys, dtSeconds);

    if (!signatureChanged && this.residentTopUpElapsedSeconds < SectorPopulationManager.RESIDENT_TOP_UP_INTERVAL_SECONDS) {
      this.stats.lastActivated = 0;
      this.stats.lastParked = 0;
      this.stats.dormantCount = this.dormantEntities.size;
      this.stats.pooledCount = this.getPooledCount();
      this.refreshAggregateStats();
      if (decayedStateChanged || offlineSimulationChanged) {
        store.updateSimulation({
          sectorPools: this.serializePools(),
          sectorStates: this.serializeSectorStates(),
        });
      }
      return false;
    }

    if (signatureChanged) {
      this.residentSignature = signature;
      this.residentTopUpElapsedSeconds = 0;
    } else {
      this.residentTopUpElapsedSeconds = 0;
    }

    const commands: WorldCommand[] = [];
    let parked = 0;
    let activated = 0;
    let poolsChanged = false;
    let sectorStateChanged = false;
    const liveResidentCounts = this.countManagedResidentEntities(world, residentKeys, sectorSize);

    if (signatureChanged) {
      for (const entity of world.entities) {
        if (!this.isManagedEntity(world, entity)) {
          continue;
        }
        const sectorKey = sectorKeyForPoint(entity.transform.position, sectorSize);
        if (residentKeys.has(sectorKey)) {
          this.dormantEntities.delete(entity.id);
          continue;
        }
        if (this.canPoolEntity(world, entity)) {
          this.addEntityToPool(world, entity, sectorKey);
          poolsChanged = true;
        } else {
          this.dormantEntities.set(entity.id, cloneEntity(entity));
        }
        commands.push({ op: "delete_entity", entityId: entity.id });
        parked += 1;
      }

      for (const [entityId, entity] of [...this.dormantEntities.entries()]) {
        const sectorKey = sectorKeyForPoint(entity.transform.position, sectorSize);
        if (!residentKeys.has(sectorKey)) {
          continue;
        }
        commands.push({ op: "spawn_entity", entity: cloneEntity(entity) });
        this.dormantEntities.delete(entityId);
        activated += 1;
        liveResidentCounts.set(sectorKey, (liveResidentCounts.get(sectorKey) ?? 0) + 1);
      }

      const burstActivations = this.activateResidentPools(
        world,
        residentKeys,
        liveResidentCounts,
        SectorPopulationManager.ACTIVATION_BUDGET_PER_SECTOR,
        commands,
      );
      activated += burstActivations;
      poolsChanged = poolsChanged || burstActivations > 0;
    } else {
      const topUpActivations = this.activateResidentPools(
        world,
        residentKeys,
        liveResidentCounts,
        SectorPopulationManager.RESIDENT_TOP_UP_PER_SECTOR,
        commands,
      );
      activated += topUpActivations;
      poolsChanged = topUpActivations > 0;
    }

    this.stats.lastActivated = activated;
    this.stats.lastParked = parked;
    this.stats.dormantCount = this.dormantEntities.size;
    this.stats.pooledCount = this.getPooledCount();
    this.refreshAggregateStats();

    sectorStateChanged = this.refreshSectorStates(residentKeys, liveResidentCounts) || sectorStateChanged;

    if (poolsChanged || sectorStateChanged || offlineSimulationChanged) {
      store.updateSimulation({
        sectorPools: this.serializePools(),
        sectorStates: this.serializeSectorStates(),
      });
    }

    if (commands.length === 0) {
      return false;
    }

    this.expectedRevision = store.getWorldRevision() + 1;
    store.apply(commands);
    this.trackedRevision = this.expectedRevision;
    this.expectedRevision = null;
    return true;
  }

  getStats(): SectorPopulationStats {
    return { ...this.stats };
  }

  getDebugLines(limit = 6): string[] {
    const sectorRecords = this.buildSectorRecords()
      .sort((left, right) => (right.live + right.pooled + right.dormant) - (left.live + left.pooled + left.dormant))
      .slice(0, limit);

    const lines = [
      `Center sector: ${this.stats.centerSector}`,
      `Resident sectors: ${this.stats.residentSectorCount}`,
      `Dormant exact: ${this.stats.dormantCount}`,
      `Pooled far-field: ${this.stats.pooledCount}`,
      `Last swap: +${this.stats.lastActivated} activated / -${this.stats.lastParked} parked`,
    ];

    if (sectorRecords.length === 0) {
      lines.push("No dormant or pooled sectors tracked.");
      return lines;
    }

    for (const record of sectorRecords) {
      lines.push(
        `Sector ${record.sectorKey} [${record.status}/${record.trend}]: live ${record.live}, pooled ${record.pooled}, dormant ${record.dormant}, offline ${record.offlineSeconds.toFixed(1)}s, pressure ${record.pressure.toFixed(2)}, depletion ${record.depletion.toFixed(2)}`,
      );
    }
    return lines;
  }

  getOverlayData(limit = 10): RuntimeSectorOverlay | null {
    if (this.stats.centerSector === "n/a") {
      return null;
    }
    const trackedSectors = this.buildSectorRecords()
      .sort((left, right) => (right.live + right.pooled + right.dormant) - (left.live + left.pooled + left.dormant))
      .slice(0, limit)
      .filter((record) => record.pooled > 0 || record.dormant > 0 || record.live > 0 || record.status !== "depleted")
      .map((record) => ({
        sectorKey: record.sectorKey,
        status: record.status,
        trend: record.trend,
        live: record.live,
        pooled: record.pooled,
        dormant: record.dormant,
        recentSeconds: record.recentSeconds,
        offlineSeconds: record.offlineSeconds,
      }));
    return {
      sectorSize: this.currentSectorSize,
      centerSector: this.stats.centerSector,
      residentSectorKeys: [...this.residentSectorKeys],
      trackedSectors,
    };
  }

  private syncRevision(currentRevision: number, world: WorldDocument): void {
    if (this.trackedRevision === null) {
      this.hydrateFromWorld(world);
      this.trackedRevision = currentRevision;
      return;
    }
    if (this.expectedRevision !== null && currentRevision === this.expectedRevision) {
      this.trackedRevision = currentRevision;
      this.expectedRevision = null;
      return;
    }
    if (currentRevision !== this.trackedRevision) {
      this.reset();
      this.hydrateFromWorld(world);
      this.trackedRevision = currentRevision;
    }
  }

  private reset(): void {
    this.dormantEntities.clear();
    this.sectorPools.clear();
    this.sectorStates.clear();
    this.residentSignature = "";
    this.residentSectorKeys = [];
    this.residentTopUpElapsedSeconds = 0;
    this.stats = {
      centerSector: "n/a",
      residentSectorCount: 0,
      dormantCount: 0,
      pooledCount: 0,
      trackedSectorCount: 0,
      growingSectorCount: 0,
      shrinkingSectorCount: 0,
      lastParked: 0,
      lastActivated: 0,
    };
  }

  private hydrateFromWorld(world: WorldDocument): void {
    this.sectorPools.clear();
    for (const pool of world.simulation?.sectorPools ?? []) {
      this.sectorPools.set(this.poolMapKey(pool), {
        sectorKey: pool.sectorKey,
        prefabId: pool.prefabId,
        count: pool.count,
        homeZoneId: pool.homeZoneId,
        groundY: pool.groundY,
      });
    }
    this.sectorStates.clear();
    for (const sectorState of world.simulation?.sectorStates ?? []) {
      this.sectorStates.set(sectorState.sectorKey, {
        ...sectorState,
        offlineSeconds: sectorState.offlineSeconds ?? 0,
        trend: sectorState.trend ?? "stable",
        pressure: sectorState.pressure ?? 0,
        depletion: sectorState.depletion ?? 0,
      });
    }
    this.stats.pooledCount = this.getPooledCount();
    this.refreshAggregateStats();
  }

  private isManagedEntity(world: WorldDocument, entity: EntitySpec): boolean {
    const prefabBrain = entity.prefabId ? world.prefabs[entity.prefabId]?.components?.brain : undefined;
    const brain = entity.components?.brain ?? prefabBrain;
    const health =
      entity.components?.health ??
      (entity.prefabId ? world.prefabs[entity.prefabId]?.components?.health : undefined);
    return brain?.archetype === "zombie" && (health?.current ?? 1) > 0;
  }

  private canPoolEntity(world: WorldDocument, entity: EntitySpec): boolean {
    if (!entity.prefabId) {
      return false;
    }
    const prefab = world.prefabs[entity.prefabId];
    if (!prefab) {
      return false;
    }
    const prefabHealth = prefab.components?.health;
    const currentHealth = entity.components?.health?.current ?? prefabHealth?.current ?? prefabHealth?.max ?? 1;
    const maxHealth = entity.components?.health?.max ?? prefabHealth?.max ?? 1;
    if (currentHealth < maxHealth) {
      return false;
    }
    const components = entity.components;
    if (!components) {
      return true;
    }
    const customKeys = Object.keys(components).filter((key) => key !== "brain");
    return customKeys.length === 0;
  }

  private addEntityToPool(world: WorldDocument, entity: EntitySpec, sectorKey: string): void {
    const homeZoneId =
      entity.components?.brain?.homeZoneId ??
      (entity.prefabId ? world.prefabs[entity.prefabId]?.components?.brain?.homeZoneId : undefined);
    const poolKey = this.poolMapKey({
      sectorKey,
      prefabId: entity.prefabId ?? "unknown",
      homeZoneId,
    });
    const existing = this.sectorPools.get(poolKey);
    if (existing) {
      existing.count += 1;
      return;
    }
    this.sectorPools.set(poolKey, {
      sectorKey,
      prefabId: entity.prefabId ?? "unknown",
      count: 1,
      homeZoneId,
      groundY: entity.transform.position.y,
    });
  }

  private activateResidentPools(
    world: WorldDocument,
    residentKeys: Set<string>,
    liveResidentCounts: Map<string, number>,
    perSectorBudget: number,
    commands: WorldCommand[],
  ): number {
    let activated = 0;
    for (const [poolKey, pool] of [...this.sectorPools.entries()]) {
      if (!residentKeys.has(pool.sectorKey)) {
        continue;
      }
      const liveCount = liveResidentCounts.get(pool.sectorKey) ?? 0;
      const remainingTarget = Math.max(
        0,
        SectorPopulationManager.RESIDENT_TARGET_PER_SECTOR - liveCount,
      );
      const toSpawn = Math.min(pool.count, perSectorBudget, remainingTarget);
      if (toSpawn <= 0) {
        continue;
      }
      const spawnZone = pool.homeZoneId
        ? world.zones.find((zone) => zone.id === pool.homeZoneId) ?? null
        : null;
      for (let index = 0; index < toSpawn; index += 1) {
        commands.push({
          op: "spawn_entity",
          entity: this.spawnEntityFromPool(world, pool, spawnZone, index),
        });
        activated += 1;
      }
      pool.count -= toSpawn;
      liveResidentCounts.set(pool.sectorKey, liveCount + toSpawn);
      if (pool.count <= 0) {
        this.sectorPools.delete(poolKey);
      } else {
        this.sectorPools.set(poolKey, pool);
      }
    }
    return activated;
  }

  private spawnEntityFromPool(
    world: WorldDocument,
    pool: SectorSpawnPool,
    spawnZone: ZoneSpec | null,
    index: number,
  ): EntitySpec {
    const sectorCoord = parseSectorKey(pool.sectorKey);
    const sectorSize = world.settings.sectorSize;
    const baseX = spawnZone?.transform.position.x ?? ((sectorCoord.x + 0.5) * sectorSize);
    const baseZ = spawnZone?.transform.position.z ?? ((sectorCoord.z + 0.5) * sectorSize);
    const radius = spawnZone
      ? spawnZone.shape.type === "sphere"
        ? Math.max(2, spawnZone.shape.radius * 0.45)
        : Math.max(2, Math.min(spawnZone.shape.size.x, spawnZone.shape.size.z) * 0.35)
      : Math.max(2, sectorSize * 0.28);
    const angle = ((this.spawnCounter + index) * 2.399963229728653) % (Math.PI * 2);
    const distance = radius * (0.35 + (((this.spawnCounter + index) % 5) * 0.12));
    const x = baseX + Math.cos(angle) * distance;
    const z = baseZ + Math.sin(angle) * distance;
    const id = `zombie.pooled.${this.spawnCounter++}`;
    const prefabBrain = world.prefabs[pool.prefabId]?.components?.brain;
    const nextComponents: EntityComponents | undefined =
      pool.homeZoneId || prefabBrain?.homeZoneId
        ? {
            brain: {
              ...(prefabBrain ?? {
                archetype: "zombie",
              }),
              homeZoneId: pool.homeZoneId ?? prefabBrain?.homeZoneId,
            },
          }
        : undefined;
    return {
      id,
      name: id.replaceAll(".", " "),
      prefabId: pool.prefabId,
      components: nextComponents,
      transform: {
        position: {
          x,
          y: pool.groundY,
          z,
        },
      },
    };
  }

  private getPooledCount(): number {
    let total = 0;
    for (const pool of this.sectorPools.values()) {
      total += pool.count;
    }
    return total;
  }

  private refreshAggregateStats(): void {
    this.stats.trackedSectorCount = this.sectorStates.size;
    this.stats.growingSectorCount = [...this.sectorStates.values()].filter((state) => state.trend === "growing").length;
    this.stats.shrinkingSectorCount = [...this.sectorStates.values()].filter((state) => state.trend === "shrinking").length;
  }

  private simulateFarSectors(
    residentKeys: Set<string>,
    dtSeconds: number,
  ): boolean {
    if (dtSeconds <= 0) {
      return false;
    }

    let changed = false;
    for (const [sectorKey, state] of this.sectorStates.entries()) {
      if (residentKeys.has(sectorKey) || state.liveCount > 0) {
        if (state.offlineSeconds !== 0 || state.trend !== "stable") {
          this.sectorStates.set(sectorKey, {
            ...state,
            offlineSeconds: 0,
            trend: "stable",
          });
          changed = true;
        }
        continue;
      }

      let nextState: SectorStateSnapshot = {
        ...state,
        offlineSeconds: state.offlineSeconds + dtSeconds,
        trend: state.trend ?? "stable",
        pressure: state.pressure ?? 0,
        depletion: state.depletion ?? 0,
      };
      let sectorChanged = false;
      while (nextState.offlineSeconds >= SectorPopulationManager.OFFLINE_SIMULATION_INTERVAL_SECONDS) {
        nextState.offlineSeconds -= SectorPopulationManager.OFFLINE_SIMULATION_INTERVAL_SECONDS;
        const delta = this.simulateFarSectorStep(sectorKey);
        nextState = {
          ...nextState,
          trend: delta > 0 ? "growing" : delta < 0 ? "shrinking" : "stable",
        };
        if (delta !== 0) {
          nextState.recentSeconds = Math.max(
            nextState.recentSeconds,
            SectorPopulationManager.RECENT_STATE_SECONDS * 0.5,
          );
          sectorChanged = true;
        }
      }

      if (sectorChanged || !sameSectorState(state, nextState)) {
        this.sectorStates.set(sectorKey, nextState);
        changed = true;
      }
    }

    return changed;
  }

  private simulateFarSectorStep(sectorKey: string): number {
    const state = this.sectorStates.get(sectorKey);
    const pools = [...this.sectorPools.entries()].filter(([, pool]) => pool.sectorKey === sectorKey);
    if (pools.length === 0) {
      return 0;
    }

    pools.sort((left, right) => {
      const leftTarget = this.getOfflinePoolTarget(left[1], state);
      const rightTarget = this.getOfflinePoolTarget(right[1], state);
      return (leftTarget - left[1].count) - (rightTarget - right[1].count);
    });

    for (const [poolKey, pool] of pools) {
      const target = this.getOfflinePoolTarget(pool, state);
      if (pool.count < target) {
        pool.count += 1;
        this.sectorPools.set(poolKey, pool);
        return 1;
      }
      if (pool.count > target + 2) {
        pool.count -= 1;
        if (pool.count <= 0) {
          this.sectorPools.delete(poolKey);
        } else {
          this.sectorPools.set(poolKey, pool);
        }
        return -1;
      }
    }

    return 0;
  }

  private getOfflinePoolTarget(
    pool: SectorSpawnPool,
    state: SectorStateSnapshot | undefined,
  ): number {
    const baseTarget = pool.homeZoneId
      ? SectorPopulationManager.OFFLINE_TARGET_WITH_HOME_ZONE
      : SectorPopulationManager.OFFLINE_TARGET_WITHOUT_HOME_ZONE;
    const pressureBias = Math.round((state?.pressure ?? 0) * 6);
    const depletionBias = Math.round((state?.depletion ?? 0) * 5);
    return clampNumber(baseTarget + pressureBias - depletionBias, 0, baseTarget + 8);
  }

  private decaySectorStates(dtSeconds: number): boolean {
    if (dtSeconds <= 0) {
      return false;
    }
    let changed = false;
    for (const [sectorKey, state] of this.sectorStates.entries()) {
      const nextRecentSeconds = Math.max(0, state.recentSeconds - dtSeconds);
      const nextStatus: SectorLifecycleState =
        state.liveCount > 0
          ? "active"
          : state.pooledCount + state.dormantCount > 0
            ? "dormant"
            : nextRecentSeconds > 0
              ? "recent"
              : "depleted";
      const nextState: SectorStateSnapshot = {
        ...state,
        recentSeconds: nextRecentSeconds,
        status: nextStatus,
        pressure: Math.max(0, state.pressure - (SectorPopulationManager.PRESSURE_DECAY_PER_SECOND * dtSeconds)),
        depletion: Math.max(0, state.depletion - (SectorPopulationManager.DEPLETION_DECAY_PER_SECOND * dtSeconds)),
      };
      if (!sameSectorState(state, nextState)) {
        changed = true;
      }
      this.sectorStates.set(sectorKey, nextState);
    }
    return changed;
  }

  private serializePools(): SectorPoolSnapshot[] {
    return [...this.sectorPools.values()].map((pool) => ({
      sectorKey: pool.sectorKey,
      prefabId: pool.prefabId,
      count: pool.count,
      homeZoneId: pool.homeZoneId,
      groundY: pool.groundY,
    }));
  }

  private serializeSectorStates(): SectorStateSnapshot[] {
    return [...this.sectorStates.values()].map((state) => ({
      ...state,
    }));
  }

  private refreshSectorStates(
    residentKeys: Set<string>,
    liveResidentCounts: Map<string, number>,
  ): boolean {
    const records = this.buildSectorRecords();
    const recordMap = new Map(records.map((record) => [record.sectorKey, record]));
    const keys = new Set<string>([
      ...this.sectorStates.keys(),
      ...residentKeys,
      ...recordMap.keys(),
    ]);
    const desiredKeys = new Set<string>();
    let changed = false;

    for (const sectorKey of keys) {
      const existing = this.sectorStates.get(sectorKey);
      const record = recordMap.get(sectorKey);
      const liveCount = residentKeys.has(sectorKey) ? (liveResidentCounts.get(sectorKey) ?? 0) : 0;
      const pooledCount = record?.pooled ?? 0;
      const dormantCount = record?.dormant ?? 0;
      let recentSeconds = existing?.recentSeconds ?? 0;
      let offlineSeconds = existing?.offlineSeconds ?? 0;
      let trend = existing?.trend ?? "stable";
      let pressure = existing?.pressure ?? 0;
      let depletion = existing?.depletion ?? 0;
      if (residentKeys.has(sectorKey) || liveCount > 0) {
        recentSeconds = SectorPopulationManager.RECENT_STATE_SECONDS;
        offlineSeconds = 0;
        trend = "stable";
        pressure = clampNumber(
          pressure + Math.min(0.28, liveCount * 0.04),
          0,
          1.5,
        );
        depletion = Math.max(0, depletion - 0.08);
      } else if (pooledCount + dormantCount <= 1 && existing) {
        depletion = clampNumber(depletion + 0.12, 0, 1.5);
      }

      const status: SectorLifecycleState =
        residentKeys.has(sectorKey) || liveCount > 0
          ? "active"
          : pooledCount + dormantCount > 0
            ? "dormant"
            : recentSeconds > 0
              ? "recent"
              : "depleted";

      if (
        !existing &&
        status === "depleted" &&
        pooledCount === 0 &&
        dormantCount === 0 &&
        liveCount === 0
      ) {
        continue;
      }

      const nextState: SectorStateSnapshot = {
        sectorKey,
        status,
        pooledCount,
        dormantCount,
        liveCount,
        recentSeconds,
        offlineSeconds,
        trend,
        pressure,
        depletion,
      };
      desiredKeys.add(sectorKey);

      if (!existing || !sameSectorState(existing, nextState)) {
        this.sectorStates.set(sectorKey, nextState);
        changed = true;
      }
    }

    for (const [sectorKey, state] of [...this.sectorStates.entries()]) {
      if (
        state.status === "depleted" &&
        state.pooledCount === 0 &&
        state.dormantCount === 0 &&
        state.liveCount === 0 &&
        state.recentSeconds <= 0 &&
        !desiredKeys.has(sectorKey)
      ) {
        this.sectorStates.delete(sectorKey);
        changed = true;
      }
    }

    return changed;
  }

  private countManagedResidentEntities(
    world: WorldDocument,
    residentKeys: Set<string>,
    sectorSize: number,
  ): Map<string, number> {
    const counts = new Map<string, number>();
    for (const entity of world.entities) {
      if (!this.isManagedEntity(world, entity)) {
        continue;
      }
      const sectorKey = sectorKeyForPoint(entity.transform.position, sectorSize);
      if (!residentKeys.has(sectorKey)) {
        continue;
      }
      counts.set(sectorKey, (counts.get(sectorKey) ?? 0) + 1);
    }
    return counts;
  }

  private buildSectorRecords(): SectorDebugRecord[] {
    const records = new Map<string, SectorDebugRecord>();
    for (const state of this.sectorStates.values()) {
      records.set(state.sectorKey, {
        sectorKey: state.sectorKey,
        status: state.status,
        trend: state.trend,
        live: state.liveCount,
        pooled: state.pooledCount,
        dormant: state.dormantCount,
        recentSeconds: state.recentSeconds,
        offlineSeconds: state.offlineSeconds,
        pressure: state.pressure,
        depletion: state.depletion,
      });
    }
    for (const entity of this.dormantEntities.values()) {
      const sectorKey = sectorKeyForPoint(entity.transform.position, this.currentSectorSize);
      const record = records.get(sectorKey) ?? {
        sectorKey,
        status: "dormant",
        trend: "stable",
        live: 0,
        pooled: 0,
        dormant: 0,
        recentSeconds: 0,
        offlineSeconds: 0,
        pressure: 0,
        depletion: 0,
      };
      record.dormant += 1;
      if (record.status === "depleted") {
        record.status = "dormant";
      }
      records.set(record.sectorKey, record);
    }
    for (const pool of this.sectorPools.values()) {
      const record = records.get(pool.sectorKey) ?? {
        sectorKey: pool.sectorKey,
        status: "dormant",
        trend: "stable",
        live: 0,
        pooled: 0,
        dormant: 0,
        recentSeconds: 0,
        offlineSeconds: 0,
        pressure: 0,
        depletion: 0,
      };
      record.pooled += pool.count;
      if (record.status === "depleted") {
        record.status = "dormant";
      }
      records.set(record.sectorKey, record);
    }
    return [...records.values()];
  }

  private poolMapKey(pool: Pick<SectorSpawnPool, "sectorKey" | "prefabId" | "homeZoneId">): string {
    return `${pool.sectorKey}|${pool.prefabId}|${pool.homeZoneId ?? "none"}`;
  }
}

function cloneEntity(entity: EntitySpec): EntitySpec {
  return JSON.parse(JSON.stringify(entity)) as EntitySpec;
}

function parseSectorKey(key: string): { x: number; z: number } {
  const [rawX, rawZ] = key.split(":");
  return {
    x: Number.parseInt(rawX ?? "0", 10) || 0,
    z: Number.parseInt(rawZ ?? "0", 10) || 0,
  };
}

function sameSectorState(left: SectorStateSnapshot, right: SectorStateSnapshot): boolean {
  return (
    left.sectorKey === right.sectorKey &&
    left.status === right.status &&
    left.trend === right.trend &&
    left.pooledCount === right.pooledCount &&
    left.dormantCount === right.dormantCount &&
    left.liveCount === right.liveCount &&
    Math.abs(left.recentSeconds - right.recentSeconds) < 0.01 &&
    Math.abs(left.offlineSeconds - right.offlineSeconds) < 0.01 &&
    Math.abs(left.pressure - right.pressure) < 0.01 &&
    Math.abs(left.depletion - right.depletion) < 0.01
  );
}

function clampNumber(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
