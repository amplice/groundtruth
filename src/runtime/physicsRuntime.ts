import type * as RAPIERModule from "@dimforge/rapier3d-compat";

import { Vec3, WorldDocument, resolveEntity } from "../core/schema";

type Rapier = typeof RAPIERModule;

export interface CharacterMoveResult {
  position: Vec3;
  grounded: boolean;
  collisions: number;
}

interface PhysicsDebugState {
  position: Vec3;
  grounded: boolean;
  collisions: number;
  desiredDelta: Vec3;
}

export interface PhysicsRuntimeStats {
  syncCount: number;
  retiredWorlds: number;
}

export class PhysicsRuntime {
  private readonly bodyMap = new Map<string, RAPIERModule.RigidBody>();

  private readonly colliderMap = new Map<string, RAPIERModule.Collider>();

  private characterController: RAPIERModule.KinematicCharacterController | null = null;

  private readonly debugState = new Map<string, PhysicsDebugState>();

  private readonly retiredResources: Array<{
    world: RAPIERModule.World;
    controller: RAPIERModule.KinematicCharacterController | null;
    framesUntilFree: number;
  }> = [];

  private syncCount = 0;

  private constructor(
    private readonly rapier: Rapier,
    private world: RAPIERModule.World,
    private colliderCount = 0,
  ) {}

  static async create(gravityY: number): Promise<PhysicsRuntime> {
    const rapier = await import("@dimforge/rapier3d-compat");
    await rapier.init();
    const world = new rapier.World({ x: 0, y: gravityY, z: 0 });
    return new PhysicsRuntime(rapier, world);
  }

  syncWorld(document: WorldDocument): void {
    const nextWorld = new this.rapier.World({
      x: document.settings.gravity.x,
      y: document.settings.gravity.y,
      z: document.settings.gravity.z,
    });
    const nextBodyMap = new Map<string, RAPIERModule.RigidBody>();
    const nextColliderMap = new Map<string, RAPIERModule.Collider>();
    let nextColliderCount = 0;

    for (const item of document.entities) {
      const entity = resolveEntity(document, item);
      const physics = entity.components.physics;
      if (!physics) {
        continue;
      }

      const bodyDesc =
        physics.body === "dynamic"
          ? this.rapier.RigidBodyDesc.dynamic()
          : physics.body === "kinematic"
            ? this.rapier.RigidBodyDesc.kinematicPositionBased()
            : this.rapier.RigidBodyDesc.fixed();

      bodyDesc.setTranslation(
        entity.transform.position.x,
        entity.transform.position.y,
        entity.transform.position.z,
      );

      if (entity.components.character || physics.body === "kinematic") {
        bodyDesc.enabledRotations(false, false, false);
      }

      const body = nextWorld.createRigidBody(bodyDesc);
      const collider = nextWorld.createCollider(
        this.makeColliderDesc(entity, physics),
        body,
      );

      nextBodyMap.set(entity.id, body);
      nextColliderMap.set(entity.id, collider);
      nextColliderCount += 1;
    }

    const nextCharacterController = nextWorld.createCharacterController(0.08);
    nextCharacterController.setSlideEnabled(true);
    nextCharacterController.enableAutostep(0.6, 0.25, false);
    nextCharacterController.setMaxSlopeClimbAngle(Math.PI * 0.35);
    nextCharacterController.setMinSlopeSlideAngle(Math.PI * 0.45);
    nextCharacterController.enableSnapToGround(0.3);

    this.retireCurrentWorld();
    this.world = nextWorld;
    this.characterController = nextCharacterController;
    this.colliderCount = nextColliderCount;
    this.syncCount += 1;
    this.bodyMap.clear();
    this.colliderMap.clear();
    this.debugState.clear();
    for (const [entityId, body] of nextBodyMap) {
      this.bodyMap.set(entityId, body);
    }
    for (const [entityId, collider] of nextColliderMap) {
      this.colliderMap.set(entityId, collider);
    }
  }

  step(): void {
    this.world.step();
    this.flushRetiredResources();
  }

  getColliderCount(): number {
    return this.colliderCount;
  }

  getRuntimeStats(): PhysicsRuntimeStats {
    return {
      syncCount: this.syncCount,
      retiredWorlds: this.retiredResources.length,
    };
  }

