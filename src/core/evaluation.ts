import {
  PhysicsShape,
  ResolvedEntity,
  Vec3,
  WorldDocument,
  ZoneSpec,
  resolveEntity,
  sectorKeyForPoint,
} from "./schema";

export type EvaluationSeverity = "info" | "warn" | "error";

export interface EvaluationFinding {
  severity: EvaluationSeverity;
  code: string;
  message: string;
}

export interface EvaluationReport {
  findings: EvaluationFinding[];
  counts: Record<EvaluationSeverity, number>;
}

interface ReachabilityGrid {
  minX: number;
  minZ: number;
  cellSize: number;
  width: number;
  height: number;
  blocked: boolean[];
  reachable: boolean[];
}

export function evaluateWorld(world: WorldDocument): EvaluationReport {
  const findings: EvaluationFinding[] = [];
  const entities = world.entities.map((entity) => resolveEntity(world, entity));
  const player = entities.find((entity) => entity.id === "player");
  const spawnZones = world.zones.filter((zone) => zone.kind === "spawn");
  const safeZones = world.zones.filter((zone) => zone.kind === "safe");
  const zombies = entities.filter((entity) => entity.components.brain?.archetype === "zombie");
  const lootEntities = entities.filter(
    (entity) => entity.components.interaction?.kind === "loot",
  );

  for (const entity of entities) {
    validateEntityContract(entity, findings);
  }

  if (!player) {
    findings.push({
      severity: "error",
      code: "player_missing",
      message: "World has no player entity.",
    });
  }

  if (zombies.length === 0) {
    findings.push({
      severity: "warn",
      code: "no_enemies",
      message: "World contains no zombie enemies.",
    });
  }

  if (lootEntities.length === 0) {
    findings.push({
      severity: "warn",
      code: "no_loot",
      message: "World contains no loot interactables.",
    });
  }

  evaluateSceneryOverlaps(entities, findings);
  evaluateZones(world, entities, player ?? null, spawnZones, safeZones, findings);
  evaluateSectorDensity(world, entities, findings);
  evaluateSimulationSectors(world, findings);
  if (player) {
    evaluateReachability(entities, player, spawnZones, safeZones, lootEntities, findings);
  }

  const counts = {
    info: findings.filter((finding) => finding.severity === "info").length,
    warn: findings.filter((finding) => finding.severity === "warn").length,
    error: findings.filter((finding) => finding.severity === "error").length,
  };

  if (findings.length === 0) {
    findings.push({
      severity: "info",
      code: "world_ok",
      message: "No immediate evaluation findings.",
    });
    counts.info += 1;
  }

  return {
    findings,
    counts,
  };
}

function evaluateSectorDensity(
  world: WorldDocument,
  entities: ResolvedEntity[],
  findings: EvaluationFinding[],
): void {
  const sectorTotals = new Map<string, number>();
  const zombieTotals = new Map<string, number>();

  for (const entity of entities) {
    const sectorKey = sectorKeyForPoint(entity.transform.position, world.settings.sectorSize);
    sectorTotals.set(sectorKey, (sectorTotals.get(sectorKey) ?? 0) + 1);
    if (entity.components.brain?.archetype === "zombie") {
      zombieTotals.set(sectorKey, (zombieTotals.get(sectorKey) ?? 0) + 1);
    }
  }

  for (const [sectorKey, count] of sectorTotals) {
    if (count >= 18) {
      findings.push({
        severity: "warn",
        code: "sector_entity_density",
        message: `Sector ${sectorKey} is dense with ${count} entities.`,
      });
    }
  }

  for (const [sectorKey, count] of zombieTotals) {
    if (count >= 8) {
      findings.push({
        severity: "warn",
        code: "sector_zombie_density",
        message: `Sector ${sectorKey} contains ${count} zombies.`,
      });
    }
  }
}

