import { EntitySpec, PrefabSpec, WorldDocument, ZoneSpec, makeVec3 } from "./schema";

export interface FlatWorldOptions {
  seed: number;
  worldHalfExtent: number;
  buildingCount: number;
  zombieCount: number;
  crateCount: number;
}

export const defaultFlatWorldOptions: FlatWorldOptions = {
  seed: 7,
  worldHalfExtent: 72,
  buildingCount: 12,
  zombieCount: 18,
  crateCount: 6,
};

export function createDefaultPrefabs(): Record<string, PrefabSpec> {
  return {
    ground_tile: {
      id: "ground_tile",
      name: "Ground Tile",
      category: "terrain",
      description: "Large flat walkable ground slab.",
      placement: {
        defaultHeight: -0.5,
        minScale: 1,
        maxScale: 20,
      },
      components: {
        render: {
          type: "primitive",
          primitive: "box",
          size: makeVec3(16, 1, 16),
          color: "#738b5b",
        },
        physics: {
          body: "static",
          shape: {
            type: "box",
            size: makeVec3(16, 1, 16),
          },
        },
      },
    },
    road_strip: {
      id: "road_strip",
      name: "Road Strip",
      category: "road",
      description: "Flat road segment for open-world layouts.",
      placement: {
        defaultHeight: 0.1,
        minScale: 1,
        maxScale: 20,
      },
      components: {
        render: {
          type: "primitive",
          primitive: "box",
          size: makeVec3(12, 0.2, 4),
          color: "#5e666d",
        },
        physics: {
          body: "static",
          shape: {
            type: "box",
            size: makeVec3(12, 0.2, 4),
          },
        },
      },
    },
    platform_block: {
      id: "platform_block",
      name: "Platform Block",
      category: "terrain",
      description: "Raised traversal platform for platformer and vertical slices.",
      placement: {
        defaultHeight: 2,
        minScale: 0.6,
        maxScale: 4,
      },
      tags: ["platform"],
      components: {
        render: {
          type: "primitive",
          primitive: "box",
          size: makeVec3(6, 1, 2),
          color: "#8a7658",
        },
        physics: {
          body: "static",
          shape: {
            type: "box",
            size: makeVec3(6, 1, 2),
          },
        },
      },
    },
    player_survivor: {
      id: "player_survivor",
      name: "Player Survivor",
      category: "actor",
      description: "Playable survivor with third-person camera and melee combat.",
      placement: {
        defaultHeight: 1.1,
        minScale: 0.75,
        maxScale: 1.5,
      },
      tags: ["player", "survivor"],
      components: {
        render: {
          type: "model",
          format: "fbx",
          uri: "/assets/mixamo/Char_Man_02v1.fbx",
          debugColor: "#2a7fff",
          animationSources: {
            idle: "/assets/mixamo/Pistol Idle.fbx",
            walk: "/assets/mixamo/Running.fbx",
            run: "/assets/mixamo/Pistol Run.fbx",
            attack: "/assets/mixamo/Cross Punch.fbx",
            death: "/assets/mixamo/Dying.fbx",
            hurt: "/assets/mixamo/Receive Punch To The Face.fbx",
          },
          modelScale: makeVec3(0.01, 0.01, 0.01),
          modelOffset: makeVec3(0, -1, 0),
        },
        animation: {
          state: "idle",
          fadeSeconds: 0.15,
        },
        actions: {
          attack: {
            state: "attack",
            speed: 1.35,
            fadeSeconds: 0.08,
            fallbackSeconds: 0.92,
            loop: "once",
            lockMovement: true,
          },
          hurt: {
            state: "hurt",
            speed: 1,
            fadeSeconds: 0.08,
            fallbackSeconds: 0.6,
            loop: "once",
            lockMovement: true,
          },
          death: {
            state: "death",
            speed: 1,
            fadeSeconds: 0.08,
            fallbackSeconds: 1.2,
            loop: "once",
            lockMovement: true,
          },
        },
        physics: {
          body: "kinematic",
          shape: {
            type: "capsule",
            radius: 0.45,
            halfHeight: 0.55,
          },
        },
        character: {
          movementStyle: "third_person",
          moveSpeed: 4.2,
          sprintSpeed: 6.5,
          jumpSpeed: 5,
        },
        health: {
          current: 100,
          max: 100,
        },
        inventory: {
          maxSlots: 24,
          itemIds: ["medkit", "flashlight"],
        },
        combat: {
          damage: 20,
          range: 2.2,
          cooldownSeconds: 0.45,
          targetTags: ["enemy"],
        },
        cameraRig: {
          mode: "follow",
          distance: 8.5,
          pitch: 0.55,
          yaw: 0.75,
        },
      },
    },
    zombie_basic: {
      id: "zombie_basic",
      name: "Zombie",
      category: "actor",
      description: "Default infected NPC tuned for activity-bubble updates.",
      placement: {
        defaultHeight: 1.1,
        minScale: 0.8,
        maxScale: 1.4,
      },
      tags: ["enemy", "infected"],
      components: {
        render: {
          type: "model",
          format: "fbx",
          uri: "/assets/mixamo/Char_Man_02v1.fbx",
          debugColor: "#7e9271",
          animationSources: {
            idle: "/assets/mixamo/Pistol Idle.fbx",
            walk: "/assets/mixamo/Running.fbx",
            attack: "/assets/mixamo/Punching.fbx",
            death: "/assets/mixamo/Dying.fbx",
            hurt: "/assets/mixamo/Receive Punch To The Face.fbx",
          },
          modelScale: makeVec3(0.01, 0.01, 0.01),
          modelOffset: makeVec3(0, -1, 0),
        },
        animation: {
          state: "idle",
          fadeSeconds: 0.15,
        },
        actions: {
          attack: {
            state: "attack",
            speed: 1.2,
            fadeSeconds: 0.08,
            fallbackSeconds: 0.8,
            loop: "once",
            lockMovement: true,
          },
          hurt: {
            state: "hurt",
            speed: 1,
            fadeSeconds: 0.08,
            fallbackSeconds: 0.55,
            loop: "once",
            lockMovement: true,
          },
          death: {
            state: "death",
            speed: 1,
            fadeSeconds: 0.08,
            fallbackSeconds: 1.2,
            loop: "once",
            lockMovement: true,
          },
        },
        physics: {
          body: "kinematic",
          shape: {
            type: "capsule",
            radius: 0.42,
            halfHeight: 0.5,
          },
        },
        character: {
          movementStyle: "third_person",
          moveSpeed: 2.4,
        },
        health: {
          current: 45,
          max: 45,
        },
        combat: {
          damage: 8,
          range: 1.5,
          cooldownSeconds: 1,
          targetTags: ["player"],
        },
        brain: {
          archetype: "zombie",
          aggroRadius: 14,
          activityRadius: 18,
          homeZoneId: "graveyard",
          sleepRadius: 44,
          farThinkIntervalSeconds: 0.35,
        },
      },
    },
    shack_building: {
      id: "shack_building",
      name: "Shack Building",
      category: "building",
      description: "Small building footprint for outposts and compounds.",
      placement: {
        defaultHeight: 1.6,
        minScale: 0.7,
        maxScale: 2.2,
      },
      components: {
        render: {
          type: "primitive",
          primitive: "box",
          size: makeVec3(6, 3.2, 6),
          color: "#6d5849",
        },
        physics: {
          body: "static",
          shape: {
            type: "box",
            size: makeVec3(6, 3.2, 6),
          },
        },
      },
    },
    warehouse_building: {
      id: "warehouse_building",
      name: "Warehouse Building",
      category: "building",
      description: "Large rectangular building shell.",
      placement: {
        defaultHeight: 2.5,
        minScale: 0.8,
        maxScale: 2.5,
      },
      components: {
        render: {
          type: "primitive",
          primitive: "box",
          size: makeVec3(10, 5, 8),
          color: "#76706a",
        },
        physics: {
          body: "static",
          shape: {
            type: "box",
            size: makeVec3(10, 5, 8),
          },
        },
      },
    },
    loot_crate: {
      id: "loot_crate",
      name: "Loot Crate",
      category: "loot",
      description: "Basic lootable container with starter supplies.",
      placement: {
        defaultHeight: 0.5,
        minScale: 0.75,
        maxScale: 1.5,
      },
      tags: ["loot", "container"],
      components: {
        render: {
          type: "primitive",
          primitive: "box",
          size: makeVec3(1.2, 1, 1.2),
          color: "#b1834f",
        },
        physics: {
          body: "static",
          shape: {
            type: "box",
            size: makeVec3(1.2, 1, 1.2),
          },
        },
        inventory: {
          maxSlots: 8,
          itemIds: ["bandage", "ammo_9mm", "beans"],
        },
        interaction: {
          kind: "loot",
          radius: 2.2,
          prompt: "Press E to loot crate",
        },
      },
    },
  };
}

