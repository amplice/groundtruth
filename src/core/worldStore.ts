import { WorldCommand, applyCommands } from "./commands";
import {
  GameplayPolicyProfileId,
  ThirdPersonActionGameplayPolicyPatch,
  mergeThirdPersonActionGameplayPolicyPatch,
} from "./policies";
import {
  emptyWorld,
  EntityComponents,
  ProjectPlaytestSnapshot,
  ProjectDocument,
  Transform,
  WorldSimulationState,
  WorldDocument,
  cloneProject,
  cloneWorld,
  computeDiagnostics,
  isProjectDocument,
  normalizeProject,
  projectFromWorld,
  WorldDiagnostics,
} from "./schema";

type StoreEvent = "world" | "selection" | "project";

type Listener = (event: StoreEvent) => void;

export class WorldStore {
  private project: ProjectDocument;

  private world: WorldDocument;

  private listeners = new Set<Listener>();

  private selectedEntityId: string | null = null;

  private commandIssues: string[] = [];

  private worldRevision = 0;

  constructor(initialWorldOrProject: WorldDocument | ProjectDocument) {
    this.project = isProjectDocument(initialWorldOrProject)
      ? normalizeProject(initialWorldOrProject)
      : projectFromWorld(initialWorldOrProject);
    this.world = this.resolveCurrentWorld();
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

  getProject(): ProjectDocument {
    this.syncCurrentWorldIntoProject();
    return cloneProject(this.project);
  }

  peekProject(): ProjectDocument {
    this.syncCurrentWorldIntoProject();
    return this.project;
  }

  getWorldRevision(): number {
    return this.worldRevision;
  }

  setWorld(world: WorldDocument): void {
    this.world = cloneWorld(world);
    this.syncCurrentWorldIntoProject();
    this.project.metadata.updatedAt = new Date().toISOString();
    this.project.metadata.defaultGameMode = this.world.gameMode;
    this.commandIssues = [];
    this.worldRevision += 1;
    this.emit("world");
  }

  setProject(project: ProjectDocument): void {
    this.project = normalizeProject(project);
    this.world = this.resolveCurrentWorld();
    this.commandIssues = [];
    this.worldRevision += 1;
    this.emit("world");
  }

  updateProjectMetadata(metadata: Partial<ProjectDocument["metadata"]>): void {
    this.project.metadata = {
      ...this.project.metadata,
      ...metadata,
      updatedAt: new Date().toISOString(),
    };
    this.emit("project");
  }

  setProjectFeatureEnabled(featureId: string, enabled: boolean): void {
    this.project.runtime = {
      ...this.project.runtime,
      featureOverrides: {
        ...this.project.runtime.featureOverrides,
        [featureId]: { enabled },
      },
    };
    this.project.metadata.updatedAt = new Date().toISOString();
    this.emit("world");
  }

  setProjectGameplayPolicy(
    policyId: GameplayPolicyProfileId,
    patch: ThirdPersonActionGameplayPolicyPatch,
  ): void {
    this.project.runtime = {
      ...this.project.runtime,
      gameplayPolicies: {
        ...this.project.runtime.gameplayPolicies,
        [policyId]: mergeThirdPersonActionGameplayPolicyPatch(
          this.project.runtime.gameplayPolicies[policyId],
          patch,
        ),
      },
    };
    this.project.metadata.updatedAt = new Date().toISOString();
    this.emit("world");
  }

  clearProjectGameplayPolicy(policyId: GameplayPolicyProfileId): void {
    const nextPolicies = {
      ...this.project.runtime.gameplayPolicies,
    };
    delete nextPolicies[policyId];
    this.project.runtime = {
      ...this.project.runtime,
      gameplayPolicies: nextPolicies,
    };
    this.project.metadata.updatedAt = new Date().toISOString();
    this.emit("world");
  }

  recordAppliedSuggestion(suggestionId: string, title: string): void {
    this.project.runtime = {
      ...this.project.runtime,
      appliedSuggestions: [
        ...this.project.runtime.appliedSuggestions,
        {
          suggestionId,
          title,
          worldId: this.world.metadata.id,
          appliedAt: new Date().toISOString(),
        },
      ].slice(-24),
    };
    this.project.metadata.updatedAt = new Date().toISOString();
    this.emit("project");
  }

  setLastPlaytestReport(snapshot: ProjectPlaytestSnapshot): void {
    this.project.runtime = {
      ...this.project.runtime,
      lastPlaytestReport: snapshot,
    };
    this.project.metadata.updatedAt = new Date().toISOString();
    this.emit("project");
  }

  apply(commands: WorldCommand[]): void {
    const result = applyCommands(this.world, commands);
    this.world = result.world;
    this.syncCurrentWorldIntoProject();
    this.project.metadata.updatedAt = new Date().toISOString();
    this.project.metadata.defaultGameMode = this.world.gameMode;
    this.commandIssues = result.issues;
    this.worldRevision += 1;
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
      this.syncCurrentWorldIntoProject();
      this.project.metadata.updatedAt = new Date().toISOString();
      this.worldRevision += 1;
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
      this.syncCurrentWorldIntoProject();
      this.project.metadata.updatedAt = new Date().toISOString();
      this.worldRevision += 1;
      this.emit("world");
    }
  }

