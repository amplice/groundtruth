import { WorldDocument, ZoneSpec, makeVec3 } from "./schema";

export interface WorldStampDescriptor {
  id: string;
  label: string;
  summary: string;
}

const worldStamps: WorldStampDescriptor[] = [
  {
    id: "street_block",
    label: "Street Block",
    summary: "Adds roads, cover, and a small block of buildings.",
  },
  {
    id: "arena_cluster",
    label: "Arena Cluster",
    summary: "Adds cover and an objective-ready combat cluster.",
  },
  {
    id: "platform_run",
    label: "Platform Run",
    summary: "Adds a short raised traversal route with loot.",
  },
  {
    id: "loot_cluster",
    label: "Loot Cluster",
    summary: "Adds a small loot pocket and supporting loot zone.",
  },
  {
    id: "encounter_cluster",
    label: "Encounter Cluster",
    summary: "Adds a local zombie encounter and spawn zone.",
  },
];

export function listWorldStamps(): WorldStampDescriptor[] {
  return worldStamps.map((stamp) => ({ ...stamp }));
}

export function applyWorldStamp(sourceWorld: WorldDocument, stampId: string): WorldDocument {
  const world: WorldDocument = JSON.parse(JSON.stringify(sourceWorld)) as WorldDocument;
  const index = nextStampIndex(world, stampId);
  const offset = stampOffset(index);

  switch (stampId) {
    case "street_block":
      world.entities.push(
        {
          id: `${stampId}.${index}.road.ns`,
          name: `Street Block Road NS ${index}`,
          prefabId: "road_strip",
          transform: {
            position: makeVec3(offset.x, 0.1, offset.z),
            scale: makeVec3(1, 1, 7),
          },
        },
        {
          id: `${stampId}.${index}.road.ew`,
          name: `Street Block Road EW ${index}`,
          prefabId: "road_strip",
          transform: {
            position: makeVec3(offset.x, 0.1, offset.z),
            rotation: makeVec3(0, Math.PI * 0.5, 0),
            scale: makeVec3(1, 1, 7),
          },
        },
        {
          id: `${stampId}.${index}.shack`,
          name: `Stamp Shack ${index}`,
          prefabId: "shack_building",
          transform: {
            position: makeVec3(offset.x - 7, 1.6, offset.z - 6),
            rotation: makeVec3(0, Math.PI * 0.5, 0),
          },
        },
        {
          id: `${stampId}.${index}.warehouse`,
          name: `Stamp Warehouse ${index}`,
          prefabId: "warehouse_building",
          transform: {
            position: makeVec3(offset.x + 8, 2.5, offset.z + 6),
          },
        },
        {
          id: `${stampId}.${index}.cover.1`,
          name: `Street Cover ${index}A`,
          prefabId: "cover_barrier",
          transform: {
            position: makeVec3(offset.x - 2, 0.7, offset.z + 2),
          },
        },
        {
          id: `${stampId}.${index}.cover.2`,
          name: `Street Cover ${index}B`,
          prefabId: "cover_barrier",
          transform: {
            position: makeVec3(offset.x + 3, 0.7, offset.z - 2),
            rotation: makeVec3(0, Math.PI * 0.5, 0),
          },
        },
      );
      break;
    case "arena_cluster":
      world.entities.push(
        {
          id: `${stampId}.${index}.cover.1`,
          name: `Arena Cover ${index}A`,
          prefabId: "cover_barrier",
          transform: {
            position: makeVec3(offset.x - 5, 0.7, offset.z),
          },
        },
        {
          id: `${stampId}.${index}.cover.2`,
          name: `Arena Cover ${index}B`,
          prefabId: "cover_barrier",
          transform: {
            position: makeVec3(offset.x + 5, 0.7, offset.z),
          },
        },
        {
          id: `${stampId}.${index}.cover.3`,
          name: `Arena Cover ${index}C`,
          prefabId: "cover_barrier",
          transform: {
            position: makeVec3(offset.x, 0.7, offset.z + 7),
            rotation: makeVec3(0, Math.PI * 0.5, 0),
          },
        },
      );
      world.zones.push(makeSphereZone(`${stampId}.${index}.objective`, `Arena Objective ${index}`, "objective", offset.x, offset.z, 7));
      break;
    case "platform_run":
      world.entities.push(
        {
          id: `${stampId}.${index}.platform.1`,
          name: `Platform Run ${index}A`,
          prefabId: "platform_block",
          transform: {
            position: makeVec3(offset.x - 8, 2.4, 0),
          },
        },
        {
          id: `${stampId}.${index}.platform.2`,
          name: `Platform Run ${index}B`,
          prefabId: "platform_block",
          transform: {
            position: makeVec3(offset.x, 5.1, 0),
            scale: makeVec3(0.9, 1, 1),
          },
        },
        {
          id: `${stampId}.${index}.platform.3`,
          name: `Platform Run ${index}C`,
          prefabId: "platform_block",
          transform: {
            position: makeVec3(offset.x + 9, 7.8, 0),
            scale: makeVec3(1.1, 1, 1),
          },
        },
        {
          id: `${stampId}.${index}.crate`,
          name: `Platform Loot ${index}`,
          prefabId: "loot_crate",
          transform: {
            position: makeVec3(offset.x + 9, 8.9, 0),
          },
        },
      );
      break;
    case "loot_cluster":
      world.entities.push(
        {
          id: `${stampId}.${index}.crate.1`,
          name: `Loot Cluster ${index}A`,
          prefabId: "loot_crate",
          transform: {
            position: makeVec3(offset.x - 2, 0.5, offset.z - 1),
          },
        },
        {
          id: `${stampId}.${index}.crate.2`,
          name: `Loot Cluster ${index}B`,
          prefabId: "loot_crate",
          transform: {
            position: makeVec3(offset.x + 2, 0.5, offset.z),
          },
        },
        {
          id: `${stampId}.${index}.crate.3`,
          name: `Loot Cluster ${index}C`,
          prefabId: "loot_crate",
          transform: {
            position: makeVec3(offset.x, 0.5, offset.z + 2),
          },
        },
      );
      world.zones.push(makeSphereZone(`${stampId}.${index}.loot`, `Loot Zone ${index}`, "loot", offset.x, offset.z, 5));
      break;
    case "encounter_cluster":
      world.entities.push(
        makeStampZombie(`${stampId}.${index}.zombie.1`, offset.x - 4, offset.z + 2),
        makeStampZombie(`${stampId}.${index}.zombie.2`, offset.x + 4, offset.z - 1),
        makeStampZombie(`${stampId}.${index}.zombie.3`, offset.x, offset.z + 5),
        makeStampZombie(`${stampId}.${index}.zombie.4`, offset.x + 2, offset.z - 5),
      );
      world.zones.push(makeBoxZone(`${stampId}.${index}.spawn`, `Encounter Spawn ${index}`, "spawn", offset.x, offset.z, 12, 12));
      break;
    default:
      return world;
  }

  return world;
}

