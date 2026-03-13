import { resolveEntity } from "../core/schema";
import { SectorPopulationManager } from "../runtime/sectorPopulationManager";
import {
  ModuleContext,
  RuntimeFeature,
  RuntimeFeatureFrameResult,
  RuntimeFeatureHost,
  RuntimeSectorOverlay,
} from "./types";

export class SectorPopulationFeature implements RuntimeFeature {
  readonly id = "sector_population" as const;

  private readonly manager = new SectorPopulationManager();

  beginFrame(
    dtSeconds: number,
    context: ModuleContext,
    host: RuntimeFeatureHost,
  ): RuntimeFeatureFrameResult | void {
    const world = context.store.peekWorld();
    const player = world.entities.find((entity) => entity.id === "player");
    if (!player) {
      return;
    }

    const resolvedPlayer = resolveEntity(world, player);
    if (!this.manager.reconcile(context.store, world, resolvedPlayer.transform.position, dtSeconds)) {
      return;
    }

    const populationStats = this.manager.getStats();
    return {
      shortCircuit: true,
      events: [
        `Sector population swap: +${populationStats.lastActivated} activated, -${populationStats.lastParked} parked.`,
      ],
      statusLines: [
        host.getControlLine(),
        `Sector swap in progress | Dormant ${populationStats.dormantCount} | Pooled ${populationStats.pooledCount} | Growing ${populationStats.growingSectorCount} | Cooling ${populationStats.shrinkingSectorCount}`,
      ],
      debugFindings: [
        `Sector population rebalance at ${populationStats.centerSector}.`,
        `Activated ${populationStats.lastActivated}, parked ${populationStats.lastParked}, pooled ${populationStats.pooledCount}, tracked ${populationStats.trackedSectorCount}.`,
      ],
    };
  }

  getWorldDebug(): string[] {
    return this.manager.getDebugLines();
  }

  getSectorOverlay(): RuntimeSectorOverlay | null {
    return this.manager.getOverlayData();
  }

  getStats() {
    return this.manager.getStats();
  }
}
