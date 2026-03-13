import { GameMode, WorldDocument } from "../core/schema";
import { ModuleContext, RuntimeModule } from "./types";

export class SandboxModule implements RuntimeModule {
  readonly id: string;

  constructor(private readonly gameMode: GameMode) {
    this.id = gameMode;
  }

  update(_dtSeconds: number, _context: ModuleContext): void {
    // Sandbox modules do not inject gameplay yet.
  }

  getStatusLines(): string[] {
    return [
      `Sandbox module: ${this.gameMode}`,
      "Author content, inspect the world, and use the semantic editor tools.",
    ];
  }

  getDebugFindings(): string[] {
    return [
      "No genre-specific runtime module is attached to this world yet.",
      "Core rendering, physics, authoring, and evaluation are still available.",
    ];
  }

  getWorldDebug(world: WorldDocument): string[] {
    return [
      `World mode: ${world.gameMode}`,
      `Entities: ${world.entities.length}`,
      `Zones: ${world.zones.length}`,
      `Tracked sectors: ${world.simulation.sectorStates.length}`,
      `Pooled actors: ${world.simulation.sectorPools.reduce((total, pool) => total + pool.count, 0)}`,
    ];
  }
}