function makeStampZombie(id: string, x: number, z: number) {
  return {
    id,
    name: id.replaceAll(".", " "),
    prefabId: "zombie_basic",
    transform: {
      position: makeVec3(x, 1.1, z),
    },
  };
}

function makeSphereZone(id: string, name: string, kind: ZoneSpec["kind"], x: number, z: number, radius: number): ZoneSpec {
  return {
    id,
    name,
    kind,
    shape: {
      type: "sphere",
      radius,
    },
    transform: {
      position: makeVec3(x, 1, z),
    },
  };
}

function makeBoxZone(id: string, name: string, kind: ZoneSpec["kind"], x: number, z: number, width: number, depth: number): ZoneSpec {
  return {
    id,
    name,
    kind,
    shape: {
      type: "box",
      size: makeVec3(width, 2, depth),
    },
    transform: {
      position: makeVec3(x, 1, z),
    },
  };
}

function nextStampIndex(world: WorldDocument, stampId: string): number {
  const ids = [
    ...world.entities.map((entity) => entity.id),
    ...world.zones.map((zone) => zone.id),
  ];
  let next = 1;
  while (ids.some((id) => id.startsWith(`${stampId}.${next}.`))) {
    next += 1;
  }
  return next;
}

function stampOffset(index: number): { x: number; z: number } {
  const row = Math.floor((index - 1) / 3);
  const column = (index - 1) % 3;
  return {
    x: -42 + (column * 42),
    z: 32 + (row * 34),
  };
}
