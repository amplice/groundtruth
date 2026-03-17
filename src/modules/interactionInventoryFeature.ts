import { InventoryComponent, resolveEntity } from "../core/schema";
import { ModuleContext, RuntimeFeature, RuntimeFeatureHost } from "./types";

export class InteractionInventoryFeature implements RuntimeFeature {
  readonly id = "interaction_inventory" as const;

  getStatusHint(
    context: ModuleContext,
    host: RuntimeFeatureHost,
    player: ReturnType<RuntimeFeatureHost["resolveEntityById"]>,
  ): string | null {
    const interactive = host.findNearestInteractive(context.store.peekWorld(), player);
    if (!interactive?.components.interaction) {
      return null;
    }
    const interactionKey = host.getInteractionKey();
    if (interactive.components.interaction.kind === "loot") {
      return `Press ${friendlyKeyLabel(interactionKey)} to loot ${interactive.name}`;
    }
    return `Press ${friendlyKeyLabel(interactionKey)} to interact with ${interactive.name}`;
  }

  onPlayerInteract(
    context: ModuleContext,
    host: RuntimeFeatureHost,
    playerId: string,
  ): boolean {
    if (!context.input.consumePress(host.getInteractionKey())) {
      return false;
    }

    const world = context.store.peekWorld();
    const player = world.entities.find((entity) => entity.id === playerId);
    if (!player) {
      return true;
    }
    const resolvedPlayer = resolveEntity(world, player);
    const playerInventory = resolvedPlayer.components.inventory;
    if (!playerInventory) {
      return true;
    }

    const interactive = host.findNearestInteractive(world, resolvedPlayer);
    if (!interactive || !interactive.components.interaction) {
      host.pushEvent("Nothing to interact with.");
      return true;
    }

    if (interactive.components.interaction.kind !== "loot") {
      host.pushEvent(interactive.components.interaction.prompt);
      return true;
    }

    const containerInventory = interactive.components.inventory;
    if (!containerInventory || containerInventory.itemIds.length === 0) {
      host.pushEvent(`${interactive.name} is empty.`);
      return true;
    }
    if (playerInventory.itemIds.length >= playerInventory.maxSlots) {
      host.pushEvent("Inventory full.");
      return true;
    }

    const transferMode = host.getGameplayPolicy().loot.transferMode;
    const emptyContainerMode = host.getGameplayPolicy().loot.emptyContainerMode;
    const availableSlots = Math.max(0, playerInventory.maxSlots - playerInventory.itemIds.length);
    const transferredItems = transferMode === "take_all"
      ? containerInventory.itemIds.slice(0, availableSlots)
      : containerInventory.itemIds.slice(0, Math.min(1, availableSlots));
    if (transferredItems.length === 0) {
      host.pushEvent("Inventory full.");
      return true;
    }
    const remainingItems = containerInventory.itemIds.slice(transferredItems.length);
    const nextPlayerInventory: InventoryComponent = {
      ...playerInventory,
      itemIds: [...playerInventory.itemIds, ...transferredItems],
    };
    const nextContainerInventory: InventoryComponent = {
      ...containerInventory,
      itemIds: remainingItems,
    };

    context.store.updateEntityComponents(playerId, { inventory: nextPlayerInventory });
    if (remainingItems.length === 0 && emptyContainerMode === "despawn") {
      context.store.apply([{ op: "delete_entity", entityId: interactive.id }]);
      host.pushEvent(`${interactive.name} was emptied and removed.`);
    } else {
      context.store.updateEntityComponents(interactive.id, { inventory: nextContainerInventory });
    }
    for (const itemId of transferredItems) {
      host.emitFeatureEvent(
        {
          type: "loot_collected",
          actorId: playerId,
          sourceId: interactive.id,
          itemId,
        },
        context,
      );
    }
    host.pushEvent(
      `Player looted ${transferredItems.join(", ")} from ${interactive.name}. Inventory ${nextPlayerInventory.itemIds.length}/${nextPlayerInventory.maxSlots}.`,
    );
    return true;
  }
}

function friendlyKeyLabel(code: string): string {
  if (code.startsWith("Key")) {
    return code.replace("Key", "");
  }
  return code;
}
