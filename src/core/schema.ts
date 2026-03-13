export type GameMode =
  | "third_person_survival"
  | "open_world"
  | "first_person"
  | "third_person"
  | "top_down"
  | "action"
  | "rpg"
  | "rts"
  | "fighting"
  | "moba"
  | "puzzle"
  | "platformer"
  | "driving"
  | "racing"
  | "city_builder"
  | "tower_defense"
  | "roguelike";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Rotation3 {
  x: number;
  y: number;
  z: number;
}

export interface Transform {
  position: Vec3;
  rotation?: Rotation3;
  scale?: Vec3;
}

export interface PrimitiveRenderComponent {
  type: "primitive";
  primitive: "box" | "sphere" | "capsule" | "cylinder" | "plane";
  size?: Vec3;
  radius?: number;
  height?: number;
  color: string;
  opacity?: number;
  wireframe?: boolean;
}

export interface ModelRenderComponent {
  type: "model";
  uri: string;
  debugColor?: string;
  format?: "gltf" | "fbx";
  clips?: Record<string, string>;
  animationSources?: Record<string, string>;
  modelScale?: Vec3;
  modelOffset?: Vec3;
  modelRotation?: Rotation3;
}

export type RenderComponent = PrimitiveRenderComponent | ModelRenderComponent;

export type AnimationLoopMode = "repeat" | "once";

export interface AnimationComponent {
  state: string;
  speed?: number;
  loop?: AnimationLoopMode;
  fadeSeconds?: number;
}

export interface ActionDefinition {
  state: string;
  speed?: number;
  loop?: AnimationLoopMode;
  fadeSeconds?: number;
  fallbackSeconds?: number;
  lockMovement?: boolean;
}

export type ActionSetComponent = Record<string, ActionDefinition>;

export interface PhysicsBoxShape {
  type: "box";
  size: Vec3;
}

export interface PhysicsSphereShape {
  type: "sphere";
  radius: number;
}

export interface PhysicsCapsuleShape {
  type: "capsule";
  radius: number;
  halfHeight: number;
}

export type PhysicsShape =
  | PhysicsBoxShape
  | PhysicsSphereShape
  | PhysicsCapsuleShape;

export interface PhysicsComponent {
  body: "static" | "dynamic" | "kinematic";
  shape: PhysicsShape;
  sensor?: boolean;
}

export interface CharacterComponent {
  movementStyle: "first_person" | "third_person" | "top_down";
  moveSpeed: number;
  sprintSpeed?: number;
  jumpSpeed?: number;
}

export interface HealthComponent {
  current: number;
  max: number;
}

export interface InventoryComponent {
  maxSlots: number;
  itemIds: string[];
}

export interface CombatComponent {
  damage: number;
  range: number;
  cooldownSeconds: number;
  targetTags?: string[];
}

export interface InteractionComponent {
  kind: "loot" | "door" | "switch" | "talk";
  radius: number;
  prompt: string;
}

export interface BrainComponent {
  archetype: "player" | "zombie" | "civilian" | "turret" | "collector";
  aggroRadius?: number;
  homeZoneId?: string;
  activityRadius?: number;
  sleepRadius?: number;
  farThinkIntervalSeconds?: number;
}

export interface CameraRigComponent {
  mode: "follow" | "first_person" | "top_down" | "isometric" | "free";
  distance?: number;
  pitch?: number;
  yaw?: number;
}

export interface EntityComponents {
  render?: RenderComponent;
  animation?: AnimationComponent;
  actions?: ActionSetComponent;
  physics?: PhysicsComponent;
  character?: CharacterComponent;
  health?: HealthComponent;
  inventory?: InventoryComponent;
  combat?: CombatComponent;
  interaction?: InteractionComponent;
  brain?: BrainComponent;
  cameraRig?: CameraRigComponent;
}

export type PrefabCategory =
  | "terrain"
  | "road"
  | "actor"
  | "building"
  | "loot"
  | "prop"
  | "other";

export interface PrefabPlacementHints {
  defaultHeight?: number;
  minScale?: number;
  maxScale?: number;
}

export interface PrefabSpec {
  id: string;
  name: string;
  category?: PrefabCategory;
  description?: string;
  placement?: PrefabPlacementHints;
  tags?: string[];
  transform?: Partial<Transform>;
  components?: EntityComponents;
}

export interface EntitySpec {
  id: string;
  name: string;
  prefabId?: string;
  tags?: string[];
  transform: Transform;
  components?: EntityComponents;
}

export interface BoxZoneShape {
  type: "box";
  size: Vec3;
}

export interface SphereZoneShape {
  type: "sphere";
  radius: number;
}

export type ZoneShape = BoxZoneShape | SphereZoneShape;

export interface ZoneSpec {
  id: string;
  name: string;
  kind: "spawn" | "loot" | "safe" | "encounter" | "objective" | "trigger";
  shape: ZoneShape;
  transform: Transform;
  tags?: string[];
}

export interface WorldMetadata {
  id: string;
  name: string;
  description: string;
}

export interface WorldSettings {
  gravity: Vec3;
  ambientLight: string;
  skyColor: string;
  fogColor: string;
  fogDensity: number;
  gridSize: number;
  sectorSize: number;
}

export interface SectorPoolSnapshot {
  sectorKey: string;
  prefabId: string;
  count: number;
  homeZoneId?: string;
  groundY: number;
}

export type SectorLifecycleState = "active" | "dormant" | "recent" | "depleted";

export type SectorPopulationTrend = "growing" | "stable" | "shrinking";