export function makeThirdPersonSurvivalWorld(): WorldDocument {
  return {
    metadata: {
      id: "groundtruth.world.survival_outpost",
      name: "Survival Outpost",
      description:
        "A semantic vertical slice for the browser-first Groundtruth runtime.",
    },
    gameMode: "third_person_survival",
    settings: {
      gravity: makeVec3(0, -9.81, 0),
      ambientLight: "#8fa7b8",
      skyColor: "#dde7ef",
      fogColor: "#dfe4e8",
      fogDensity: 0.01,
      gridSize: 220,
      sectorSize: 20,
    },
    prefabs: createDefaultPrefabs(),
    entities: [
      makeGroundEntity(128),
      makePlayerEntity(makeVec3(0, 1.2, 0)),
      {
        id: "building.shack.01",
        name: "Shack",
        prefabId: "shack_building",
        transform: {
          position: makeVec3(-8, 1.6, -5),
        },
      },
      {
        id: "crate.01",
        name: "Supply Crate",
        prefabId: "loot_crate",
        transform: {
          position: makeVec3(-5.8, 0.5, -3.4),
        },
      },
      makeZombieEntity("zombie.01", makeVec3(11, 1.1, 3)),
      makeZombieEntity("zombie.02", makeVec3(14, 1.1, -2)),
      makeZombieEntity("zombie.03", makeVec3(15, 1.1, 4.5)),
    ],
    zones: [
      {
        id: "graveyard",
        name: "Graveyard Spawn",
        kind: "spawn",
        shape: {
          type: "box",
          size: makeVec3(10, 2, 10),
        },
        transform: {
          position: makeVec3(14, 1, 1),
        },
        tags: ["infected", "night_spawn"],
      },
      {
        id: "safe.outpost",
        name: "Outpost Safe Radius",
        kind: "safe",
        shape: {
          type: "sphere",
          radius: 8,
        },
        transform: {
          position: makeVec3(-6, 1, -4),
        },
        tags: ["safe", "trading"],
      },
    ],
    simulation: {
      sectorPools: [],
      sectorStates: [],
    },
  };
}

