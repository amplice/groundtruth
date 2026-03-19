import { ObjectiveProgressSnapshot, ObjectiveSpec, ObjectiveStep, ZoneSpec } from "../core/schema";
import { ModuleContext, RuntimeFeature, RuntimeFeatureEvent, RuntimeFeatureHost } from "./types";

interface ObjectiveProgressState {
  objectiveId: string;
  activeStepIndex: number;
  collectCounts: Record<string, number>;
  completedStepIds: string[];
  completed: boolean;
}

export class ObjectiveProgressFeature implements RuntimeFeature {
  readonly id = "objective_progress" as const;

  private state: ObjectiveProgressState | null = null;

  onWorldRebuilt(
    world: ReturnType<ModuleContext["store"]["peekWorld"]>,
    context: ModuleContext,
  ): void {
    const objective = world.objectives?.[0];
    if (!objective) {
      this.state = null;
      return;
    }
    this.state = this.hydrateProgress(world, objective);
    this.persistState(context);
  }

  getStatusHint(
    context: ModuleContext,
    host: RuntimeFeatureHost,
  ): string | null {
    const objective = this.getActiveObjective(context);
    if (!objective || !this.state) {
      return null;
    }
    if (this.state.completed) {
      return `${objective.name}: complete`;
    }

    const step = objective.steps[this.state.activeStepIndex];
    if (!step) {
      return `${objective.name}: complete`;
    }

    if (step.kind === "collect_loot") {
      const current = this.state.collectCounts[step.id] ?? 0;
      return `${objective.name}: ${step.description} (${Math.min(step.targetCount, current)}/${step.targetCount})`;
    }
    const zone = context.store.peekWorld().zones.find((candidate) => candidate.id === step.zoneId);
    const targetCopy = zone
      ? ` -> ${zone.name} @ (${Math.round(zone.transform.position.x)}, ${Math.round(zone.transform.position.z)})`
      : "";
    return `${objective.name}: ${step.description}${targetCopy}`;
  }

  beginFrame(
    _dtSeconds: number,
    context: ModuleContext,
    host: RuntimeFeatureHost,
  ): void {
    const objective = this.getActiveObjective(context);
    const state = this.state;
    if (!objective || !state || state.completed) {
      return;
    }

    const step = objective.steps[state.activeStepIndex];
    if (!step || step.kind !== "reach_zone") {
      return;
    }

    const player = host.resolveEntityById(context, "player");
    const zone = context.store.peekWorld().zones.find((candidate) => candidate.id === step.zoneId);
    if (!zone || !isInsideZone(player.transform.position, zone)) {
      return;
    }

    this.completeStep(step, objective, context, host);
  }

  onEvent(
    event: RuntimeFeatureEvent,
    context: ModuleContext,
    host: RuntimeFeatureHost,
  ): void {
    if (event.type !== "loot_collected") {
      return;
    }

    const objective = this.getActiveObjective(context);
    const state = this.state;
    if (!objective || !state || state.completed) {
      return;
    }

    const step = objective.steps[state.activeStepIndex];
    if (!step || step.kind !== "collect_loot") {
      return;
    }
    if (step.itemIds && !step.itemIds.includes(event.itemId)) {
      return;
    }

    const nextCount = (state.collectCounts[step.id] ?? 0) + 1;
    state.collectCounts[step.id] = nextCount;
    this.persistState(context);
    if (nextCount >= step.targetCount) {
      this.completeStep(step, objective, context, host);
    }
  }

  private completeStep(
    step: ObjectiveStep,
    objective: ObjectiveSpec,
    context: ModuleContext,
    host: RuntimeFeatureHost,
  ): void {
    const state = this.state;
    if (!state || state.completedStepIds.includes(step.id)) {
      return;
    }

    state.completedStepIds.push(step.id);
    state.activeStepIndex += 1;
    this.persistState(context);
    host.pushEvent(`Objective step complete: ${step.description}`);
    host.emitFeatureEvent(
      {
        type: "objective_step_completed",
        playerId: "player",
        label: step.description,
      },
      context,
    );

    if (state.activeStepIndex >= objective.steps.length) {
      state.completed = true;
      this.persistState(context);
      host.pushEvent(`Objective complete: ${objective.name}`);
      host.emitFeatureEvent(
        {
          type: "objective_completed",
          playerId: "player",
          label: objective.name,
        },
        context,
      );
    }
  }

