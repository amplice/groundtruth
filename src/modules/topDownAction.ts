import { ResolvedEntity, resolveEntity } from "../core/schema";
import { ModuleContext } from "./types";
import { ThirdPersonActionModule } from "./thirdPersonAction";

export class TopDownActionModule extends ThirdPersonActionModule {
  readonly id = "top_down";

  protected override updatePlayerMovement(
    dtSeconds: number,
    context: ModuleContext,
    playerId: string,
    moveSpeed: number,
    sprintSpeed: number | undefined,
    _cameraRig: ResolvedEntity["components"]["cameraRig"],
  ): void {
    const axes = context.input.movementAxes();
    const length = Math.hypot(axes.x, axes.z);
    const resolvedPlayer = resolvePlayer(context, playerId);
    const currentLock = this.animationLocks.get(playerId);
    const lockedAction = currentLock
      ? this.resolveActionDefinition(resolvedPlayer, currentLock.state)
      : null;

    const cameraRig = {
      mode: "top_down" as const,
      distance: 24,
      pitch: 1.35,
      yaw: 0,
    };

    if (length <= 0.001 || (lockedAction?.lockMovement ?? false)) {
      this.syncAnimationState(context, playerId, "idle");
      context.scene.updateFollowCamera(playerId, cameraRig);
      return;
    }

    const speed = axes.sprint ? sprintSpeed ?? moveSpeed * 1.4 : moveSpeed;
    const dirX = axes.x / length;
    const dirZ = axes.z / length;
    const movement = context.physics.moveCharacter(playerId, {
      x: dirX * speed * dtSeconds,
      y: 0,
      z: dirZ * speed * dtSeconds,
    });
    if (!movement) {
      context.scene.updateFollowCamera(playerId, cameraRig);
      return;
    }

    this.syncAnimationState(context, playerId, axes.sprint ? "run" : "walk");
    context.store.updateEntityTransform(playerId, {
      position: movement.position,
      rotation: {
        x: 0,
        y: Math.atan2(dirX, dirZ),
        z: 0,
      },
    });
    context.scene.updateEntityTransform(playerId, {
      position: movement.position,
      rotation: {
        x: 0,
        y: Math.atan2(dirX, dirZ),
        z: 0,
      },
    });
    context.scene.updateFollowCamera(playerId, cameraRig);
  }

  protected override getIdlePrompt(): string {
    return "Use generated worlds as a top-down action sandbox.";
  }
}

function resolvePlayer(context: ModuleContext, playerId: string) {
  return resolveEntity(context.store.peekWorld(), context.store.peekWorld().entities.find((item) => item.id === playerId)!);
}
