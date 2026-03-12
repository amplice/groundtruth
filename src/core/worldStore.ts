import { WorldCommand, applyCommands } from "./commands";
import {
  EntityComponents,
  Transform,
  WorldDocument,
  cloneWorld,
  computeDiagnostics,
  WorldDiagnostics,
} from "./schema";

type StoreEvent = "world" | "selection";

type Listener = (event: StoreEvent) => void;

export class WorldStore {
  private world: WorldDocument;

  private listeners = new Set<Listener>();

  private selectedEntityId: string | null = null;

  private commandIssues: string[] = [];

  constructor(initialWorld: WorldDocument) {
    this.world = cloneWorld(initialWorld);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getWorld(): WorldDocument {
    return cloneWorld(this.world);
  }

  peekWorld(): WorldDocument {
    return this.world;
  }

  setWorld(world: WorldDocument): void {
    this.world = cloneWorld(world);
    this.commandIssues = [];
    this.emit("world");
  }

  apply(commands: WorldCommand[]): void {
    const result = applyCommands(this.world, commands);
    this.world = result.world;
    this.commandIssues = result.issues;
    this.emit("world");
  }

  getDiagnostics(): WorldDiagnostics {
    return computeDiagnostics(this.world);
  }

  getCommandIssues(): string[] {
    return [...this.commandIssues];
  }

  selectEntity(entityId: string | null): void {
    this.selectedEntityId = entityId;
    this.emit("selection");
  }

  getSelectedEntityId(): string | null {
    return this.selectedEntityId;
  }

  updateEntityPosition(
    entityId: string,
    position: { x: number; y: number; z: number },
    emit = false,
  ): void {
    this.updateEntityTransform(entityId, { position }, emit);
  }

  updateEntityTransform(
    entityId: string,
    transform: Partial<Transform>,
    emit = false,
  ): void {
    const entity = this.world.entities.find((item) => item.id === entityId);
    if (!entity) {
      return;
    }
    entity.transform = {
      ...entity.transform,
      ...transform,
      position: transform.position
        ? { ...transform.position }
        : entity.transform.position,
      rotation: transform.rotation
        ? { ...transform.rotation }
        : entity.transform.rotation,
      scale: transform.scale
        ? { ...transform.scale }
        : entity.transform.scale,
    };
    if (emit) {
      this.emit("world");
    }
  }

  updateEntityComponents(
    entityId: string,
    components: Partial<EntityComponents>,
    emit = false,
  ): void {
    const entity = this.world.entities.find((item) => item.id === entityId);
    if (!entity) {
      return;
    }
    entity.components = {
      ...entity.components,
      ...components,
    };
    if (emit) {
      this.emit("world");
    }
  }

  getSelectedEntityJson(): string {
    if (!this.selectedEntityId) {
      return "No entity selected.";
    }
    const entity = this.world.entities.find((item) => item.id === this.selectedEntityId);
    if (!entity) {
      return "Selected entity no longer exists.";
    }
    return JSON.stringify(entity, null, 2);
  }

  private emit(event: StoreEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
