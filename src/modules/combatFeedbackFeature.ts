import { ModuleContext, RuntimeFeature, RuntimeFeatureEvent, RuntimeFeatureHost } from "./types";

export class CombatFeedbackFeature implements RuntimeFeature {
  readonly id = "combat_feedback" as const;

  onEvent(
    event: RuntimeFeatureEvent,
    context: ModuleContext,
    host: RuntimeFeatureHost,
  ): void {
    switch (event.type) {
      case "damage_applied": {
        context.scene.updateEntityHealth(event.targetId, event.currentHealth, event.maxHealth);
        const isPlayer = event.targetId === "player";
        context.scene.flashEntity(
          event.targetId,
          isPlayer ? "#ff8f8f" : "#ff4d4d",
          isPlayer ? 0.24 : 0.18,
          isPlayer ? 0.9 : 1,
        );
        context.scene.spawnFloatingMarker(
          event.targetId,
          `-${event.amount}`,
          isPlayer ? "danger" : "damage",
        );
        return;
      }
      case "entity_died": {
        context.scene.flashEntity(
          event.entityId,
          event.wasPlayer ? "#ff9c9c" : "#ffffff",
          0.32,
          1,
        );
        context.scene.spawnFloatingMarker(event.entityId, "DOWN", "down");
        return;
      }
      case "loot_collected": {
        context.scene.flashEntity(event.sourceId, "#f4d35e", 0.22, 0.8);
        context.scene.flashEntity(event.actorId, "#7cc6fe", 0.16, 0.45);
        context.scene.spawnFloatingMarker(event.sourceId, event.itemId, "loot");
        return;
      }
      case "player_danger_changed": {
        context.scene.setPlayerDangerLevel(event.level);
        return;
      }
      default:
        return assertUnreachable(event);
    }
  }
}

function assertUnreachable(value: never): never {
  throw new Error(`Unhandled feedback event '${JSON.stringify(value)}'.`);
}
