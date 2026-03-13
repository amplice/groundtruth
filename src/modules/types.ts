import { WorldStore } from "../core/worldStore";
import { WorldDocument } from "../core/schema";
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
  hotSectors: Array<{
    sectorKey: string;
    pooled: number;
    dormant: number;
  }>;
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
