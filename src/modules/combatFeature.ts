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

    const target = host.findNearestHostile(world, resolvedPlayer, combat.range, combat.targetTags);
    const attackAction = host.resolveActionDefinition(resolvedPlayer, "attack");
    const attackDuration = host.resolveActionDuration(context, playerId, attackAction);
    host.setCooldown(playerId, target ? combat.cooldownSeconds : combat.cooldownSeconds * 0.4);
    host.lockAnimationState(playerId, "attack", attackDuration);
    host.syncAction(context, playerId, attackAction);

    if (!target) {
      host.pushEvent("Player attack missed.");
      return true;
    }

    host.applyDamage(context, target.id, combat.damage);
    host.pushEvent(`Player hit ${target.name} for ${combat.damage}.`);
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