function evaluateSimulationSectors(
  world: WorldDocument,
  findings: EvaluationFinding[],
): void {
  const overloadedPools = world.simulation.sectorPools
    .filter((pool) => pool.count >= 18)
    .sort((left, right) => right.count - left.count)
    .slice(0, 4);
  for (const pool of overloadedPools) {
    findings.push({
      severity: "warn",
      code: "sector_pool_pressure",
      message: `Sector ${pool.sectorKey} is carrying a pooled far-field group of ${pool.count} ${pool.prefabId} actors.`,
    });
  }

  const activeHotSectors = world.simulation.sectorStates.filter(
    (sector) => sector.status === "active" && sector.liveCount + sector.pooledCount >= 10,
  );
  for (const sector of activeHotSectors.slice(0, 4)) {
    findings.push({
      severity: "warn",
      code: "active_sector_pressure",
      message: `Active sector ${sector.sectorKey} is under pressure with ${sector.liveCount} live and ${sector.pooledCount} pooled actors.`,
    });
  }

  const depletedCount = world.simulation.sectorStates.filter((sector) => sector.status === "depleted").length;
  if (depletedCount >= 6) {
    findings.push({
      severity: "info",
      code: "depleted_sectors",
      message: `World has ${depletedCount} tracked depleted sectors.`,
    });
  }
}

function validateEntityContract(
  entity: ResolvedEntity,
  findings: EvaluationFinding[],
): void {
  const { combat, character, health, interaction, inventory, physics, render, animation } =
    entity.components;

  if (character && !physics) {
    findings.push({
      severity: "error",
      code: "character_missing_physics",
      message: `${entity.name} has character movement but no physics body.`,
    });
  }

  if (interaction?.kind === "loot" && !inventory) {
    findings.push({
      severity: "error",
      code: "loot_missing_inventory",
      message: `${entity.name} is lootable but has no inventory component.`,
    });
  }

  if (inventory && inventory.itemIds.length > inventory.maxSlots) {
    findings.push({
      severity: "warn",
      code: "inventory_overflow",
      message: `${entity.name} has ${inventory.itemIds.length} items but only ${inventory.maxSlots} slots.`,
    });
  }

  if (health) {
    if (health.max <= 0) {
      findings.push({
        severity: "error",
        code: "invalid_health_max",
        message: `${entity.name} has non-positive max health.`,
      });
    }
    if (health.current > health.max) {
      findings.push({
        severity: "warn",
        code: "health_overflow",
        message: `${entity.name} current health exceeds max health.`,
      });
    }
  }

  if (combat) {
    if (combat.damage <= 0 || combat.range <= 0 || combat.cooldownSeconds <= 0) {
      findings.push({
        severity: "error",
        code: "invalid_combat_values",
        message: `${entity.name} has invalid combat values.`,
      });
    }
  }

  if (render?.type === "model" && animation?.state) {
    if (!render.uri.trim()) {
      findings.push({
        severity: "error",
        code: "model_uri_missing",
        message: `${entity.name} uses a model render component without a URI.`,
      });
    }
    const hasExternalSource = !!render.animationSources?.[animation.state];
    if (!hasExternalSource && (!render.clips || Object.keys(render.clips).length === 0)) {
      findings.push({
        severity: "warn",
        code: "model_clips_unmapped",
        message: `${entity.name} uses model animation state '${animation.state}' without clip aliases.`,
      });
    } else if (
      !hasExternalSource &&
      render.clips &&
      !(animation.state in render.clips)
    ) {
      findings.push({
        severity: "warn",
        code: "animation_state_unmapped",
        message: `${entity.name} animation state '${animation.state}' has no clip alias mapping.`,
      });
    }
  }
}

function evaluateSceneryOverlaps(
  entities: ResolvedEntity[],
  findings: EvaluationFinding[],
): void {
  const solidEntities = entities.filter(
    (entity) =>
      entity.components.physics &&
      !entity.components.physics.sensor &&
      !isIgnoredForOverlap(entity),
  );
  let overlapCount = 0;

  for (let leftIndex = 0; leftIndex < solidEntities.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < solidEntities.length; rightIndex += 1) {
      const left = solidEntities[leftIndex];
      const right = solidEntities[rightIndex];

      if (!aabbOverlap(left, right)) {
        continue;
      }

      const bothActors =
        !!left.components.character && !!right.components.character;
      if (bothActors) {
        continue;
      }

      overlapCount += 1;
      findings.push({
        severity: "warn",
        code: "entity_overlap",
        message: `${left.name} overlaps ${right.name}.`,
      });
      if (overlapCount >= 8) {
        findings.push({
          severity: "info",
          code: "entity_overlap_truncated",
          message: "Additional overlap findings were truncated.",
        });
        return;
      }
    }
  }
}

