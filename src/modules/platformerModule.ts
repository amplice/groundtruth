import { AnimationComponent, ResolvedEntity, Vec3, resolveEntity } from "../core/schema";
import { ModuleContext } from "./types";
import { ThirdPersonActionModule } from "./thirdPersonAction";

export class PlatformerModule extends ThirdPersonActionModule {
  readonly id = "platformer";

  private readonly verticalVelocity = new Map<string, number>();

  private readonly groundedState = new Map<string, boolean>();

  protected override updatePlayerMovement(
    dtSeconds: number,
    context: ModuleContext,
    playerId: string,
    moveSpeed: number,
    sprintSpeed: number | undefined,
    _cameraRig: ResolvedEntity["components"]["cameraRig"],
  ): void {
    const axes = context.input.movementAxes();
    const resolvedPlayer = resolvePlayer(context, playerId);
    const currentLock = this.animationLocks.get(playerId);
    const lockedAction = currentLock
      ? this.resolveActionDefinition(resolvedPlayer, currentLock.state)
      : null;
    const jumpPressed = context.input.consumePress("Space");
    const wasGrounded = this.groundedState.get(playerId) ?? false;
    let velocityY = this.verticalVelocity.get(playerId) ?? 0;

    if (wasGrounded && jumpPressed && !(lockedAction?.lockMovement ?? false)) {
      velocityY = resolvedPlayer.components.character?.jumpSpeed ?? 7.2;
      context.scene.spawnFloatingMarker(playerId, "JUMP", "info");
    }

    velocityY += -20 * dtSeconds;
    const moveX = axes.x === 0 || (lockedAction?.lockMovement ?? false)
      ? 0
      : (axes.x / Math.abs(axes.x)) * (axes.sprint ? sprintSpeed ?? moveSpeed * 1.3 : moveSpeed);
    const movement = context.physics.moveCharacter(playerId, {
      x: moveX * dtSeconds,
      y: (velocityY * dtSeconds) + (wasGrounded && velocityY <= 0 ? -0.04 : 0),
      z: 0,
    });
    const cameraRig = {
      mode: "follow" as const,
      distance: 13.5,
      pitch: 0.12,
      yaw: -Math.PI * 0.5,
    };

    if (!movement) {
      context.scene.updateFollowCamera(playerId, cameraRig);
      return;
    }

    const grounded = movement.grounded;
    if (grounded && velocityY < 0) {
      velocityY = 0;
    }
    this.verticalVelocity.set(playerId, velocityY);
    this.groundedState.set(playerId, grounded);

    let state = "idle";
    if (!grounded) {
      state = "run";
    } else if (Math.abs(moveX) > 0.001) {
      state = axes.sprint ? "run" : "walk";
    }
    this.syncAnimationState(context, playerId, state as AnimationComponent["state"]);

    const facing = moveX < -0.001 ? -Math.PI * 0.5 : moveX > 0.001 ? Math.PI * 0.5 : resolvedPlayer.transform.rotation?.y ?? Math.PI * 0.5;
    const nextPosition = {
      x: movement.position.x,
      y: movement.position.y,
      z: 0,
    };
    context.store.updateEntityTransform(playerId, {
      position: nextPosition,
      rotation: {
        x: 0,
        y: facing,
        z: 0,
      },
    });
    context.scene.updateEntityTransform(playerId, {
      position: nextPosition,
      rotation: {
        x: 0,
        y: facing,
        z: 0,
      },
    });
    context.scene.updateFollowCamera(playerId, cameraRig);
  }

