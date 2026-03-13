import { WorldStore } from "../core/worldStore";
import { SectorLifecycleState, SectorPopulationTrend, WorldDocument } from "../core/schema";
import { InputController } from "../runtime/input";
import { PhysicsRuntime } from "../runtime/physicsRuntime";
import { SceneRuntime } from "../runtime/sceneRuntime";

export interface ModuleContext {
  store: WorldStore;
  scene: SceneRuntime;
  physics: PhysicsRuntime;
  input: InputController;
}

export interface RuntimeSectorOverlay {
  sectorSize: number;
  centerSector: string;
  residentSectorKeys: string[];
  trackedSectors: Array<{
    sectorKey: string;
    status: SectorLifecycleState;
    trend: SectorPopulationTrend;
    live: number;
    pooled: number;
    dormant: number;
    recentSeconds: number;
    offlineSeconds: number;
  }>;
}

export type RuntimeFeatureId = "sector_population";

export interface RuntimeFeatureHost {
  getControlLine(): string;
}

export interface RuntimeFeatureFrameResult {
  shortCircuit?: boolean;
  statusLines?: string[];
  debugFindings?: string[];
  events?: string[];
}

export interface RuntimeFeature {
  readonly id: RuntimeFeatureId;
  beginFrame?(
    dtSeconds: number,
    context: ModuleContext,
    host: RuntimeFeatureHost,
  ): RuntimeFeatureFrameResult | void;
  getWorldDebug?(world: WorldDocument): string[];
  getSectorOverlay?(): RuntimeSectorOverlay | null;
}

export interface RuntimeModule {
  readonly id: string;
  update(dtSeconds: number, context: ModuleContext): void;
  getStatusLines?(): string[];
  getDebugFindings?(): string[];
  getWorldDebug?(world: WorldDocument): string[];
  getSectorOverlay?(): RuntimeSectorOverlay | null;
  getEntityDebug?(world: WorldDocument, entityId: string): string[];
  getRecentEvents?(): string[];
}