export interface SectorStateSnapshot {
  sectorKey: string;
  status: SectorLifecycleState;
  pooledCount: number;
  dormantCount: number;
  liveCount: number;
  recentSeconds: number;
  offlineSeconds: number;
  trend: SectorPopulationTrend;
  pressure: number;
  depletion: number;
}

export interface WorldSimulationState {
  sectorPools: SectorPoolSnapshot[];
  sectorStates: SectorStateSnapshot[];
}

export interface WorldDocument {
  metadata: WorldMetadata;
  gameMode: GameMode;
  settings: WorldSettings;
  prefabs: Record<string, PrefabSpec>;
  entities: EntitySpec[];
  zones: ZoneSpec[];
  simulation: WorldSimulationState;
}

export interface ResolvedEntity extends EntitySpec {
  tags: string[];
  components: EntityComponents;
}

export interface WorldDiagnostics {
  worldName: string;
  gameMode: GameMode;
  entityCount: number;
  zoneCount: number;
  prefabCount: number;
  renderableCount: number;
  physicsBodyCount: number;
  modelReferenceCount: number;
  animationControllerCount: number;
  combatantCount: number;
  interactiveCount: number;
  occupiedSectorCount: number;
  simulatedSectorCount: number;
  pooledActorCount: number;
}

export function makeVec3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

export function cloneWorld(world: WorldDocument): WorldDocument {
  return JSON.parse(JSON.stringify(world)) as WorldDocument;
}

export function emptyWorld(): WorldDocument {
  return {
    metadata: {
      id: "groundtruth.world.empty",
      name: "Empty Groundtruth World",
      description: "Minimal semantic world document.",
    },
    gameMode: "third_person_survival",
    settings: {
      gravity: makeVec3(0, -9.81, 0),
      ambientLight: "#9bb2c7",
      skyColor: "#d6e6f2",
      fogColor: "#dfe7ef",
      fogDensity: 0.008,
      gridSize: 160,
      sectorSize: 24,
    },
    prefabs: {},
    entities: [],
    zones: [],
    simulation: {
      sectorPools: [],
      sectorStates: [],
    },
  };
}

export function resolveEntity(
  world: WorldDocument,
  entity: EntitySpec,
): ResolvedEntity {
  const prefab = entity.prefabId ? world.prefabs[entity.prefabId] : undefined;
  const tags = [...new Set([...(prefab?.tags ?? []), ...(entity.tags ?? [])])];

  return {
    ...entity,
    tags,
    transform: {
      position: { ...entity.transform.position },
      rotation: {
        x: entity.transform.rotation?.x ?? prefab?.transform?.rotation?.x ?? 0,
        y: entity.transform.rotation?.y ?? prefab?.transform?.rotation?.y ?? 0,
        z: entity.transform.rotation?.z ?? prefab?.transform?.rotation?.z ?? 0,
      },
      scale: {
        x: entity.transform.scale?.x ?? prefab?.transform?.scale?.x ?? 1,
        y: entity.transform.scale?.y ?? prefab?.transform?.scale?.y ?? 1,
        z: entity.transform.scale?.z ?? prefab?.transform?.scale?.z ?? 1,
      },
    },
    components: {
      ...prefab?.components,
      ...entity.components,
    },
  };
}

export function computeDiagnostics(world: WorldDocument): WorldDiagnostics {
  let renderableCount = 0;
  let physicsBodyCount = 0;
  let modelReferenceCount = 0;
  let animationControllerCount = 0;
  let combatantCount = 0;
  let interactiveCount = 0;
  const occupiedSectors = new Set<string>();
  let pooledActorCount = 0;

  for (const entity of world.entities.map((item) => resolveEntity(world, item))) {
    if (entity.components.render) {
      renderableCount += 1;
      if (entity.components.render.type === "model") {
        modelReferenceCount += 1;
      }
    }
    if (entity.components.animation) {
      animationControllerCount += 1;
    }
    if (entity.components.combat) {
      combatantCount += 1;
    }
    if (entity.components.interaction) {
      interactiveCount += 1;
    }
    if (entity.components.physics) {
      physicsBodyCount += 1;
    }
    occupiedSectors.add(sectorKeyForPoint(entity.transform.position, world.settings.sectorSize));
  }

  for (const pool of world.simulation.sectorPools) {
    pooledActorCount += pool.count;
  }

  return {
    worldName: world.metadata.name,
    gameMode: world.gameMode,
    entityCount: world.entities.length,
    zoneCount: world.zones.length,
    prefabCount: Object.keys(world.prefabs).length,
    renderableCount,
    physicsBodyCount,
    modelReferenceCount,
    animationControllerCount,
    combatantCount,
    interactiveCount,
    occupiedSectorCount: occupiedSectors.size,
    simulatedSectorCount: world.simulation.sectorStates.length,
    pooledActorCount,
  };
}

export interface SectorCoord {
  x: number;
  z: number;
}

export function sectorCoordForPoint(point: Vec3, sectorSize: number): SectorCoord {
  const safeSectorSize = Math.max(1, sectorSize);
  return {
    x: Math.floor(point.x / safeSectorSize),
    z: Math.floor(point.z / safeSectorSize),
  };
}

export function sectorKeyFromCoord(coord: SectorCoord): string {
  return `${coord.x}:${coord.z}`;
}

export function sectorKeyForPoint(point: Vec3, sectorSize: number): string {
  return sectorKeyFromCoord(sectorCoordForPoint(point, sectorSize));
}