export function makeFlatOutpostWorld(
  options: Partial<FlatWorldOptions> = {},
): WorldDocument {
  const config = { ...defaultFlatWorldOptions, ...options };
  const random = createMulberry32(config.seed);
  const worldSize = config.worldHalfExtent * 2;
  const buildingEntities: EntitySpec[] = [];
  const crateEntities: EntitySpec[] = [];
  const zombieEntities: EntitySpec[] = [];
  const spawnZones: ZoneSpec[] = [
    makeSpawnZone("spawn.north", "North Encounter", makeVec3(0, 1, -config.worldHalfExtent * 0.72), makeVec3(18, 2, 12)),
    makeSpawnZone("spawn.east", "East Encounter", makeVec3(config.worldHalfExtent * 0.72, 1, 0), makeVec3(12, 2, 18)),
    makeSpawnZone("spawn.southwest", "Southwest Encounter", makeVec3(-config.worldHalfExtent * 0.56, 1, config.worldHalfExtent * 0.54), makeVec3(16, 2, 16)),
  ];
  const zones: ZoneSpec[] = [
    {
      id: "safe.center",
      name: "Center Safe Radius",
      kind: "safe",
      shape: {
        type: "sphere",
        radius: 12,
      },
      transform: {
        position: makeVec3(0, 1, 0),
      },
      tags: ["starter", "safe"],
    },
    ...spawnZones,
  ];

  const occupied: Array<{ x: number; z: number; radius: number }> = [
    { x: 0, z: 0, radius: 16 },
  ];

  buildingEntities.push(
    {
      id: "road.ns",
      name: "North South Road",
      prefabId: "road_strip",
      transform: {
        position: makeVec3(0, 0.1, 0),
        scale: makeVec3(1, 1, worldSize / 4),
      },
    },
    {
      id: "road.ew",
      name: "East West Road",
      prefabId: "road_strip",
      transform: {
        position: makeVec3(0, 0.1, 0),
        rotation: makeVec3(0, Math.PI * 0.5, 0),
        scale: makeVec3(1, 1, worldSize / 4),
      },
    },
  );

  for (let index = 0; index < config.buildingCount; index += 1) {
    const isWarehouse = random() > 0.62;
    const prefabId = isWarehouse ? "warehouse_building" : "shack_building";
    const baseHeight = isWarehouse ? 2.5 : 1.6;
    const scale = isWarehouse
      ? makeVec3(0.9 + random() * 0.5, 1, 0.9 + random() * 0.5)
      : makeVec3(0.85 + random() * 0.4, 1, 0.85 + random() * 0.45);
    const footprint = isWarehouse ? 7 : 4.5;
    const position = samplePlacement(random, config.worldHalfExtent - 10, occupied, footprint + 4);
    occupied.push({ x: position.x, z: position.z, radius: footprint + 4 });
    buildingEntities.push({
      id: `building.${index + 1}`,
      name: isWarehouse ? `Warehouse ${index + 1}` : `Shack ${index + 1}`,
      prefabId,
      transform: {
        position: makeVec3(position.x, baseHeight * scale.y, position.z),
        rotation: makeVec3(0, pickQuarterTurn(random), 0),
        scale,
      },
    });

    if (crateEntities.length < config.crateCount && random() > 0.35) {
      crateEntities.push({
        id: `crate.${crateEntities.length + 1}`,
        name: `Loot Crate ${crateEntities.length + 1}`,
        prefabId: "loot_crate",
        transform: {
          position: makeVec3(
            position.x + (random() - 0.5) * 4,
            0.5,
            position.z + (random() - 0.5) * 4,
          ),
          rotation: makeVec3(0, random() * Math.PI * 2, 0),
        },
      });
    }
  }

  while (crateEntities.length < config.crateCount) {
    const ring = sampleRingPosition(random, 18, config.worldHalfExtent - 10);
    crateEntities.push({
      id: `crate.${crateEntities.length + 1}`,
      name: `Loot Crate ${crateEntities.length + 1}`,
      prefabId: "loot_crate",
      transform: {
        position: makeVec3(ring.x, 0.5, ring.z),
        rotation: makeVec3(0, random() * Math.PI * 2, 0),
      },
    });
  }

  for (let index = 0; index < config.zombieCount; index += 1) {
    const spawn = sampleRingPosition(random, config.worldHalfExtent * 0.45, config.worldHalfExtent - 8);
    const homeZoneId = findNearestZoneId(spawnZones, spawn.x, spawn.z);
    zombieEntities.push(
      makeZombieEntity(
        `zombie.${index + 1}`,
        makeVec3(spawn.x, 1.1, spawn.z),
        homeZoneId,
      ),
    );
  }

  return {
    metadata: {
      id: `groundtruth.world.flat_outpost.${config.seed}`,
      name: `Flat Outpost Seed ${config.seed}`,
      description:
        "Procedurally assembled flat-world outpost with roads, box buildings, loot, and zombie lanes.",
    },
    gameMode: "open_world",
    settings: {
      gravity: makeVec3(0, -9.81, 0),
      ambientLight: "#8fa7b8",
      skyColor: "#d8e3ea",
      fogColor: "#d9e0e4",
      fogDensity: 0.008,
      gridSize: Math.max(220, worldSize + 32),
      sectorSize: 24,
    },
    prefabs: createDefaultPrefabs(),
    entities: [
      makeGroundEntity(worldSize),
      makePlayerEntity(makeVec3(0, 1.2, 0)),
      ...buildingEntities,
      ...crateEntities,
      ...zombieEntities,
    ],
    zones,
    simulation: {
      sectorPools: [],
      sectorStates: [],
    },
  };
}

