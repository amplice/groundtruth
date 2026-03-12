import {
  FlatWorldOptions,
  makeFlatOutpostWorld,
} from "./sampleWorld";
import {
  EntitySpec,
  GameMode,
  PrefabSpec,
  WorldDocument,
  ZoneSpec,
  cloneWorld,
  emptyWorld,
} from "./schema";

export type WorldCommand =
  | { op: "reset_world" }
  | { op: "load_world"; world: WorldDocument }
  | { op: "generate_flat_world"; options?: Partial<FlatWorldOptions> }
  | { op: "set_game_mode"; gameMode: GameMode }
  | { op: "upsert_prefab"; prefab: PrefabSpec }
  | { op: "spawn_entity"; entity: EntitySpec }
  | { op: "update_entity"; entityId: string; patch: Partial<EntitySpec> }
  | { op: "delete_entity"; entityId: string }
  | { op: "define_zone"; zone: ZoneSpec }
  | { op: "delete_zone"; zoneId: string }
  | { op: "set_world_name"; name: string; description?: string };

export interface CommandResult {
  world: WorldDocument;
  issues: string[];
}

export function applyCommands(
  sourceWorld: WorldDocument,
  commands: WorldCommand[],
): CommandResult {
  let world = cloneWorld(sourceWorld);
  const issues: string[] = [];

  for (const command of commands) {
    switch (command.op) {
      case "reset_world":
        world = emptyWorld();
        break;
      case "load_world":
        world = cloneWorld(command.world);
        break;
      case "generate_flat_world":
        world = makeFlatOutpostWorld(command.options);
        break;
      case "set_game_mode":
        world.gameMode = command.gameMode;
        break;
      case "set_world_name":
        world.metadata.name = command.name;
        if (command.description !== undefined) {
          world.metadata.description = command.description;
        }
        break;
      case "upsert_prefab":
        world.prefabs[command.prefab.id] = command.prefab;
        break;
      case "spawn_entity": {
        const existing = world.entities.findIndex(
          (entity) => entity.id === command.entity.id,
        );
        if (existing >= 0) {
          world.entities[existing] = command.entity;
        } else {
          world.entities.push(command.entity);
        }
        break;
      }
      case "update_entity": {
        const entity = world.entities.find((item) => item.id === command.entityId);
        if (!entity) {
          issues.push(`Entity '${command.entityId}' not found.`);
          break;
        }
        Object.assign(entity, command.patch);
        if (command.patch.transform) {
          entity.transform = {
            ...entity.transform,
            ...command.patch.transform,
          };
        }
        if (command.patch.components) {
          entity.components = {
            ...entity.components,
            ...command.patch.components,
          };
        }
        break;
      }
      case "delete_entity":
        world.entities = world.entities.filter(
          (entity) => entity.id !== command.entityId,
        );
        break;
      case "define_zone": {
        const existing = world.zones.findIndex((zone) => zone.id === command.zone.id);
        if (existing >= 0) {
          world.zones[existing] = command.zone;
        } else {
          world.zones.push(command.zone);
        }
        break;
      }
      case "delete_zone":
        world.zones = world.zones.filter((zone) => zone.id !== command.zoneId);
        break;
      default: {
        const unreachable: never = command;
        issues.push(`Unsupported command: ${JSON.stringify(unreachable)}`);
      }
    }
  }

  return { world, issues };
}

export function parseCommandScript(source: string): WorldCommand[] {
  const parsed = JSON.parse(source) as unknown;
  if (Array.isArray(parsed)) {
    return parsed as WorldCommand[];
  }
  throw new Error("Expected a JSON array of commands.");
}