  getEntityDebug(entityId: string): string[] {
    const body = this.bodyMap.get(entityId);
    const collider = this.colliderMap.get(entityId);
    const debug = this.debugState.get(entityId);
    const lines = [
      `Physics body: ${body ? (body.isFixed() ? "static" : body.isKinematic() ? "kinematic" : "dynamic") : "none"}`,
      `Collider: ${collider ? "present" : "none"}`,
      `Grounded: ${debug ? String(debug.grounded) : "n/a"}`,
      `Collisions: ${debug ? String(debug.collisions) : "n/a"}`,
    ];
    if (debug) {
      lines.push(`Physics pos: ${formatVec3(debug.position)}`);
      lines.push(`Desired delta: ${formatVec3(debug.desiredDelta)}`);
    }
    return lines;
  }

  moveCharacter(entityId: string, desiredDelta: Vec3): CharacterMoveResult | null {
    if (!this.characterController) {
      return null;
    }

    const body = this.bodyMap.get(entityId);
    const collider = this.colliderMap.get(entityId);
    if (!body || !collider) {
      return null;
    }
    if (!body.isKinematic()) {
      return null;
    }

    this.characterController.computeColliderMovement(
      collider,
      desiredDelta,
      undefined,
      undefined,
      (candidate) => candidate.handle !== collider.handle && !candidate.isSensor(),
    );

    const applied = this.characterController.computedMovement();
    const current = body.translation();
    const nextPosition = {
      x: current.x + applied.x,
      y: current.y + applied.y,
      z: current.z + applied.z,
    };

    body.setNextKinematicTranslation(nextPosition);
    body.setTranslation(nextPosition, false);
    this.world.propagateModifiedBodyPositionsToColliders();

    const result = {
      position: nextPosition,
      grounded: this.characterController.computedGrounded(),
      collisions: this.characterController.numComputedCollisions(),
    };
    this.debugState.set(entityId, {
      ...result,
      desiredDelta: { ...desiredDelta },
    });

    return result;
  }

  private makeColliderDesc(
    entity: ReturnType<typeof resolveEntity>,
    physics: NonNullable<ReturnType<typeof resolveEntity>["components"]["physics"]>,
  ): RAPIERModule.ColliderDesc {
    const scale = entity.transform.scale ?? { x: 1, y: 1, z: 1 };
    let colliderDesc: RAPIERModule.ColliderDesc;

    switch (physics.shape.type) {
      case "box":
        colliderDesc = this.rapier.ColliderDesc.cuboid(
          physics.shape.size.x * scale.x * 0.5,
          physics.shape.size.y * scale.y * 0.5,
          physics.shape.size.z * scale.z * 0.5,
        );
        break;
      case "sphere":
        colliderDesc = this.rapier.ColliderDesc.ball(
          physics.shape.radius * Math.max(scale.x, scale.y, scale.z),
        );
        break;
      case "capsule":
        colliderDesc = this.rapier.ColliderDesc.capsule(
          physics.shape.halfHeight * scale.y,
          physics.shape.radius * Math.max(scale.x, scale.z),
        );
        break;
    }

    if (physics.sensor) {
      colliderDesc.setSensor(true);
    }

    return colliderDesc;
  }

  private retireCurrentWorld(): void {
    this.bodyMap.clear();
    this.colliderMap.clear();
    this.debugState.clear();
    this.retiredResources.push({
      world: this.world,
      controller: this.characterController,
      framesUntilFree: 2,
    });
    this.characterController = null;
  }

  private flushRetiredResources(): void {
    if (this.retiredResources.length === 0) {
      return;
    }

    const pending: typeof this.retiredResources = [];
    for (const resource of this.retiredResources) {
      resource.framesUntilFree -= 1;
      if (resource.framesUntilFree > 0) {
        pending.push(resource);
        continue;
      }

      try {
        resource.controller?.free();
        resource.world.free();
      } catch (error) {
        console.warn("Retrying deferred Rapier world cleanup.", error);
        pending.push({
          ...resource,
          framesUntilFree: 4,
        });
      }
    }

    this.retiredResources.length = 0;
    this.retiredResources.push(...pending);
  }
}

function formatVec3(value: Vec3): string {
  return `(${value.x.toFixed(2)}, ${value.y.toFixed(2)}, ${value.z.toFixed(2)})`;
}