function makeGroundEntity(size: number): EntitySpec {
  return {
    id: "ground",
    name: "Ground",
    prefabId: "ground_tile",
    transform: {
      position: makeVec3(0, -0.5, 0),
      scale: makeVec3(size / 16, 1, size / 16),
    },
  };
}

function makePlayerEntity(position: { x: number; y: number; z: number }): EntitySpec {
  return {
    id: "player",
    name: "Player",
    prefabId: "player_survivor",
    transform: {
      position: makeVec3(position.x, position.y, position.z),
    },
  };
}

function makeZombieEntity(
  id: string,
  position: { x: number; y: number; z: number },
  homeZoneId?: string,
): EntitySpec {
  return {
    id,
    name: id.replace(".", " ").replace("_", " "),
    prefabId: "zombie_basic",
    components: homeZoneId
      ? {
          brain: {
            archetype: "zombie",
            aggroRadius: 14,
            activityRadius: 18,
            homeZoneId,
            sleepRadius: 44,
            farThinkIntervalSeconds: 0.35,
          },
        }
      : undefined,
    transform: {
      position: makeVec3(position.x, position.y, position.z),
    },
  };
}

function makeSpawnZone(
  id: string,
  name: string,
  position: { x: number; y: number; z: number },
  size: { x: number; y: number; z: number },
): ZoneSpec {
  return {
    id,
    name,
    kind: "spawn",
    shape: {
      type: "box",
      size: makeVec3(size.x, size.y, size.z),
    },
    transform: {
      position: makeVec3(position.x, position.y, position.z),
    },
    tags: ["infected", "generated"],
  };
}

