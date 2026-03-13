import { WorldCommand } from "../core/commands";
import {
  EntitySpec,
  WorldDocument,
  sectorCoordForPoint,
  sectorKeyForPoint,
} from "../core/schema";
import { WorldStore } from "../core/worldStore";

export interface SectorPopulationStats {
  centerSector: string;
  residentSectorCount: number;
  dormantCount: number;
  lastParked: number;
  lastActivated: number;
}

export class SectorPopulationManager {
  private readonly dormantEntities = new Map<string, EntitySpec>();

  private trackedRevision: number | null = null;

  private expectedRevision: number | null = null;

  private residentSignature = "";

  private stats: SectorPopulationStats = {
    centerSector: "n/a",
    residentSectorCount: 0,
    dormantCount: 0,
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
      this.dormantEntities.set(entity.id, cloneEntity(entity));
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

    this.stats.lastActivated = activated;
    this.stats.lastParked = parked;
    this.stats.dormantCount = this.dormantEntities.size;

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
}

function cloneEntity(entity: EntitySpec): EntitySpec {
  return JSON.parse(JSON.stringify(entity)) as EntitySpec;
}
