import { EntitySpec, PhysicsCompoundChild, PrefabSpec, WorldDocument, ZoneSpec, makeVec3 } from "./schema";

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

const URBAN_ROAD_TILE_SIZE = 16;
const URBAN_ROAD_TILE_THICKNESS = 0.32;
const URBAN_BUILDING_SQUARE_SIZE = makeVec3(17, 17, 17);
const URBAN_BUILDING_L_SIZE = makeVec3(21, 17, 27);

// L-shape decomposition: long wing (full depth, partial width) + short wing (partial depth, full width)
// The L footprint is roughly 21 wide x 27 deep, with the notch in one corner.
// Wing A: 10x17x27 along the left side (full depth)
// Wing B: 21x17x10 along the front (full width, partial depth)
const URBAN_L_SHAPE_COLLIDERS: PhysicsCompoundChild[] = [
  { shape: { type: "box", size: makeVec3(10, 17, 27) }, offset: makeVec3(-5.5, 0, 0) },
  { shape: { type: "box", size: makeVec3(11, 17, 10) }, offset: makeVec3(5, 0, -8.5) },
];

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
          color: "#ffffff",
          textureUri: "/assets/asset_variety_pack/Ground/Materials/grass_02.png",
          textureRepeat: makeVec3(4, 1, 4),
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
    cover_barrier: {
      id: "cover_barrier",
      name: "Cover Barrier",
      category: "prop",
      description: "Low waist-high cover for readable combat spaces and arenas.",
      placement: {
        defaultHeight: 0.7,
        minScale: 0.8,
        maxScale: 3,
      },
      tags: ["cover"],
      components: {
        render: {
          type: "primitive",
          primitive: "box",
          size: makeVec3(4.5, 1.4, 1.2),
          color: "#6f6a64",
        },
        physics: {
          body: "static",
          shape: {
            type: "box",
            size: makeVec3(4.5, 1.4, 1.2),
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
            speed: 2.2,
            fadeSeconds: 0.08,
            fallbackSeconds: 0.3,
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
          cooldownSeconds: 0.24,
          targetTags: ["enemy"],
        },
        rangedCombat: {
          weaponId: "pistol",
          equipped: false,
          damage: 14,
          range: 20,
          cooldownSeconds: 0.18,
          projectileSpeed: 28,
          projectileColor: "#ffd07a",
          magazineSize: 8,
          ammoInMagazine: 0,
          reserveAmmo: 0,
          reloadSeconds: 1.1,
          ammoPerPickup: 12,
        },
        cameraRig: {
          mode: "follow",
          distance: 12.5,
          pitch: 0.96,
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
          uri: "/assets/zombie_models/FBX/PS1_Zombie_2.fbx",
          debugColor: "#7e9271",
          clips: {
            idle: "IdleZ",
            walk: "WalkZ",
            run: "WalkZ",
            attack: "GrabBiteZ",
            death: "DieZ",
            hurt: "DamageZ",
            rise: "ClimbGraveZ",
          },
          modelScale: makeVec3(0.01, 0.01, 0.01),
          modelOffset: makeVec3(0, 0, 0),
        },
        animation: {
          state: "idle",
          fadeSeconds: 0.15,
        },
        actions: {
          attack: {
            state: "attack",
            speed: 0.82,
            fadeSeconds: 0.08,
            fallbackSeconds: 1.1,
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
          cooldownSeconds: 1.45,
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
          itemIds: ["weapon_pistol", "bandage", "ammo_9mm"],
        },
        interaction: {
          kind: "loot",
          radius: 2.2,
          prompt: "Press E to loot crate",
        },
      },
    },
    urban_road_straight: {
      id: "urban_road_straight",
      name: "Urban Road Straight",
      category: "road",
      description: "16x16 modular straight road from the URBAN kit.",
      placement: {
        defaultHeight: URBAN_ROAD_TILE_THICKNESS * 0.5,
        minScale: 1,
        maxScale: 1,
      },
      tags: ["road", "urban"],
      components: {
        render: {
          type: "model",
          format: "gltf",
          uri: "/assets/urban_models/Roads/Road%20type%202/road_2_straight.glb",
          modelOffset: makeVec3(0, -URBAN_ROAD_TILE_THICKNESS * 0.5, -URBAN_ROAD_TILE_SIZE * 0.5),
        },
        physics: {
          body: "static",
          shape: {
            type: "box",
            size: makeVec3(URBAN_ROAD_TILE_SIZE, URBAN_ROAD_TILE_THICKNESS, URBAN_ROAD_TILE_SIZE),
          },
        },
      },
    },
    urban_road_junction: {
      id: "urban_road_junction",
      name: "Urban Road Junction",
      category: "road",
      description: "16x16 four-way road junction from the URBAN kit.",
      placement: {
        defaultHeight: URBAN_ROAD_TILE_THICKNESS * 0.5,
        minScale: 1,
        maxScale: 1,
      },
      tags: ["road", "urban", "junction"],
      components: {
        render: {
          type: "model",
          format: "gltf",
          uri: "/assets/urban_models/Roads/Road%20type%202/road_2_junction.glb",
          modelOffset: makeVec3(0, -URBAN_ROAD_TILE_THICKNESS * 0.5, -URBAN_ROAD_TILE_SIZE * 0.5),
        },
        physics: {
          body: "static",
          shape: {
            type: "box",
            size: makeVec3(URBAN_ROAD_TILE_SIZE, URBAN_ROAD_TILE_THICKNESS, URBAN_ROAD_TILE_SIZE),
          },
        },
      },
    },
    urban_flat_square_brick: {
      id: "urban_flat_square_brick",
      name: "Urban Flat Square Brick",
      category: "building",
      description: "17x17 prebuilt apartment block with corner-based origin.",
      placement: {
        defaultHeight: URBAN_BUILDING_SQUARE_SIZE.y * 0.5,
        minScale: 1,
        maxScale: 1,
      },
      tags: ["urban", "building", "apartment"],
      components: {
        render: {
          type: "model",
          format: "gltf",
          uri: "/assets/urban_models/Buildings%20Prebuild/flat_square_brick.glb",
          modelOffset: makeVec3(-8.5, -8.5, -8.5),
        },
        physics: {
          body: "static",
          shape: {
            type: "box",
            size: URBAN_BUILDING_SQUARE_SIZE,
          },
        },
      },
    },
    urban_flat_square_concrete: {
      id: "urban_flat_square_concrete",
      name: "Urban Flat Square Concrete",
      category: "building",
      description: "Concrete apartment block sized to the URBAN road kit.",
      placement: {
        defaultHeight: URBAN_BUILDING_SQUARE_SIZE.y * 0.5,
        minScale: 1,
        maxScale: 1,
      },
      tags: ["urban", "building", "apartment"],
      components: {
        render: {
          type: "model",
          format: "gltf",
          uri: "/assets/urban_models/Buildings%20Prebuild/flat_square_concrete.glb",
          modelOffset: makeVec3(-8.5, -8.5, -8.5),
        },
        physics: {
          body: "static",
          shape: {
            type: "box",
            size: URBAN_BUILDING_SQUARE_SIZE,
          },
        },
      },
    },
    urban_flat_square_brick_alt: {
      id: "urban_flat_square_brick_alt",
      name: "Urban Flat Square Brick Alt",
      category: "building",
      description: "Alternate brick apartment block using the same 17x17 footprint.",
      placement: {
        defaultHeight: URBAN_BUILDING_SQUARE_SIZE.y * 0.5,
        minScale: 1,
        maxScale: 1,
      },
      tags: ["urban", "building", "apartment"],
      components: {
        render: {
          type: "model",
          format: "gltf",
          uri: "/assets/urban_models/Buildings%20Prebuild/flat_square_brick_alt.glb",
          modelOffset: makeVec3(-8.5, -8.5, -8.5),
        },
        physics: {
          body: "static",
          shape: {
            type: "box",
            size: URBAN_BUILDING_SQUARE_SIZE,
          },
        },
      },
    },
    urban_flat_square_concrete_alt: {
      id: "urban_flat_square_concrete_alt",
      name: "Urban Flat Square Concrete Alt",
      category: "building",
      description: "Alternate concrete apartment block using the same 17x17 footprint.",
      placement: {
        defaultHeight: URBAN_BUILDING_SQUARE_SIZE.y * 0.5,
        minScale: 1,
        maxScale: 1,
      },
      tags: ["urban", "building", "apartment"],
      components: {
        render: {
          type: "model",
          format: "gltf",
          uri: "/assets/urban_models/Buildings%20Prebuild/flat_square_concrete_alt.glb",
          modelOffset: makeVec3(-8.5, -8.5, -8.5),
        },
        physics: {
          body: "static",
          shape: {
            type: "box",
            size: URBAN_BUILDING_SQUARE_SIZE,
          },
        },
      },
    },
    urban_flat_lshape: {
      id: "urban_flat_lshape",
      name: "Urban Flat L-Shape",
      category: "building",
      description: "Large L-shaped apartment block from the URBAN kit.",
      placement: {
        defaultHeight: URBAN_BUILDING_L_SIZE.y * 0.5,
        minScale: 1,
        maxScale: 1,
      },
      tags: ["urban", "building", "apartment", "lshape"],
      components: {
        render: {
          type: "model",
          format: "gltf",
          uri: "/assets/urban_models/Buildings%20Prebuild/flat_Lshape.glb",
          modelOffset: makeVec3(-10.5, -8.5, -4.5),
        },
        physics: {
          body: "static",
          shape: {
            type: "compound",
            children: URBAN_L_SHAPE_COLLIDERS,
          },
        },
      },
    },
    urban_flat_lshape_brick: {
      id: "urban_flat_lshape_brick",
      name: "Urban Flat L-Shape Brick",
      category: "building",
      description: "Brick variant of the L-shaped apartment block.",
      placement: {
        defaultHeight: URBAN_BUILDING_L_SIZE.y * 0.5,
        minScale: 1,
        maxScale: 1,
      },
      tags: ["urban", "building", "apartment", "lshape"],
      components: {
        render: {
          type: "model",
          format: "gltf",
          uri: "/assets/urban_models/Buildings%20Prebuild/flat_Lshape_brick.glb",
          modelOffset: makeVec3(-10.5, -8.5, -4.5),
        },
        physics: {
          body: "static",
          shape: {
            type: "compound",
            children: URBAN_L_SHAPE_COLLIDERS,
          },
        },
      },
    },
    urban_bus_stop: {
      id: "urban_bus_stop",
      name: "Urban Bus Stop",
      category: "prop",
      description: "Street-side bus stop shelter sized for sidewalk landmarks.",
      placement: {
        defaultHeight: 1.55,
        minScale: 1,
        maxScale: 1,
      },
      tags: ["urban", "prop", "landmark", "bus_stop"],
      components: {
        render: {
          type: "model",
          format: "gltf",
          uri: "/assets/urban_models/Bus%20stops/busstop.glb",
          modelOffset: makeVec3(0, -1.55, 0),
        },
        physics: {
          body: "static",
          shape: {
            type: "compound",
            children: [
              // back wall panel
              { shape: { type: "box", size: makeVec3(0.15, 2.6, 4.4) }, offset: makeVec3(-1.15, -0.25, 0) },
              // roof slab
              { shape: { type: "box", size: makeVec3(2.5, 0.12, 4.4) }, offset: makeVec3(0, 1.2, 0) },
              // left side panel
              { shape: { type: "box", size: makeVec3(2.0, 2.6, 0.1) }, offset: makeVec3(0.1, -0.25, -2.15) },
              // right side panel
              { shape: { type: "box", size: makeVec3(2.0, 2.6, 0.1) }, offset: makeVec3(0.1, -0.25, 2.15) },
            ],
          },
        },
      },
    },
    urban_bus_stop_clean: {
      id: "urban_bus_stop_clean",
      name: "Urban Bus Stop Clean",
      category: "prop",
      description: "Cleaner bus stop shelter for focal city landmarks.",
      placement: {
        defaultHeight: 1.55,
        minScale: 1,
        maxScale: 1,
      },
      tags: ["urban", "prop", "landmark", "bus_stop"],
      components: {
        render: {
          type: "model",
          format: "gltf",
          uri: "/assets/urban_models/Bus%20stops/busstop_clean_seats.glb",
          modelOffset: makeVec3(0, -1.533, 0),
        },
        physics: {
          body: "static",
          shape: {
            type: "compound",
            children: [
              // back wall panel
              { shape: { type: "box", size: makeVec3(0.15, 2.6, 4.4) }, offset: makeVec3(-1.15, -0.25, 0) },
              // roof slab
              { shape: { type: "box", size: makeVec3(2.5, 0.12, 4.4) }, offset: makeVec3(0, 1.2, 0) },
              // left side panel
              { shape: { type: "box", size: makeVec3(2.0, 2.6, 0.1) }, offset: makeVec3(0.1, -0.25, -2.15) },
              // right side panel
              { shape: { type: "box", size: makeVec3(2.0, 2.6, 0.1) }, offset: makeVec3(0.1, -0.25, 2.15) },
            ],
          },
        },
      },
    },
    urban_street_light: {
      id: "urban_street_light",
      name: "Urban Street Light",
      category: "prop",
      description: "Tall street light for road rhythm and night readability.",
      placement: {
        defaultHeight: 3.3,
        minScale: 1,
        maxScale: 1,
      },
      tags: ["urban", "prop", "street_light"],
      components: {
        render: {
          type: "model",
          format: "gltf",
          uri: "/assets/urban_models/Traffic%20lights/street_light.glb",
          modelOffset: makeVec3(-0.324, -3.304, -0.353),
        },
        physics: {
          body: "static",
          shape: {
            type: "cylinder",
            radius: 0.15,
            halfHeight: 3.3,
          },
        },
      },
    },
    urban_street_light_clean: {
      id: "urban_street_light_clean",
      name: "Urban Street Light Clean",
      category: "prop",
      description: "Cleaner street light variant for civic spots and plazas.",
      placement: {
        defaultHeight: 3.3,
        minScale: 1,
        maxScale: 1,
      },
      tags: ["urban", "prop", "street_light"],
      components: {
        render: {
          type: "model",
          format: "gltf",
          uri: "/assets/urban_models/Traffic%20lights/street_light_clean.glb",
          modelOffset: makeVec3(-0.324, -3.304, -0.353),
        },
        physics: {
          body: "static",
          shape: {
            type: "cylinder",
            radius: 0.15,
            halfHeight: 3.3,
          },
        },
      },
    },
    urban_traffic_light_pole: {
      id: "urban_traffic_light_pole",
      name: "Urban Traffic Light Pole",
      category: "prop",
      description: "Traffic pole marker for main intersections.",
      placement: {
        defaultHeight: 2.82,
        minScale: 1,
        maxScale: 1,
      },
      tags: ["urban", "prop", "traffic_light"],
      components: {
        render: {
          type: "model",
          format: "gltf",
          uri: "/assets/urban_models/Traffic%20lights/traffic_light_pole.glb",
          modelOffset: makeVec3(0.401, -2.814, -0.401),
        },
        physics: {
          body: "static",
          shape: {
            type: "cylinder",
            radius: 0.12,
            halfHeight: 2.82,
          },
        },
      },
    },
    urban_traffic_light: {
      id: "urban_traffic_light",
      name: "Urban Traffic Light",
      category: "prop",
      description: "Full traffic light head for visible intersections.",
      placement: {
        defaultHeight: 2.84,
        minScale: 1,
        maxScale: 1,
      },
      tags: ["urban", "prop", "traffic_light"],
      components: {
        render: {
          type: "model",
          format: "gltf",
          uri: "/assets/urban_models/Traffic%20lights/traffic_light.glb",
          modelOffset: makeVec3(0.268, -2.832, -0.402),
        },
        physics: {
          body: "static",
          shape: {
            type: "compound",
            children: [
              // pole
              { shape: { type: "cylinder", radius: 0.12, halfHeight: 2.2 }, offset: makeVec3(0, -0.6, 0) },
              // light head
              { shape: { type: "box", size: makeVec3(0.4, 1.0, 0.4) }, offset: makeVec3(0, 2.0, 0) },
            ],
          },
        },
      },
    },
    urban_jersey_barrier: {
      id: "urban_jersey_barrier",
      name: "Urban Jersey Barrier",
      category: "prop",
      description: "Concrete road barrier for checkpoints, blockades, and cover.",
      placement: {
        defaultHeight: 0.57,
        minScale: 1,
        maxScale: 1,
      },
      tags: ["urban", "prop", "cover", "barrier"],
      components: {
        render: {
          type: "model",
          format: "gltf",
          uri: "/assets/urban_runtime/props/jersey_barrier.glb",
          modelOffset: makeVec3(0, -0.568, 0),
        },
        physics: {
          body: "static",
          shape: {
            type: "box",
            size: makeVec3(2.5, 1.14, 0.82),
          },
        },
      },
    },
    urban_construction_cone: {
      id: "urban_construction_cone",
      name: "Urban Construction Cone",
      category: "prop",
      description: "Small construction cone for roadwork clusters.",
      placement: {
        defaultHeight: 0.38,
        minScale: 1,
        maxScale: 1,
      },
      tags: ["urban", "prop", "cone", "roadwork"],
      components: {
        render: {
          type: "model",
          format: "gltf",
          uri: "/assets/urban_runtime/props/construction_cone.glb",
          modelOffset: makeVec3(0, -0.38, 0),
        },
        physics: {
          body: "static",
          shape: {
            type: "box",
            size: makeVec3(0.55, 0.76, 0.55),
          },
        },
      },
    },
    urban_metal_fence: {
      id: "urban_metal_fence",
      name: "Urban Metal Fence",
      category: "prop",
      description: "Thin metal fence panel for alleys and blocked lots.",
      placement: {
        defaultHeight: 0.71,
        minScale: 1,
        maxScale: 1,
      },
      tags: ["urban", "prop", "fence"],
      components: {
        render: {
          type: "model",
          format: "gltf",
          uri: "/assets/urban_runtime/props/metal_fence.glb",
          modelOffset: makeVec3(-0.001, -0.71, 0.009),
        },
        physics: {
          body: "static",
          shape: {
            type: "box",
            size: makeVec3(2.7, 1.67, 0.08),
          },
        },
      },
    },
    urban_plaster_wall: {
      id: "urban_plaster_wall",
      name: "Urban Plaster Wall",
      category: "prop",
      description: "Low plaster divider useful for lot edges and courtyards.",
      placement: {
        defaultHeight: 0.38,
        minScale: 1,
        maxScale: 1,
      },
      tags: ["urban", "prop", "wall"],
      components: {
        render: {
          type: "model",
          format: "gltf",
          uri: "/assets/urban_runtime/props/plaster_wall.glb",
          modelOffset: makeVec3(1, -0.375, 0.02),
        },
        physics: {
          body: "static",
          shape: {
            type: "box",
            size: makeVec3(2, 0.75, 0.4),
          },
        },
      },
    },
    urban_dumpster_blue: {
      id: "urban_dumpster_blue",
      name: "Urban Dumpster Blue",
      category: "prop",
      description: "Large dumpster for alleys, service yards, and trash zones.",
      placement: {
        defaultHeight: 0.98,
        minScale: 1,
        maxScale: 1,
      },
      tags: ["urban", "prop", "trash", "dumpster"],
      components: {
        render: {
          type: "model",
          format: "gltf",
          uri: "/assets/urban_models/Litter/Dumpsters/dumpster_lid_closed_blue.glb",
          modelOffset: makeVec3(0, -0.982, 0),
        },
        physics: {
          body: "static",
          shape: {
            type: "box",
            size: makeVec3(2.06, 1.96, 3.68),
          },
        },
      },
    },
    urban_trash_can: {
      id: "urban_trash_can",
      name: "Urban Trash Can",
      category: "prop",
      description: "Overflowing public trash can for sidewalks and bus stops.",
      placement: {
        defaultHeight: 0.89,
        minScale: 1,
        maxScale: 1,
      },
      tags: ["urban", "prop", "trash"],
      components: {
        render: {
          type: "model",
          format: "gltf",
          uri: "/assets/urban_models/Litter/TrashCan/trash_can_overflowing.glb",
          modelOffset: makeVec3(-0.011, -0.889, 0),
        },
        physics: {
          body: "static",
          shape: {
            type: "cylinder",
            radius: 0.3,
            halfHeight: 0.89,
          },
        },
      },
    },
    urban_metal_trashcan: {
      id: "urban_metal_trashcan",
      name: "Urban Metal Trashcan",
      category: "prop",
      description: "Dirty metal street trashcan for alley clutter and curbside detail.",
      placement: {
        defaultHeight: 0.55,
        minScale: 1,
        maxScale: 1,
      },
      tags: ["urban", "prop", "trash"],
      components: {
        render: {
          type: "model",
          format: "gltf",
          uri: "/assets/urban_models/Litter/Metal%20trashcan/metaltrashcan_open_dirty.glb",
          modelOffset: makeVec3(0, -0.549, 0),
        },
        physics: {
          body: "static",
          shape: {
            type: "cylinder",
            radius: 0.25,
            halfHeight: 0.55,
          },
        },
      },
    },
    urban_trash_bag: {
      id: "urban_trash_bag",
      name: "Urban Trash Bag",
      category: "prop",
      description: "Loose trash bag for alleys and lot corners.",
      placement: {
        defaultHeight: 0.52,
        minScale: 1,
        maxScale: 1,
      },
      tags: ["urban", "prop", "trash"],
      components: {
        render: {
          type: "model",
          format: "gltf",
          uri: "/assets/urban_models/Litter/Trash/trashbag_2.glb",
          modelOffset: makeVec3(0, -0.521, 0.006),
        },
        physics: {
          body: "static",
          shape: {
            type: "sphere",
            radius: 0.35,
          },
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
      {
        id: "objective.extract",
        name: "Extraction Beacon",
        kind: "objective",
        shape: {
          type: "sphere",
          radius: 5,
        },
        transform: {
          position: makeVec3(16, 1, -10),
        },
        tags: ["objective", "extract"],
      },
    ],
    objectives: [
      {
        id: "objective.supply_run",
        name: "Supply Run",
        description: "Grab medical supplies and get back to the outpost.",
        steps: [
          {
            id: "objective.supply_run.collect",
            kind: "collect_loot",
            description: "Collect 1 bandage from a loot crate",
            targetCount: 1,
            itemIds: ["bandage"],
          },
          {
            id: "objective.supply_run.extract",
            kind: "reach_zone",
            description: "Reach the extraction beacon",
            zoneId: "objective.extract",
          },
        ],
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
    objectives: [
      {
        id: "objective.outpost_supply_sweep",
        name: "Outpost Supply Sweep",
        description: "Collect two bandages, then make it back to the center safe zone.",
        steps: [
          {
            id: "objective.outpost_supply_sweep.collect",
            kind: "collect_loot",
            description: "Collect 2 bandages from loot crates",
            targetCount: 2,
            itemIds: ["bandage"],
          },
          {
            id: "objective.outpost_supply_sweep.extract",
            kind: "reach_zone",
            description: "Reach the center safe zone",
            zoneId: "safe.center",
          },
        ],
      },
    ],
    simulation: {
      sectorPools: [],
      sectorStates: [],
    },
  };
}

export function makeTownGridWorld(
  options: Partial<FlatWorldOptions> = {},
): WorldDocument {
  const config = { ...defaultFlatWorldOptions, ...options };
  const random = createMulberry32(config.seed * 17 + 5);
  const worldSize = config.worldHalfExtent * 2;
  const roadSpan = Math.max(26, Math.min(config.worldHalfExtent * 0.72, 56));
  const roadOffsets = [-roadSpan, 0, roadSpan];
  const buildings: EntitySpec[] = [];
  const crates: EntitySpec[] = [];
  const zombies: EntitySpec[] = [];
  const zones: ZoneSpec[] = [
    {
      id: "safe.plaza",
      name: "Central Plaza",
      kind: "safe",
      shape: {
        type: "sphere",
        radius: 14,
      },
      transform: {
        position: makeVec3(0, 1, 0),
      },
      tags: ["starter", "safe"],
    },
  ];

  const roadEntities = roadOffsets.flatMap((offset, index) => ([
    {
      id: `town.road.ns.${index + 1}`,
      name: `Town North South Road ${index + 1}`,
      prefabId: "road_strip",
      transform: {
        position: makeVec3(offset, 0.1, 0),
        scale: makeVec3(1, 1, worldSize / 4),
      },
    },
    {
      id: `town.road.ew.${index + 1}`,
      name: `Town East West Road ${index + 1}`,
      prefabId: "road_strip",
      transform: {
        position: makeVec3(0, 0.1, offset),
        rotation: makeVec3(0, Math.PI * 0.5, 0),
        scale: makeVec3(1, 1, worldSize / 4),
      },
    },
  ]));

  const blockCenters: Array<{ x: number; z: number }> = [];
  for (let gridX = -1; gridX <= 1; gridX += 1) {
    for (let gridZ = -1; gridZ <= 1; gridZ += 1) {
      if (gridX === 0 && gridZ === 0) {
        continue;
      }
      blockCenters.push({
        x: gridX * roadSpan * 0.68,
        z: gridZ * roadSpan * 0.68,
      });
    }
  }

  blockCenters.slice(0, Math.max(config.buildingCount, 1)).forEach((center, index) => {
    const isWarehouse = random() > 0.58;
    buildings.push({
      id: `town.building.${index + 1}`,
      name: isWarehouse ? `Town Warehouse ${index + 1}` : `Town Shack ${index + 1}`,
      prefabId: isWarehouse ? "warehouse_building" : "shack_building",
      transform: {
        position: makeVec3(
          center.x + ((random() - 0.5) * (isWarehouse ? 4.5 : 5.5)),
          isWarehouse ? 2.5 : 1.6,
          center.z + ((random() - 0.5) * (isWarehouse ? 4.5 : 5.5)),
        ),
        rotation: makeVec3(0, pickQuarterTurn(random), 0),
        scale: isWarehouse
          ? makeVec3(0.95 + random() * 0.35, 1, 0.95 + random() * 0.35)
          : makeVec3(0.85 + random() * 0.25, 1, 0.85 + random() * 0.25),
      },
    });
    if (crates.length < config.crateCount) {
      crates.push({
        id: `town.crate.${crates.length + 1}`,
        name: `Town Loot Crate ${crates.length + 1}`,
        prefabId: "loot_crate",
        transform: {
          position: makeVec3(center.x + 3, 0.5, center.z - 2),
        },
      });
    }
  });

  while (crates.length < config.crateCount) {
    const position = sampleRingPosition(random, 12, config.worldHalfExtent - 8);
    crates.push({
      id: `town.crate.${crates.length + 1}`,
      name: `Town Loot Crate ${crates.length + 1}`,
      prefabId: "loot_crate",
      transform: {
        position: makeVec3(position.x, 0.5, position.z),
      },
    });
  }

  for (let index = 0; index < config.zombieCount; index += 1) {
    const lane = roadOffsets[index % roadOffsets.length];
    const along = -config.worldHalfExtent * 0.8 + (((index + 1) / (config.zombieCount + 1)) * worldSize * 0.8);
    const axis = index % 2 === 0;
    const x = axis ? lane + ((random() - 0.5) * 3) : along;
    const z = axis ? along : lane + ((random() - 0.5) * 3);
    const homeZoneId = `town.spawn.${(index % 4) + 1}`;
    zombies.push(makeZombieEntity(`town.zombie.${index + 1}`, makeVec3(x, 1.1, z), homeZoneId));
  }

  zones.push(
    makeSpawnZone("town.spawn.1", "North Street Encounter", makeVec3(0, 1, -roadSpan), makeVec3(24, 2, 12)),
    makeSpawnZone("town.spawn.2", "East Street Encounter", makeVec3(roadSpan, 1, 0), makeVec3(12, 2, 24)),
    makeSpawnZone("town.spawn.3", "South Street Encounter", makeVec3(0, 1, roadSpan), makeVec3(24, 2, 12)),
    makeSpawnZone("town.spawn.4", "West Street Encounter", makeVec3(-roadSpan, 1, 0), makeVec3(12, 2, 24)),
    {
      id: "town.objective.plaza",
      name: "Plaza Objective",
      kind: "objective",
      shape: {
        type: "sphere",
        radius: 10,
      },
      transform: {
        position: makeVec3(0, 1, 0),
      },
      tags: ["objective", "plaza"],
    },
  );

  return {
    metadata: {
      id: `groundtruth.world.town_grid.${config.seed}`,
      name: `Town Grid Seed ${config.seed}`,
      description: "Procedurally assembled town-like grid with roads, blocks, loot pockets, and zombie patrol lanes.",
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
      makePlayerEntity(makeVec3(0, 1.2, -10)),
      ...roadEntities,
      ...buildings,
      ...crates,
      ...zombies,
    ],
    zones,
    objectives: [
      {
        id: "objective.town_supply_sweep",
        name: "Town Supply Sweep",
        description: "Scavenge medical supplies, then get to the plaza.",
        steps: [
          {
            id: "objective.town_supply_sweep.collect",
            kind: "collect_loot",
            description: "Collect 2 bandages from town crates",
            targetCount: 2,
            itemIds: ["bandage"],
          },
          {
            id: "objective.town_supply_sweep.extract",
            kind: "reach_zone",
            description: "Reach the plaza objective zone",
            zoneId: "town.objective.plaza",
          },
        ],
      },
    ],
    simulation: {
      sectorPools: [],
      sectorStates: [],
    },
  };
}

export function makeUrbanCityWorld(
  options: Partial<FlatWorldOptions> = {},
): WorldDocument {
  const config = {
    ...defaultFlatWorldOptions,
    worldHalfExtent: Math.max(options.worldHalfExtent ?? defaultFlatWorldOptions.worldHalfExtent, 96),
    buildingCount: Math.max(options.buildingCount ?? defaultFlatWorldOptions.buildingCount, 12),
    zombieCount: Math.max(options.zombieCount ?? defaultFlatWorldOptions.zombieCount, 20),
    crateCount: Math.max(options.crateCount ?? defaultFlatWorldOptions.crateCount, 8),
    seed: options.seed ?? defaultFlatWorldOptions.seed,
  };
  const random = createMulberry32(config.seed * 31 + 19);
  const worldSize = config.worldHalfExtent * 2;
  const roadLines = [-48, 0, 48];
  const tileCoords = [-64, -48, -32, -16, 0, 16, 32, 48, 64];
  const buildings: EntitySpec[] = [];
  const roads: EntitySpec[] = [];
  const props: EntitySpec[] = [];
  const crates: EntitySpec[] = [];
  const zombies: EntitySpec[] = [];
  const zones: ZoneSpec[] = [
    {
      id: "urban.safe.hub",
      name: "Bus Depot Hub",
      kind: "safe",
      shape: {
        type: "sphere",
        radius: 10,
      },
      transform: {
        position: makeVec3(-72, 1, -56),
      },
      tags: ["safe", "start", "urban"],
    },
    {
      id: "urban.extract.east",
      name: "East Evac Stop",
      kind: "objective",
      shape: {
        type: "sphere",
        radius: 6,
      },
      transform: {
        position: makeVec3(72, 1, 56),
      },
      tags: ["objective", "extract", "urban"],
    },
    makeSpawnZone("urban.spawn.north", "North Avenue", makeVec3(0, 1, -64), makeVec3(48, 2, 16)),
    makeSpawnZone("urban.spawn.east", "East Blocks", makeVec3(64, 1, 0), makeVec3(16, 2, 48)),
    makeSpawnZone("urban.spawn.south", "South Avenue", makeVec3(0, 1, 64), makeVec3(48, 2, 16)),
    makeSpawnZone("urban.spawn.west", "West Blocks", makeVec3(-64, 1, 0), makeVec3(16, 2, 48)),
  ];

  for (const roadX of roadLines) {
    for (const z of tileCoords) {
      roads.push(makeUrbanRoadEntity(`urban.road.ns.${roadX}.${z}`, roadX, z, false, roadLines.includes(z)));
    }
  }
  for (const roadZ of roadLines) {
    for (const x of tileCoords) {
      if (roadLines.includes(x)) {
        continue;
      }
      roads.push(makeUrbanRoadEntity(`urban.road.ew.${x}.${roadZ}`, x, roadZ, true, false));
    }
  }

  const lotPatterns = [
    { x: -24, z: -24, prefabId: "urban_flat_square_brick", yaw: 0 },
    { x: 24, z: -24, prefabId: "urban_flat_square_concrete", yaw: Math.PI * 0.5 },
    { x: -24, z: 24, prefabId: "urban_flat_square_concrete_alt", yaw: Math.PI },
    { x: 24, z: 24, prefabId: "urban_flat_square_brick_alt", yaw: Math.PI * 1.5 },
    { x: -72, z: -24, prefabId: "urban_flat_lshape", yaw: 0 },
    { x: 72, z: -24, prefabId: "urban_flat_lshape_brick", yaw: Math.PI * 0.5 },
    { x: -72, z: 24, prefabId: "urban_flat_lshape_brick", yaw: Math.PI * 1.5 },
    { x: 72, z: 24, prefabId: "urban_flat_lshape", yaw: Math.PI },
    { x: -24, z: -72, prefabId: "urban_flat_square_brick_alt", yaw: Math.PI * 0.5 },
    { x: 24, z: -72, prefabId: "urban_flat_square_concrete_alt", yaw: Math.PI },
    { x: -24, z: 72, prefabId: "urban_flat_square_concrete", yaw: 0 },
    { x: 24, z: 72, prefabId: "urban_flat_square_brick", yaw: Math.PI * 1.5 },
  ];
  lotPatterns.slice(0, config.buildingCount).forEach((lot, index) => {
    const halfHeight = lot.prefabId === "urban_flat_lshape"
      ? URBAN_BUILDING_L_SIZE.y * 0.5
      : URBAN_BUILDING_SQUARE_SIZE.y * 0.5;
    buildings.push({
      id: `urban.building.${index + 1}`,
      name: `Urban Block ${index + 1}`,
      prefabId: lot.prefabId,
      transform: {
        position: makeVec3(lot.x, halfHeight, lot.z),
        rotation: makeVec3(0, lot.yaw, 0),
      },
    });
  });

  const cratePositions = [
    makeVec3(-56, 0.5, -40),
    makeVec3(-10, 0.5, -40),
    makeVec3(40, 0.5, -56),
    makeVec3(-40, 0.5, 10),
    makeVec3(40, 0.5, 8),
    makeVec3(-8, 0.5, 56),
    makeVec3(56, 0.5, 40),
    makeVec3(8, 0.5, 40),
  ];
  cratePositions.slice(0, config.crateCount).forEach((position, index) => {
    crates.push({
      id: `urban.crate.${index + 1}`,
      name: `Urban Supply Crate ${index + 1}`,
      prefabId: "loot_crate",
      transform: {
        position,
        rotation: makeVec3(0, pickQuarterTurn(random), 0),
      },
    });
  });

  [
    { id: "urban.busstop.start", prefabId: "urban_bus_stop_clean", position: makeVec3(-68, 1.55, -56), yaw: Math.PI * 0.5 },
    { id: "urban.busstop.extract", prefabId: "urban_bus_stop", position: makeVec3(68, 1.55, 56), yaw: Math.PI * 1.5 },
    { id: "urban.light.center.1", prefabId: "urban_street_light_clean", position: makeVec3(-8, 3.3, -56), yaw: 0 },
    { id: "urban.light.center.2", prefabId: "urban_street_light", position: makeVec3(8, 3.3, -56), yaw: 0 },
    { id: "urban.light.center.3", prefabId: "urban_street_light", position: makeVec3(-8, 3.3, 56), yaw: 0 },
    { id: "urban.light.center.4", prefabId: "urban_street_light_clean", position: makeVec3(8, 3.3, 56), yaw: 0 },
    { id: "urban.traffic.1", prefabId: "urban_traffic_light", position: makeVec3(-7, 2.84, -7), yaw: 0 },
    { id: "urban.traffic.2", prefabId: "urban_traffic_light", position: makeVec3(7, 2.84, -7), yaw: Math.PI * 0.5 },
    { id: "urban.traffic.3", prefabId: "urban_traffic_light", position: makeVec3(7, 2.84, 7), yaw: Math.PI },
    { id: "urban.traffic.4", prefabId: "urban_traffic_light", position: makeVec3(-7, 2.84, 7), yaw: Math.PI * 1.5 },
    { id: "urban.dumpster.1", prefabId: "urban_dumpster_blue", position: makeVec3(-59, 0.98, -34), yaw: 0 },
    { id: "urban.dumpster.2", prefabId: "urban_dumpster_blue", position: makeVec3(55, 0.98, 33), yaw: Math.PI },
    { id: "urban.trashcan.1", prefabId: "urban_trash_can", position: makeVec3(-66, 0.89, -52), yaw: 0 },
    { id: "urban.trashcan.2", prefabId: "urban_trash_can", position: makeVec3(66, 0.89, 52), yaw: Math.PI },
    { id: "urban.metalcan.1", prefabId: "urban_metal_trashcan", position: makeVec3(-41, 0.55, 11), yaw: 0 },
    { id: "urban.metalcan.2", prefabId: "urban_metal_trashcan", position: makeVec3(39, 0.55, 9), yaw: 0 },
    { id: "urban.trashbag.1", prefabId: "urban_trash_bag", position: makeVec3(-57, 0.52, -31), yaw: 0 },
    { id: "urban.trashbag.2", prefabId: "urban_trash_bag", position: makeVec3(57, 0.52, 36), yaw: Math.PI * 0.25 },
    { id: "urban.barrier.1", prefabId: "urban_jersey_barrier", position: makeVec3(-4, 0.57, -20), yaw: Math.PI * 0.5 },
    { id: "urban.barrier.2", prefabId: "urban_jersey_barrier", position: makeVec3(4, 0.57, -20), yaw: Math.PI * 0.5 },
    { id: "urban.barrier.3", prefabId: "urban_jersey_barrier", position: makeVec3(-4, 0.57, 20), yaw: Math.PI * 0.5 },
    { id: "urban.barrier.4", prefabId: "urban_jersey_barrier", position: makeVec3(4, 0.57, 20), yaw: Math.PI * 0.5 },
    { id: "urban.cone.1", prefabId: "urban_construction_cone", position: makeVec3(-7, 0.38, -23), yaw: 0 },
    { id: "urban.cone.2", prefabId: "urban_construction_cone", position: makeVec3(-1.5, 0.38, -23), yaw: 0 },
    { id: "urban.cone.3", prefabId: "urban_construction_cone", position: makeVec3(1.5, 0.38, 23), yaw: 0 },
    { id: "urban.cone.4", prefabId: "urban_construction_cone", position: makeVec3(7, 0.38, 23), yaw: 0 },
    { id: "urban.fence.1", prefabId: "urban_metal_fence", position: makeVec3(-34, 0.71, -15), yaw: 0 },
    { id: "urban.fence.2", prefabId: "urban_metal_fence", position: makeVec3(-31.3, 0.71, -15), yaw: 0 },
    { id: "urban.fence.3", prefabId: "urban_metal_fence", position: makeVec3(34, 0.71, 15), yaw: Math.PI },
    { id: "urban.fence.4", prefabId: "urban_metal_fence", position: makeVec3(31.3, 0.71, 15), yaw: Math.PI },
    { id: "urban.wall.1", prefabId: "urban_plaster_wall", position: makeVec3(-14, 0.38, -33), yaw: Math.PI * 0.5 },
    { id: "urban.wall.2", prefabId: "urban_plaster_wall", position: makeVec3(14, 0.38, 33), yaw: Math.PI * 1.5 },
  ].forEach((prop) => {
    props.push({
      id: prop.id,
      name: prop.id.replaceAll(".", " "),
      prefabId: prop.prefabId,
      transform: {
        position: prop.position,
        rotation: makeVec3(0, prop.yaw, 0),
      },
    });
  });

  const zombieLanes = [
    { axis: "x", fixed: -48, min: -64, max: 64, homeZoneId: "urban.spawn.north" },
    { axis: "x", fixed: 0, min: -64, max: 64, homeZoneId: "urban.spawn.south" },
    { axis: "x", fixed: 48, min: -64, max: 64, homeZoneId: "urban.spawn.east" },
    { axis: "z", fixed: -48, min: -64, max: 64, homeZoneId: "urban.spawn.west" },
    { axis: "z", fixed: 0, min: -64, max: 64, homeZoneId: "urban.spawn.east" },
    { axis: "z", fixed: 48, min: -64, max: 64, homeZoneId: "urban.spawn.south" },
  ] as const;
  for (let index = 0; index < config.zombieCount; index += 1) {
    const lane = zombieLanes[index % zombieLanes.length];
    const along = lane.min + (((index + 1) / (config.zombieCount + 1)) * (lane.max - lane.min));
    const jitter = (random() - 0.5) * 2.6;
    const position = lane.axis === "x"
      ? makeVec3(lane.fixed + jitter, 1.1, along)
      : makeVec3(along, 1.1, lane.fixed + jitter);
    zombies.push(makeZombieEntity(`urban.zombie.${index + 1}`, position, lane.homeZoneId));
  }

  return {
    metadata: {
      id: `groundtruth.world.urban_city.${config.seed}`,
      name: `Urban City Seed ${config.seed}`,
      description: "Dense urban city slice built from the URBAN kit's 16x16 roads, prebuilt flats, and street props.",
    },
    gameMode: "open_world",
    settings: {
      gravity: makeVec3(0, -9.81, 0),
      ambientLight: "#8693a5",
      skyColor: "#d2dae3",
      fogColor: "#c8d0d8",
      fogDensity: 0.01,
      gridSize: Math.max(260, worldSize + 32),
      sectorSize: 24,
    },
    prefabs: createDefaultPrefabs(),
    entities: [
      makeGroundEntity(worldSize),
      makePlayerEntity(makeVec3(-72, 1.2, -56)),
      ...roads,
      ...buildings,
      ...props,
      ...crates,
      ...zombies,
    ],
    zones,
    objectives: [
      {
        id: "objective.urban_supply_run",
        name: "Cross-City Supply Run",
        description: "Scavenge medical supplies in the blocks, then reach the east evac stop.",
        steps: [
          {
            id: "objective.urban_supply_run.collect",
            kind: "collect_loot",
            description: "Collect 3 bandages from city crates",
            targetCount: 3,
            itemIds: ["bandage"],
          },
          {
            id: "objective.urban_supply_run.extract",
            kind: "reach_zone",
            description: "Reach the East Evac Stop",
            zoneId: "urban.extract.east",
          },
        ],
      },
    ],
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

function makeUrbanRoadEntity(
  id: string,
  x: number,
  z: number,
  horizontal: boolean,
  junction: boolean,
): EntitySpec {
  return {
    id,
    name: junction ? `Urban Junction ${x}/${z}` : `Urban Road ${x}/${z}`,
    prefabId: junction ? "urban_road_junction" : "urban_road_straight",
    transform: {
      position: makeVec3(x, URBAN_ROAD_TILE_THICKNESS * 0.5, z),
      rotation: makeVec3(0, horizontal ? Math.PI * 0.5 : 0, 0),
    },
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