function samplePlacement(
  random: () => number,
  maxRadius: number,
  occupied: Array<{ x: number; z: number; radius: number }>,
  radius: number,
): { x: number; z: number } {
  for (let attempt = 0; attempt < 48; attempt += 1) {
    const position = sampleRingPosition(random, 14, maxRadius);
    if (occupied.every((item) => distance2d(item.x, item.z, position.x, position.z) > item.radius + radius)) {
      return position;
    }
  }

  return sampleRingPosition(random, 14, maxRadius);
}

function sampleRingPosition(
  random: () => number,
  minRadius: number,
  maxRadius: number,
): { x: number; z: number } {
  const angle = random() * Math.PI * 2;
  const radius = minRadius + random() * Math.max(maxRadius - minRadius, 1);
  return {
    x: Math.cos(angle) * radius,
    z: Math.sin(angle) * radius,
  };
}

function pickQuarterTurn(random: () => number): number {
  return Math.floor(random() * 4) * (Math.PI * 0.5);
}

function distance2d(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

function findNearestZoneId(
  zones: ZoneSpec[],
  x: number,
  z: number,
): string | undefined {
  let nearestZoneId: string | undefined;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const zone of zones) {
    const distance = distance2d(zone.transform.position.x, zone.transform.position.z, x, z);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestZoneId = zone.id;
    }
  }
  return nearestZoneId;
}

function createMulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