function evaluateZones(
  world: WorldDocument,
  entities: ResolvedEntity[],
  player: ResolvedEntity | null,
  spawnZones: ZoneSpec[],
  safeZones: ZoneSpec[],
  findings: EvaluationFinding[],
): void {
  for (const spawnZone of spawnZones) {
    const zombiesInside = entities.filter(
      (entity) =>
        entity.components.brain?.archetype === "zombie" &&
        zoneContainsPoint(spawnZone, entity.transform.position),
    );

    if (zombiesInside.length === 0) {
      findings.push({
        severity: "info",
        code: "empty_spawn_zone",
        message: `${spawnZone.name} has no zombies inside it.`,
      });
    }

    if (player && zoneContainsPoint(spawnZone, player.transform.position)) {
      findings.push({
        severity: "warn",
        code: "player_in_spawn_zone",
        message: `Player starts inside spawn zone ${spawnZone.name}.`,
      });
    }
  }

  for (const safeZone of safeZones) {
    for (const spawnZone of spawnZones) {
      if (zonesOverlap(safeZone, spawnZone)) {
        findings.push({
          severity: "warn",
          code: "safe_spawn_overlap",
          message: `Safe zone ${safeZone.name} overlaps spawn zone ${spawnZone.name}.`,
        });
      }
    }
  }

  const offGroundEntities = entities.filter((entity) => {
    if (entity.id === "ground" || entity.id.startsWith("road.")) {
      return false;
    }
    const minY = entityAabb(entity).min.y;
    return minY < -0.2;
  });
  for (const entity of offGroundEntities.slice(0, 5)) {
    findings.push({
      severity: "warn",
      code: "entity_below_ground",
      message: `${entity.name} appears to intersect below ground height.`,
    });
  }

  if (offGroundEntities.length > 5) {
    findings.push({
      severity: "info",
      code: "entity_below_ground_truncated",
      message: "Additional below-ground findings were truncated.",
    });
  }
}

function evaluateReachability(
  entities: ResolvedEntity[],
  player: ResolvedEntity,
  spawnZones: ZoneSpec[],
  safeZones: ZoneSpec[],
  lootEntities: ResolvedEntity[],
  findings: EvaluationFinding[],
): void {
  const grid = buildReachabilityGrid(entities);
  if (!grid) {
    return;
  }

  const startCell = pointToCell(grid, player.transform.position);
  if (!startCell || grid.blocked[cellIndex(grid, startCell.x, startCell.z)]) {
    findings.push({
      severity: "error",
      code: "player_start_blocked",
      message: "Player spawn sits inside blocked walkable space.",
    });
    return;
  }

  floodReachable(grid, startCell.x, startCell.z);
  const reachableCount = grid.reachable.filter(Boolean).length;
  if (reachableCount < 24) {
    findings.push({
      severity: "warn",
      code: "small_walkable_area",
      message: "Player can reach only a very small walkable area.",
    });
  }

  for (const lootEntity of lootEntities) {
    const interactionRadius = lootEntity.components.interaction?.radius ?? 1.5;
    if (!isPointReachable(grid, lootEntity.transform.position, interactionRadius)) {
      findings.push({
        severity: "warn",
        code: "unreachable_loot",
        message: `${lootEntity.name} appears unreachable from the player start.`,
      });
    }
  }

  for (const zone of [...spawnZones, ...safeZones]) {
    const radius =
      zone.shape.type === "sphere"
        ? zone.shape.radius
        : Math.min(zone.shape.size.x, zone.shape.size.z) * 0.5;
    if (!isPointReachable(grid, zone.transform.position, Math.max(radius, grid.cellSize * 1.5))) {
      findings.push({
        severity: "info",
        code: "unreachable_zone",
        message: `${zone.name} may be unreachable from the player start.`,
      });
    }
  }
}

function aabbOverlap(left: ResolvedEntity, right: ResolvedEntity): boolean {
  const leftBox = entityAabb(left);
  const rightBox = entityAabb(right);

  return !(
    leftBox.max.x < rightBox.min.x ||
    leftBox.min.x > rightBox.max.x ||
    leftBox.max.y < rightBox.min.y ||
    leftBox.min.y > rightBox.max.y ||
    leftBox.max.z < rightBox.min.z ||
    leftBox.min.z > rightBox.max.z
  );
}

function entityAabb(entity: ResolvedEntity): { min: Vec3; max: Vec3 } {
  const extents = shapeExtents(entity.components.physics?.shape, entity.transform.scale);
  const position = entity.transform.position;

  return {
    min: {
      x: position.x - extents.x,
      y: position.y - extents.y,
      z: position.z - extents.z,
    },
    max: {
      x: position.x + extents.x,
      y: position.y + extents.y,
      z: position.z + extents.z,
    },
  };
}

