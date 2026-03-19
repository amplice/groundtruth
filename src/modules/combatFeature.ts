import { resolveEntity } from "../core/schema";
import { ModuleContext, RuntimeFeature, RuntimeFeatureHost } from "./types";

export class CombatFeature implements RuntimeFeature {
  readonly id = "combat" as const;

  onPlayerAttack(
    context: ModuleContext,
    host: RuntimeFeatureHost,
    playerId: string,
  ): boolean {
    if (!context.input.consumePress(host.getAttackKey()) || !host.cooldownReady(playerId)) {
      return false;
    }

    const world = context.store.peekWorld();
    const player = world.entities.find((entity) => entity.id === playerId);
    if (!player) {
      return true;
    }
    const resolvedPlayer = resolveEntity(world, player);
    const combat = resolvedPlayer.components.combat;
    if (!combat) {
      return true;
    }
    const rangedCombat = resolvedPlayer.components.rangedCombat;
    const hasPistol = rangedCombat?.equipped ?? false;
    const hasUsableRanged = hasPistol && !!rangedCombat && (
      rangedCombat.ammoInMagazine > 0 || rangedCombat.reserveAmmo > 0
    );

    if (hasUsableRanged && rangedCombat) {
      if (rangedCombat.ammoInMagazine <= 0) {
        if (rangedCombat.reserveAmmo <= 0) {
          host.setCooldown(playerId, 0.12);
        } else {
          const reloaded = Math.min(rangedCombat.magazineSize, rangedCombat.reserveAmmo);
          context.store.updateEntityComponents(playerId, {
            rangedCombat: {
              ...rangedCombat,
              ammoInMagazine: reloaded,
              reserveAmmo: rangedCombat.reserveAmmo - reloaded,
            },
          });
          host.setCooldown(playerId, rangedCombat.reloadSeconds);
          host.pushEvent(`Reloaded pistol (${reloaded}/${rangedCombat.magazineSize}).`);
          return true;
        }
      }
    }

    const targetingMode = host.getGameplayPolicy().combat.targetingMode;
    const attackRange = hasUsableRanged && rangedCombat ? rangedCombat.range : combat.range;
    const target = targetingMode === "none"
      ? null
      : host.findNearestHostile(world, resolvedPlayer, attackRange, combat.targetTags);
    const attackAction = host.resolveActionDefinition(resolvedPlayer, "attack");
    const attackDuration = hasUsableRanged
      ? Math.min(0.2, host.resolveActionDuration(context, playerId, attackAction))
      : host.resolveActionDuration(context, playerId, attackAction);
    const missCooldownFactor = Math.max(0, host.getGameplayPolicy().combat.missCooldownFactor);
    const attackCooldown = hasUsableRanged && rangedCombat
      ? rangedCombat.cooldownSeconds
      : combat.cooldownSeconds;
    host.setCooldown(playerId, target ? attackCooldown : attackCooldown * missCooldownFactor);
    host.lockAnimationState(playerId, "attack", attackDuration);
    host.syncAction(
      context,
      playerId,
      hasUsableRanged
        ? {
            ...attackAction,
            speed: Math.max(attackAction.speed ?? 1, 2.4),
            fallbackSeconds: Math.min(attackAction.fallbackSeconds ?? attackDuration, 0.2),
            lockMovement: false,
          }
        : attackAction,
    );

    if (!target) {
      if (hasUsableRanged) {
        const yaw = resolvedPlayer.transform.rotation?.y ?? 0;
        const forward = {
          x: Math.sin(yaw),
          y: 0,
          z: Math.cos(yaw),
        };
        context.scene.spawnProjectileTrace(
          muzzlePoint(resolvedPlayer),
          {
            x: resolvedPlayer.transform.position.x + forward.x * attackRange,
            y: resolvedPlayer.transform.position.y + 1.2,
            z: resolvedPlayer.transform.position.z + forward.z * attackRange,
          },
          rangedCombat?.projectileColor ?? "#ffd07a",
        );
        if (rangedCombat) {
          context.store.updateEntityComponents(playerId, {
            rangedCombat: {
              ...rangedCombat,
              ammoInMagazine: Math.max(0, rangedCombat.ammoInMagazine - 1),
            },
          });
          host.pushEvent(`Pistol shot missed. Ammo ${Math.max(0, rangedCombat.ammoInMagazine - 1)}/${rangedCombat.magazineSize}.`);
        } else {
          host.pushEvent("Pistol shot missed.");
        }
      } else {
        host.pushEvent("Player attack missed.");
      }
      return true;
    }

    const damage = hasUsableRanged && rangedCombat ? rangedCombat.damage : combat.damage;
    if (hasUsableRanged) {
      context.scene.spawnProjectileTrace(
        muzzlePoint(resolvedPlayer),
        {
          x: target.transform.position.x,
          y: target.transform.position.y + 1.05,
          z: target.transform.position.z,
        },
        rangedCombat?.projectileColor ?? "#ffd07a",
      );
      if (rangedCombat) {
        context.store.updateEntityComponents(playerId, {
          rangedCombat: {
            ...rangedCombat,
            ammoInMagazine: Math.max(0, rangedCombat.ammoInMagazine - 1),
          },
        });
      }
    }
    host.applyDamage(context, target.id, damage);
    host.pushEvent(
      hasUsableRanged
        ? `Player shot ${target.name} for ${damage}.${rangedCombat ? ` Ammo ${Math.max(0, rangedCombat.ammoInMagazine - 1)}/${rangedCombat.magazineSize}.` : ""}`
        : `Player hit ${target.name} for ${damage}.`,
    );
    return true;
  }