  protected override updateHostiles(
    dtSeconds: number,
    context: ModuleContext,
    playerId: string,
  ): void {
    const world = context.store.peekWorld();
    const player = world.entities.find((entity) => entity.id === playerId);
    if (!player) {
      return;
    }
    const resolvedPlayer = resolveEntity(world, player);
    this.hostileActivityCounts = {
      active: 0,
      throttled: 0,
      sleeping: 0,
    };

    for (const entity of world.entities) {
      if (entity.id === playerId) {
        continue;
      }
      const resolved = resolveEntity(world, entity);
      if (!this.isHostile(resolved)) {
        continue;
      }

      if (this.isDead(resolved)) {
        const deathAction = this.resolveActionDefinition(resolved, "death");
        this.lockAnimationState(entity.id, deathAction.state, Number.POSITIVE_INFINITY);
        this.syncAction(context, entity.id, deathAction);
        continue;
      }

      const physics = resolved.components.physics;
      if (!physics || physics.body !== "kinematic") {
        continue;
      }

      const dx = resolvedPlayer.transform.position.x - resolved.transform.position.x;
      const verticalGap = Math.abs(resolvedPlayer.transform.position.y - resolved.transform.position.y);
      const distance = Math.abs(dx);
      const aggroRadius = resolved.components.brain?.aggroRadius ?? 12;
      const activityTier = distance <= aggroRadius
        ? "active"
        : distance <= aggroRadius + 10
          ? "throttled"
          : "sleeping";
      this.hostileActivityTiers.set(entity.id, activityTier);
      this.hostileActivityCounts[activityTier] += 1;

      if (activityTier === "sleeping" || verticalGap > 3.5 || this.isDead(resolvedPlayer)) {
        this.syncAnimationState(context, entity.id, "idle");
        this.recordHostileMotion(entity.id, resolved.transform.position, false, dtSeconds);
        continue;
      }

      const updateDt = this.consumeHostileUpdateDt(
        entity.id,
        dtSeconds,
        activityTier === "throttled" ? resolved.components.brain?.farThinkIntervalSeconds ?? 0.35 : 0,
      );
      if (updateDt === null) {
        continue;
      }

      const combat = resolved.components.combat;
      const attackRange = combat?.range ?? 0;
      if (combat && distance <= attackRange && this.cooldownReady(entity.id)) {
        const attackAction = this.resolveActionDefinition(resolved, "attack");
        const attackDuration = this.resolveActionDuration(context, entity.id, attackAction);
        this.applyDamage(context, playerId, combat.damage);
        this.setCooldown(entity.id, combat.cooldownSeconds);
        this.lockAnimationState(entity.id, "attack", attackDuration);
        this.syncAction(context, entity.id, attackAction);
        this.pushEvent(`${resolved.name} hit player for ${combat.damage}.`);
        this.recordHostileMotion(entity.id, resolved.transform.position, false, updateDt);
        continue;
      }

      const currentLock = this.animationLocks.get(entity.id);
      const lockedAction = currentLock
        ? this.resolveActionDefinition(resolved, currentLock.state)
        : null;
      if ((lockedAction?.lockMovement ?? false) || distance > aggroRadius) {
        this.syncAnimationState(context, entity.id, "idle");
        this.recordHostileMotion(entity.id, resolved.transform.position, false, updateDt);
        continue;
      }

      const speed = resolved.components.character?.moveSpeed ?? 2.2;
      const direction = dx < 0 ? -1 : 1;
      const movement = context.physics.moveCharacter(entity.id, {
        x: direction * speed * updateDt,
        y: -0.03,
        z: 0,
      });
      if (!movement) {
        this.recordHostileMotion(entity.id, resolved.transform.position, true, updateDt);
        continue;
      }

      const nextPosition: Vec3 = {
        x: movement.position.x,
        y: movement.position.y,
        z: 0,
      };
      this.syncAnimationState(context, entity.id, "walk");
      context.store.updateEntityTransform(entity.id, {
        position: nextPosition,
        rotation: {
          x: 0,
          y: direction < 0 ? -Math.PI * 0.5 : Math.PI * 0.5,
          z: 0,
        },
      });
      context.scene.updateEntityTransform(entity.id, {
        position: nextPosition,
        rotation: {
          x: 0,
          y: direction < 0 ? -Math.PI * 0.5 : Math.PI * 0.5,
          z: 0,
        },
      });
      this.recordHostileMotion(entity.id, nextPosition, true, updateDt);
    }
  }

  protected override getControlLine(): string {
    return "A/D move | Shift sprint | Space jump | F attack | E interact";
  }

  protected override getIdlePrompt(): string {
    return "Use generated worlds as a platformer sandbox.";
  }

  protected override getAttackKey(): string {
    return "KeyF";
  }
}

function resolvePlayer(context: ModuleContext, playerId: string) {
  return resolveEntity(context.store.peekWorld(), context.store.peekWorld().entities.find((item) => item.id === playerId)!);
}