function buildReachabilityGrid(entities: ResolvedEntity[]): ReachabilityGrid | null {
  const relevantEntities = entities.filter((entity) => !isIgnoredForOverlap(entity));
  if (relevantEntities.length === 0) {
    return null;
  }

  const bounds = relevantEntities.map((entity) => entityAabb(entity));
  const margin = 8;
  const minX = Math.min(...bounds.map((bound) => bound.min.x)) - margin;
  const minZ = Math.min(...bounds.map((bound) => bound.min.z)) - margin;
  const maxX = Math.max(...bounds.map((bound) => bound.max.x)) + margin;
  const maxZ = Math.max(...bounds.map((bound) => bound.max.z)) + margin;
  const cellSize = 2;
  const width = Math.max(1, Math.ceil((maxX - minX) / cellSize));
  const height = Math.max(1, Math.ceil((maxZ - minZ) / cellSize));
  const blocked = new Array<boolean>(width * height).fill(false);
  const reachable = new Array<boolean>(width * height).fill(false);

  for (const entity of relevantEntities) {
    if (!isBlockingObstacle(entity)) {
      continue;
    }
    const box = entityAabb(entity);
    const minCell = pointToCellCoords(minX, minZ, cellSize, box.min.x, box.min.z, width, height);
    const maxCell = pointToCellCoords(minX, minZ, cellSize, box.max.x, box.max.z, width, height);
    if (!minCell || !maxCell) {
      continue;
    }

    for (let z = minCell.z; z <= maxCell.z; z += 1) {
      for (let x = minCell.x; x <= maxCell.x; x += 1) {
        blocked[cellIndexRaw(width, x, z)] = true;
      }
    }
  }

  return {
    minX,
    minZ,
    cellSize,
    width,
    height,
    blocked,
    reachable,
  };
}

function shapeExtents(
  shape: PhysicsShape | undefined,
  scale: ResolvedEntity["transform"]["scale"] | undefined,
): Vec3 {
  const actualScale = scale ?? { x: 1, y: 1, z: 1 };
  if (!shape) {
    return { x: 0.5, y: 0.5, z: 0.5 };
  }

  switch (shape.type) {
    case "box":
      return {
        x: (shape.size.x * actualScale.x) * 0.5,
        y: (shape.size.y * actualScale.y) * 0.5,
        z: (shape.size.z * actualScale.z) * 0.5,
      };
    case "sphere": {
      const radius = shape.radius * Math.max(actualScale.x, actualScale.y, actualScale.z);
      return { x: radius, y: radius, z: radius };
    }
    case "capsule": {
      const radius = shape.radius * Math.max(actualScale.x, actualScale.z);
      return {
        x: radius,
        y: shape.halfHeight * actualScale.y + radius,
        z: radius,
      };
    }
  }
}

function zoneContainsPoint(zone: ZoneSpec, point: Vec3): boolean {
  switch (zone.shape.type) {
    case "box":
      return (
        Math.abs(point.x - zone.transform.position.x) <= zone.shape.size.x * 0.5 &&
        Math.abs(point.y - zone.transform.position.y) <= zone.shape.size.y * 0.5 &&
        Math.abs(point.z - zone.transform.position.z) <= zone.shape.size.z * 0.5
      );
    case "sphere":
      return (
        Math.hypot(
          point.x - zone.transform.position.x,
          point.y - zone.transform.position.y,
          point.z - zone.transform.position.z,
        ) <= zone.shape.radius
      );
  }
}

function pointToCell(
  grid: ReachabilityGrid,
  point: Vec3,
): { x: number; z: number } | null {
  return pointToCellCoords(
    grid.minX,
    grid.minZ,
    grid.cellSize,
    point.x,
    point.z,
    grid.width,
    grid.height,
  );
}

function pointToCellCoords(
  minX: number,
  minZ: number,
  cellSize: number,
  x: number,
  z: number,
  width: number,
  height: number,
): { x: number; z: number } | null {
  const cellX = Math.floor((x - minX) / cellSize);
  const cellZ = Math.floor((z - minZ) / cellSize);
  if (cellX < 0 || cellZ < 0 || cellX >= width || cellZ >= height) {
    return null;
  }
  return { x: cellX, z: cellZ };
}

