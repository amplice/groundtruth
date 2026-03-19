import type * as RAPIERModule from "@dimforge/rapier3d-compat";

import { PhysicsPrimitiveShape, Rotation3, Vec3, WorldDocument, resolveEntity } from "../core/schema";

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
  private static readonly SETTLE_DOWN_DELTA = -0.12;

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
      const rotation = entity.transform.rotation;
      if (rotation) {
        const quaternion = eulerToQuaternion(rotation);
        bodyDesc.setRotation(quaternion);
      }

      if (entity.components.character || physics.body === "kinematic") {
        bodyDesc.enabledRotations(false, false, false);
      }

      const body = nextWorld.createRigidBody(bodyDesc);
      const scale = entity.transform.scale ?? { x: 1, y: 1, z: 1 };

      if (physics.shape.type === "compound") {
        for (const child of physics.shape.children) {
          const childDesc = this.makePrimitiveColliderDesc(child.shape, scale);
          childDesc.setTranslation(
            child.offset.x * scale.x,
            child.offset.y * scale.y,
            child.offset.z * scale.z,
          );
          if (child.rotation) {
            const q = eulerToQuaternion(child.rotation);
            childDesc.setRotation(q);
          }
          if (physics.sensor) {
            childDesc.setSensor(true);
          }
          nextWorld.createCollider(childDesc, body);
          nextColliderCount += 1;
        }
      } else {
        const colliderDesc = this.makePrimitiveColliderDesc(physics.shape, scale);
        if (physics.sensor) {
          colliderDesc.setSensor(true);
        }
        nextWorld.createCollider(colliderDesc, body);
        nextColliderCount += 1;
      }

      nextBodyMap.set(entity.id, body);
      nextColliderMap.set(entity.id, body.collider(0)!);
    }

    // Step once so Rapier populates its broad-phase acceleration structure
    // before the character controller queries it.
    nextWorld.step();

    const nextCharacterController = nextWorld.createCharacterController(0.08);
    nextCharacterController.setSlideEnabled(true);
    nextCharacterController.enableAutostep(0.2, 0.25, false);
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

    // Diagnostic summary
    let staticCount = 0;
    let kinematicCount = 0;
    let dynamicCount = 0;
    for (const body of nextBodyMap.values()) {
      if (body.isFixed()) staticCount += 1;
      else if (body.isKinematic()) kinematicCount += 1;
      else dynamicCount += 1;
    }
    console.log(
      `[physics-sync] bodies=${nextBodyMap.size} (static=${staticCount} kinematic=${kinematicCount} dynamic=${dynamicCount}) colliders=${nextColliderCount}`,
    );
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

  holdCharacter(entityId: string): CharacterMoveResult | null {
    return this.moveCharacter(entityId, {
      x: 0,
      y: PhysicsRuntime.SETTLE_DOWN_DELTA,
      z: 0,
    });
  }

  teleportCharacter(entityId: string, position: Vec3): CharacterMoveResult | null {
    const body = this.bodyMap.get(entityId);
    if (!body || !body.isKinematic()) {
      return null;
    }

    body.setNextKinematicTranslation(position);
    body.setTranslation(position, false);
    this.world.propagateModifiedBodyPositionsToColliders();

    const result = {
      position: { ...position },
      grounded: false,
      collisions: 0,
    };
    this.debugState.set(entityId, {
      ...result,
      desiredDelta: { x: 0, y: 0, z: 0 },
    });
    return result;
  }

  private makePrimitiveColliderDesc(
    shape: PhysicsPrimitiveShape,
    scale: Vec3,
  ): RAPIERModule.ColliderDesc {
    switch (shape.type) {
      case "box":
        return this.rapier.ColliderDesc.cuboid(
          shape.size.x * scale.x * 0.5,
          shape.size.y * scale.y * 0.5,
          shape.size.z * scale.z * 0.5,
        );
      case "sphere":
        return this.rapier.ColliderDesc.ball(
          shape.radius * Math.max(scale.x, scale.y, scale.z),
        );
      case "capsule":
        return this.rapier.ColliderDesc.capsule(
          shape.halfHeight * scale.y,
          shape.radius * Math.max(scale.x, scale.z),
        );
      case "cylinder":
        return this.rapier.ColliderDesc.cylinder(
          shape.halfHeight * scale.y,
          shape.radius * Math.max(scale.x, scale.z),
        );
    }
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
    }

    this.retiredResources.length = 0;
    this.retiredResources.push(...pending);
  }
}

function formatVec3(value: Vec3): string {
  return `(${value.x.toFixed(2)}, ${value.y.toFixed(2)}, ${value.z.toFixed(2)})`;
}

function eulerToQuaternion(rotation: Rotation3): { x: number; y: number; z: number; w: number } {
  const halfX = rotation.x * 0.5;
  const halfY = rotation.y * 0.5;
  const halfZ = rotation.z * 0.5;
  const sx = Math.sin(halfX);
  const cx = Math.cos(halfX);
  const sy = Math.sin(halfY);
  const cy = Math.cos(halfY);
  const sz = Math.sin(halfZ);
  const cz = Math.cos(halfZ);

  return {
    x: sx * cy * cz + cx * sy * sz,
    y: cx * sy * cz - sx * cy * sz,
    z: cx * cy * sz + sx * sy * cz,
    w: cx * cy * cz - sx * sy * sz,
  };
}