  private getActiveObjective(
    context: ModuleContext,
  ): ObjectiveSpec | null {
    if (!this.state) {
      return null;
    }
    return context.store.peekWorld().objectives?.find((objective) => objective.id === this.state?.objectiveId) ?? null;
  }

  private recomputeProgress(
    world: ReturnType<ModuleContext["store"]["peekWorld"]>,
    objective: ObjectiveSpec,
  ): void {
    const state = this.state;
    if (!state) {
      return;
    }
    const player = world.entities.find((entity) => entity.id === "player");
    const playerInventory = player ? (player.components?.inventory?.itemIds ?? []) : [];
    state.collectCounts = {
      ...state.collectCounts,
    };
    state.completedStepIds = [...state.completedStepIds];
    state.activeStepIndex = 0;
    state.completed = false;

    for (let index = 0; index < objective.steps.length; index += 1) {
      const step = objective.steps[index];
      if (state.completedStepIds.includes(step.id)) {
        state.activeStepIndex = index + 1;
        continue;
      }
      if (step.kind === "collect_loot") {
        const count = step.itemIds?.length
          ? playerInventory.filter((itemId) => step.itemIds?.includes(itemId)).length
          : playerInventory.length;
        state.collectCounts[step.id] = Math.max(state.collectCounts[step.id] ?? 0, count);
        if (count >= step.targetCount) {
          state.completedStepIds.push(step.id);
          state.activeStepIndex = index + 1;
          continue;
        }
        state.activeStepIndex = index;
        return;
      }

      state.activeStepIndex = index;
      return;
    }

    state.completed = true;
    state.activeStepIndex = objective.steps.length;
  }

  private hydrateProgress(
    world: ReturnType<ModuleContext["store"]["peekWorld"]>,
    objective: ObjectiveSpec,
  ): ObjectiveProgressState {
    const stored = world.objectiveProgress?.[objective.id];
    const state: ObjectiveProgressState = stored
      ? {
          objectiveId: stored.objectiveId,
          activeStepIndex: stored.activeStepIndex,
          collectCounts: { ...stored.collectCounts },
          completedStepIds: [...stored.completedStepIds],
          completed: stored.completed,
        }
      : {
          objectiveId: objective.id,
          activeStepIndex: 0,
          collectCounts: {},
          completedStepIds: [],
          completed: false,
        };
    this.state = state;
    this.recomputeProgress(world, objective);
    return state;
  }

  private persistState(context: ModuleContext): void {
    if (!this.state) {
      return;
    }
    const snapshot: ObjectiveProgressSnapshot = {
      objectiveId: this.state.objectiveId,
      activeStepIndex: this.state.activeStepIndex,
      collectCounts: { ...this.state.collectCounts },
      completedStepIds: [...this.state.completedStepIds],
      completed: this.state.completed,
    };
    context.store.updateObjectiveProgress(this.state.objectiveId, snapshot);
  }
}

function isInsideZone(
  position: { x: number; y: number; z: number },
  zone: ZoneSpec,
): boolean {
  if (zone.shape.type === "sphere") {
    const dx = position.x - zone.transform.position.x;
    const dy = position.y - zone.transform.position.y;
    const dz = position.z - zone.transform.position.z;
    return Math.hypot(dx, dy, dz) <= zone.shape.radius;
  }

  const halfX = zone.shape.size.x * 0.5;
  const halfY = zone.shape.size.y * 0.5;
  const halfZ = zone.shape.size.z * 0.5;
  return (
    Math.abs(position.x - zone.transform.position.x) <= halfX
    && Math.abs(position.y - zone.transform.position.y) <= halfY
    && Math.abs(position.z - zone.transform.position.z) <= halfZ
  );
}
