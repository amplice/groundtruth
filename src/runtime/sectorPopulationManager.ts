import { WorldCommand } from "../core/commands";
import {
  EntityComponents,
  EntitySpec,
  ZoneSpec,
  WorldDocument,
  sectorCoordForPoint,
  sectorKeyForPoint,
} from "../core/schema";
import { WorldStore } from "../core/worldStore";

export interface SectorPopulationStats {
  centerSector: string;
  residentSectorCount: number;
  dormantCount: number;
  pooledCount: number;
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

export class SectorPopulationManager {
  private readonly dormantEntities = new Map<string, EntitySpec>();

  private readonly sectorPools = new Map<string, SectorSpawnPool>();

  private trackedRevision: number | null = null;

  private expectedRevision: number | null = null;

  private residentSignature = "";

  private spawnCounter = 1;

  private stats: SectorPopulationStats = {
    centerSector: "n/a",
    residentSectorCount: 0,
    dormantCount: 0,
    pooledCount: 0,
    lastParked: 0,
    lastActivated: 0,
  };

  reconcile(
    store: WorldStore,
    world: WorldDocument,
    center: { x: number; y: number; z: number },
    sectorRadius = 2,
  ): boolean {
    this.syncRevision(store.getWorldRevision());

    const sectorSize = world.settings.sectorSize;
    const centerCoord = sectorCoordForPoint(center, sectorSize);
    const residentKeys = new Set<string>();
    for (let dz = -sectorRadius; dz <= sectorRadius; dz += 1) {
      for (let dx = -sectorRadius; dx <= sectorRadius; dx += 1) {
        residentKeys.add(`${centerCoord.x + dx}:${centerCoord.z + dz}`);
      }
    }
    const signature = [...residentKeys].sort().join("|");
    this.stats.centerSector = `${centerCoord.x}:${centerCoord.z}`;
    this.stats.residentSectorCount = residentKeys.size;

    if (signature === this.residentSignature) {
      this.stats.lastActivated = 0;
      this.stats.lastParked = 0;
      this.stats.dormantCount = this.dormantEntities.size;
      this.stats.pooledCount = this.getPooledCount();
      return false;
    }

    this.residentSignature = signature;
    const commands: WorldCommand[] = [];
    let parked = 0;
    let activated = 0;

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
    }

    for (const [poolKey, pool] of [...this.sectorPools.entries()]) {
      if (!residentKeys.has(pool.sectorKey)) {
        continue;
      }
      const spawnZone = pool.homeZoneId
        ? world.zones.find((zone) => zone.id === pool.homeZoneId) ?? null
        : null;
      for (let index = 0; index < pool.count; index += 1) {
        commands.push({
          op: "spawn_entity",
          entity: this.spawnEntityFromPool(world, pool, spawnZone, index),
        });
        activated += 1;
      }
      this.sectorPools.delete(poolKey);
    }

    this.stats.lastActivated = activated;
    this.stats.lastParked = parked;
    this.stats.dormantCount = this.dormantEntities.size;
    this.stats.pooledCount = this.getPooledCount();

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

  private syncRevision(currentRevision: number): void {
    if (this.trackedRevision === null) {
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
      this.trackedRevision = currentRevision;
    }
  }

  private reset(): void {
    this.dormantEntities.clear();
    this.residentSignature = "";
    this.stats = {
      centerSector: "n/a",
      residentSectorCount: 0,
      dormantCount: 0,
      pooledCount: 0,
      lastParked: 0,
      lastActivated: 0,
    };
  }

  private isManagedEntity(world: WorldDocument, entity: EntitySpec): boolean {
    const prefabBrain = entity.prefabId ? world.prefabs[entity.prefabId]?.components?.brain : undefined;
    const brain = entity.components?.brain ?? prefabBrain;
    const health = entity.components?.health ?? (entity.prefabId ? world.prefabs[entity.prefabId]?.components?.health : undefined);
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
    const homeZoneId = entity.components?.brain?.homeZoneId ?? (entity.prefabId ? world.prefabs[entity.prefabId]?.components?.brain?.homeZoneId : undefined);
    const poolKey = `${sectorKey}|${entity.prefabId}|${homeZoneId ?? "none"}`;
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
    const nextComponents: EntityComponents | undefined = pool.homeZoneId || prefabBrain?.homeZoneId
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