  updateSimulation(
    simulation: WorldSimulationState,
    emit = false,
  ): void {
    this.world.simulation = cloneWorld({
      ...this.world,
      simulation,
    }).simulation;
    if (emit) {
      this.syncCurrentWorldIntoProject();
      this.project.metadata.updatedAt = new Date().toISOString();
      this.worldRevision += 1;
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

  activateProjectWorld(worldId: string): boolean {
    const world = this.project.worlds[worldId];
    if (!world) {
      return false;
    }
    this.project.currentWorldId = worldId;
    this.world = cloneWorld(world);
    this.commandIssues = [];
    this.project.metadata.updatedAt = new Date().toISOString();
    this.project.metadata.defaultGameMode = this.world.gameMode;
    this.worldRevision += 1;
    this.emit("world");
    return true;
  }

  saveCurrentWorldCopy(name?: string): string {
    const baseId = this.world.metadata.id;
    let index = 1;
    let nextId = `${baseId}.variant.${index}`;
    while (this.project.worlds[nextId]) {
      index += 1;
      nextId = `${baseId}.variant.${index}`;
    }
    const worldCopy = cloneWorld(this.world);
    worldCopy.metadata.id = nextId;
    worldCopy.metadata.name = name?.trim().length
      ? name.trim()
      : `${this.world.metadata.name} Copy ${index}`;
    this.project.worlds[nextId] = worldCopy;
    this.project.metadata.updatedAt = new Date().toISOString();
    this.emit("project");
    return nextId;
  }

  private emit(event: StoreEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private resolveCurrentWorld(): WorldDocument {
    const candidate = this.project.worlds[this.project.currentWorldId];
    if (candidate) {
      return cloneWorld(candidate);
    }

    const fallback = Object.values(this.project.worlds)[0];
    if (fallback) {
      this.project.currentWorldId = fallback.metadata.id;
      return cloneWorld(fallback);
    }

    const empty = projectFromWorld(emptyWorld());
    this.project = empty;
    return cloneWorld(empty.worlds[empty.currentWorldId]);
  }

  private syncCurrentWorldIntoProject(replaceExisting = false): void {
    const clonedWorld = cloneWorld(this.world);
    this.project.currentWorldId = clonedWorld.metadata.id;
    if (replaceExisting || Object.keys(this.project.worlds).length === 0) {
      this.project.worlds = {
        [clonedWorld.metadata.id]: clonedWorld,
      };
      return;
    }
    this.project.worlds = {
      ...this.project.worlds,
      [clonedWorld.metadata.id]: clonedWorld,
    };
  }
}