function floodReachable(grid: ReachabilityGrid, startX: number, startZ: number): void {
  const queue: Array<{ x: number; z: number }> = [{ x: startX, z: startZ }];
  grid.reachable[cellIndex(grid, startX, startZ)] = true;

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    const neighbors = [
      { x: current.x + 1, z: current.z },
      { x: current.x - 1, z: current.z },
      { x: current.x, z: current.z + 1 },
      { x: current.x, z: current.z - 1 },
    ];

    for (const neighbor of neighbors) {
      if (
        neighbor.x < 0 ||
        neighbor.z < 0 ||
        neighbor.x >= grid.width ||
        neighbor.z >= grid.height
      ) {
        continue;
      }

      const index = cellIndex(grid, neighbor.x, neighbor.z);
      if (grid.blocked[index] || grid.reachable[index]) {
        continue;
      }

      grid.reachable[index] = true;
      queue.push(neighbor);
    }
  }
}

function isPointReachable(
  grid: ReachabilityGrid,
  point: Vec3,
  radius: number,
): boolean {
  const steps = Math.max(1, Math.ceil(radius / grid.cellSize));
  for (let offsetZ = -steps; offsetZ <= steps; offsetZ += 1) {
    for (let offsetX = -steps; offsetX <= steps; offsetX += 1) {
      const samplePoint = {
        x: point.x + offsetX * grid.cellSize,
        z: point.z + offsetZ * grid.cellSize,
      };
      const cell = pointToCellCoords(
        grid.minX,
        grid.minZ,
        grid.cellSize,
        samplePoint.x,
        samplePoint.z,
        grid.width,
        grid.height,
      );
      if (!cell) {
        continue;
      }
      const index = cellIndex(grid, cell.x, cell.z);
      if (grid.reachable[index] && !grid.blocked[index]) {
        return true;
      }
    }
  }
  return false;
}

function zonesOverlap(left: ZoneSpec, right: ZoneSpec): boolean {
  if (left.shape.type === "sphere" && right.shape.type === "sphere") {
    return (
      Math.hypot(
        left.transform.position.x - right.transform.position.x,
        left.transform.position.y - right.transform.position.y,
        left.transform.position.z - right.transform.position.z,
      ) <= left.shape.radius + right.shape.radius
    );
  }

  const leftBox = zoneAabb(left);
  const rightBox = zoneAabb(right);
  return !(
    leftBox.max.x < rightBox.min.x ||
    leftBox.min.x > rightBox.max.x ||
    leftBox.max.y < rightBox.min.y ||
    leftBox.min.y > rightBox.max.y ||
    leftBox.max.z < rightBox.min.z ||
    leftBox.min.z > rightBox.max.z
  );
}

function zoneAabb(zone: ZoneSpec): { min: Vec3; max: Vec3 } {
  if (zone.shape.type === "sphere") {
    return {
      min: {
        x: zone.transform.position.x - zone.shape.radius,
        y: zone.transform.position.y - zone.shape.radius,
        z: zone.transform.position.z - zone.shape.radius,
      },
      max: {
        x: zone.transform.position.x + zone.shape.radius,
        y: zone.transform.position.y + zone.shape.radius,
        z: zone.transform.position.z + zone.shape.radius,
      },
    };
  }

  return {
    min: {
      x: zone.transform.position.x - zone.shape.size.x * 0.5,
      y: zone.transform.position.y - zone.shape.size.y * 0.5,
      z: zone.transform.position.z - zone.shape.size.z * 0.5,
    },
    max: {
      x: zone.transform.position.x + zone.shape.size.x * 0.5,
      y: zone.transform.position.y + zone.shape.size.y * 0.5,
      z: zone.transform.position.z + zone.shape.size.z * 0.5,
    },
  };
}

function isIgnoredForOverlap(entity: ResolvedEntity): boolean {
  return entity.id === "ground" || entity.id.startsWith("road.");
}

function isBlockingObstacle(entity: ResolvedEntity): boolean {
  const physics = entity.components.physics;
  if (!physics || physics.sensor) {
    return false;
  }
  if (isIgnoredForOverlap(entity)) {
    return false;
  }
  if (entity.components.character) {
    return false;
  }
  if (entity.components.interaction?.kind === "loot") {
    return false;
  }
  return physics.body === "static";
}

function cellIndex(grid: ReachabilityGrid, x: number, z: number): number {
  return cellIndexRaw(grid.width, x, z);
}

function cellIndexRaw(width: number, x: number, z: number): number {
  return z * width + x;
}
