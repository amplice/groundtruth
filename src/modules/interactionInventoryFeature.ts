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
    return interactive?.components.interaction?.prompt ?? null;
  }

  onPlayerInteract(
    context: ModuleContext,
    host: RuntimeFeatureHost,
    playerId: string,
  ): boolean {
    if (!context.input.consumePress("KeyE")) {
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

    const [itemId, ...remainingItems] = containerInventory.itemIds;
    const nextPlayerInventory: InventoryComponent = {
      ...playerInventory,
      itemIds: [...playerInventory.itemIds, itemId],
    };
    const nextContainerInventory: InventoryComponent = {
      ...containerInventory,
      itemIds: remainingItems,
    };

    context.store.updateEntityComponents(playerId, { inventory: nextPlayerInventory });
    context.store.updateEntityComponents(interactive.id, { inventory: nextContainerInventory });
    host.emitFeatureEvent(
      {
        type: "loot_collected",
        actorId: playerId,
        sourceId: interactive.id,
        itemId,
      },
      context,
    );
    host.pushEvent(`Player looted ${itemId} from ${interactive.name}.`);
    return true;
  }
}