  onApplyDamage(
    context: ModuleContext,
    host: RuntimeFeatureHost,
    targetId: string,
    amount: number,
  ): boolean {
    const world = context.store.peekWorld();
    const target = world.entities.find((entity) => entity.id === targetId);
    if (!target) {
      return true;
    }
    const resolvedTarget = resolveEntity(world, target);
    const health = resolvedTarget.components.health;
    if (!health || health.current <= 0) {
      return true;
    }

    const nextCurrent = Math.max(0, health.current - amount);
    context.store.updateEntityComponents(targetId, {
      health: {
        ...health,
        current: nextCurrent,
      },
    });
    host.emitFeatureEvent(
      {
        type: "damage_applied",
        targetId,
        amount,
        currentHealth: nextCurrent,
        maxHealth: health.max,
      },
      context,
    );

    if (nextCurrent <= 0) {
      const deathAction = host.resolveActionDefinition(resolvedTarget, "death");
      host.lockAnimationState(targetId, deathAction.state, Number.POSITIVE_INFINITY);
      host.syncAction(context, targetId, deathAction);
      host.emitFeatureEvent(
        {
          type: "entity_died",
          entityId: targetId,
          wasPlayer: resolvedTarget.id === "player",
        },
        context,
      );
      host.pushEvent(`${resolvedTarget.name} died.`);
      return true;
    }

    const hurtAction = host.resolveActionDefinition(resolvedTarget, "hurt");
    host.lockAnimationState(
      targetId,
      hurtAction.state,
      Math.min(host.resolveActionDuration(context, targetId, hurtAction), 0.45),
    );
    host.syncAction(context, targetId, hurtAction);
    host.pushEvent(`${resolvedTarget.name} took ${amount} damage.`);
    return true;
  }
}

function muzzlePoint(player: ReturnType<typeof resolveEntity>): { x: number; y: number; z: number } {
  const yaw = player.transform.rotation?.y ?? 0;
  return {
    x: player.transform.position.x + Math.sin(yaw) * 0.55,
    y: player.transform.position.y + 1.25,
    z: player.transform.position.z + Math.cos(yaw) * 0.55,
  };
}
