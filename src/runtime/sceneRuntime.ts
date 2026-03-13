import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinnedObject } from "three/examples/jsm/utils/SkeletonUtils.js";

import {
  AnimationComponent,
  CameraRigComponent,
  EntitySpec,
  ModelRenderComponent,
  PrimitiveRenderComponent,
  RenderComponent,
  ResolvedEntity,
  Transform,
  WorldDocument,
  ZoneSpec,
  resolveEntity,
} from "../core/schema";
import { RuntimeSectorOverlay } from "../modules/types";

interface LoadedModelAsset {
  scene: THREE.Object3D;
  animations: THREE.AnimationClip[];
}

interface AnimationBinding {
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  clipAliases: Map<string, string>;
  activeClipName: string | null;
  activeState: string | null;
  effectiveSpeed: number;
  loopMode: string;
}

interface EntityFlashState {
  color: THREE.Color;
  remainingSeconds: number;
  durationSeconds: number;
  strength: number;
}

interface FloatingMarker {
  element: HTMLDivElement;
  entityId: string;
  remainingSeconds: number;
  durationSeconds: number;
  worldOffsetY: number;
  driftY: number;
}

interface HealthBarState {
  element: HTMLDivElement;
  fill: HTMLDivElement;
  label: HTMLSpanElement;
  current: number;
  max: number;
}

interface WorldLabelState {
  element: HTMLDivElement;
  targetType: "entity" | "zone";
  targetId: string;
  offsetY: number;
  position?: THREE.Vector3;
}

export interface AssetClipReport {
  state: string;
  clipName: string;
  durationSeconds: number | null;
  status: "loaded" | "missing";
}

export interface AssetReport {
  entityId: string;
  entityName: string;
  uri: string;
  format: "gltf" | "fbx";
  status: "loading" | "ready" | "error";
  warnings: string[];
  clips: AssetClipReport[];
  error?: string;
}

export interface SceneStats {
  drawCalls: number;
  triangleCount: number;
  objectCount: number;
}

export interface MovementBasis {
  forward: { x: number; z: number };
  right: { x: number; z: number };
}

export interface SceneDebugOptions {
  showZones: boolean;
  showCombatRanges: boolean;
  showInteractionRanges: boolean;
  showAggroRanges: boolean;
  showSectors: boolean;
}

export interface GroundPickResult {
  point: { x: number; y: number; z: number };
}

export interface SelectionTarget {
  type: "entity" | "zone" | "none";
  id: string | null;
}

export class SceneRuntime {
  private readonly renderer: THREE.WebGLRenderer;

  private readonly scene: THREE.Scene;

  private readonly camera: THREE.PerspectiveCamera;

  private readonly controls: OrbitControls;

  private readonly entityGroup = new THREE.Group();

  private readonly zoneGroup = new THREE.Group();

  private readonly sectorGroup = new THREE.Group();

  private readonly raycaster = new THREE.Raycaster();

  private readonly pointer = new THREE.Vector2();

  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  private readonly entityMap = new Map<string, THREE.Object3D>();

  private readonly gltfLoader = new GLTFLoader();

  private readonly fbxLoader = new FBXLoader();

  private readonly modelCache = new Map<string, Promise<LoadedModelAsset>>();

  private readonly animationBindings = new Map<string, AnimationBinding>();

  private readonly desiredAnimations = new Map<string, AnimationComponent | undefined>();

  private readonly assetReports = new Map<string, AssetReport>();

  private readonly flashStates = new Map<string, EntityFlashState>();

  private readonly feedbackLayer: HTMLDivElement;

  private readonly floatingMarkers = new Set<FloatingMarker>();

  private readonly healthBarLayer: HTMLDivElement;

  private readonly healthBars = new Map<string, HealthBarState>();

  private readonly labelLayer: HTMLDivElement;

  private readonly worldLabels = new Map<string, WorldLabelState>();

  private readonly dangerOverlay: HTMLDivElement;

  private playerDangerLevel = 0;

  private debugOptions: SceneDebugOptions = {
    showZones: true,
    showCombatRanges: false,
    showInteractionRanges: true,
    showAggroRanges: false,
    showSectors: false,
  };

  private currentWorld: WorldDocument | null = null;

  private selectedEntityId: string | null = null;

  private selectedZoneId: string | null = null;

  private currentSectorOverlay: RuntimeSectorOverlay | null = null;

  private currentSectorOverlaySignature = "";

  constructor(
    private readonly mount: HTMLElement,
    private readonly onSelect: (selection: SelectionTarget) => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(mount.clientWidth, mount.clientHeight);
    this.renderer.shadowMap.enabled = true;
    mount.appendChild(this.renderer.domElement);
    this.feedbackLayer = document.createElement("div");
    this.feedbackLayer.className = "scene-feedback-layer";
    mount.appendChild(this.feedbackLayer);
    this.healthBarLayer = document.createElement("div");
    this.healthBarLayer.className = "scene-health-layer";
    mount.appendChild(this.healthBarLayer);
    this.labelLayer = document.createElement("div");
    this.labelLayer.className = "scene-label-layer";
    mount.appendChild(this.labelLayer);
    this.dangerOverlay = document.createElement("div");
    this.dangerOverlay.className = "scene-danger-overlay";
    mount.appendChild(this.dangerOverlay);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#dde7ef");
    this.scene.fog = new THREE.FogExp2("#dfe4e8", 0.01);

    this.camera = new THREE.PerspectiveCamera(
      60,
      mount.clientWidth / Math.max(mount.clientHeight, 1),
      0.1,
      500,
    );
    this.camera.position.set(18, 16, 18);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 0);
    this.controls.enableDamping = true;

    this.scene.add(this.entityGroup);
    this.scene.add(this.zoneGroup);
    this.scene.add(this.sectorGroup);
    this.scene.add(new THREE.GridHelper(220, 44, 0x657d8b, 0x94a7b2));

    const hemi = new THREE.HemisphereLight(0xe6eef7, 0x4e5f49, 1.2);
    hemi.position.set(0, 50, 0);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xffffff, 1.35);
    sun.position.set(10, 18, 8);
    sun.castShadow = true;
    this.scene.add(sun);

    this.renderer.domElement.addEventListener("pointerdown", this.handlePointerDown);
    window.addEventListener("resize", this.handleResize);
  }

  setWorld(world: WorldDocument): void {
    this.currentWorld = world;
    this.scene.background = new THREE.Color(world.settings.skyColor);
    this.scene.fog = new THREE.FogExp2(world.settings.fogColor, world.settings.fogDensity);
    this.clearAnimationBindings();
    this.clearGroup(this.entityGroup);
    this.clearGroup(this.zoneGroup);
    this.clearGroup(this.sectorGroup);
    this.entityMap.clear();
    this.desiredAnimations.clear();
    this.assetReports.clear();
    this.flashStates.clear();
    this.clearFloatingMarkers();
    this.clearHealthBars();
    this.clearWorldLabels();
    this.playerDangerLevel = 0;
    this.dangerOverlay.style.opacity = "0";

    for (const item of world.entities) {
      const entity = resolveEntity(world, item);
      this.desiredAnimations.set(entity.id, entity.components.animation);
      const object = this.buildEntityObject(entity);
      this.entityGroup.add(object);
      this.entityMap.set(entity.id, object);
      const health = entity.components.health;
      if (health && shouldCreateHealthBar(entity)) {
        this.createHealthBar(entity.id, health.current, health.max);
      }
    }

    for (const zone of world.zones) {
      this.zoneGroup.add(this.buildZoneObject(zone));
    }

    this.rebuildWorldLabels(world);

    this.setSelection(this.selectedEntityId, this.selectedZoneId);
    this.rebuildSectorOverlay();
  }

  setDebugOptions(options: Partial<SceneDebugOptions>): void {
    this.debugOptions = {
      ...this.debugOptions,
      ...options,
    };
    if (this.currentWorld) {
      this.setWorld(this.currentWorld);
    }
  }

  setSectorOverlay(overlay: RuntimeSectorOverlay | null): void {
    const signature = overlay ? JSON.stringify(overlay) : "";
    if (signature === this.currentSectorOverlaySignature) {
      return;
    }
    this.currentSectorOverlay = overlay;
    this.currentSectorOverlaySignature = signature;
    this.rebuildSectorOverlay();
  }

  renderFrame(dtSeconds = 0): void {
    for (const binding of this.animationBindings.values()) {
      binding.mixer.update(dtSeconds);
    }
    this.tickFlashStates(dtSeconds);
    this.tickFloatingMarkers(dtSeconds);
    this.tickHealthBars();
    this.tickWorldLabels();
    this.tickDangerOverlay();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  updateEntityTransform(entityId: string, transform: Partial<Transform>): void {
    const object = this.entityMap.get(entityId);
    if (!object) {
      return;
    }
    if (transform.position) {
      object.position.set(
        transform.position.x,
        transform.position.y,
        transform.position.z,
      );
    }
    if (transform.rotation) {
      object.rotation.set(
        transform.rotation.x,
        transform.rotation.y,
        transform.rotation.z,
      );
    }
    if (transform.scale) {
      object.scale.set(transform.scale.x, transform.scale.y, transform.scale.z);
    }
  }

  updateEntityAnimation(entityId: string, animation?: AnimationComponent): void {
    this.desiredAnimations.set(entityId, animation);
    const binding = this.animationBindings.get(entityId);
    if (!binding) {
      return;
    }
    this.applyAnimationState(binding, animation);
  }

  updateFollowCamera(targetId: string, rig?: CameraRigComponent): void {
    if (!rig || (rig.mode !== "follow" && rig.mode !== "top_down" && rig.mode !== "isometric")) {
      return;
    }
    const object = this.entityMap.get(targetId);
    if (!object) {
      return;
    }
    const target = object.position.clone();
    let offset: THREE.Vector3;
    if (rig.mode === "top_down") {
      const distance = rig.distance ?? 20;
      offset = new THREE.Vector3(0.001, distance, 0.001);
    } else {
      const distance = rig.distance ?? (rig.mode === "isometric" ? 14 : 6.5);
      const pitch = rig.pitch ?? (rig.mode === "isometric" ? 0.78 : 0.55);
      const yaw = rig.yaw ?? (rig.mode === "isometric" ? 0.85 : 0.75);
      offset = new THREE.Vector3(
        Math.sin(yaw) * Math.cos(pitch) * distance,
        Math.sin(pitch) * distance + 1.25,
        Math.cos(yaw) * Math.cos(pitch) * distance,
      );
    }
    this.camera.position.lerp(target.clone().add(offset), 0.12);
    this.controls.target.lerp(target, 0.2);
  }

  captureScreenshot(): string {
    this.renderFrame();
    return this.renderer.domElement.toDataURL("image/png");
  }

  handleViewportResize(): void {
    this.handleResize();
  }

  setOrbitEnabled(enabled: boolean): void {
    this.controls.enabled = enabled;
  }

  getAnimationDuration(entityId: string, state: string): number | null {
    const binding = this.animationBindings.get(entityId);
    if (!binding) {
      return null;
    }
    const clipName = binding.clipAliases.get(state) ?? state;
    const action = binding.actions.get(clipName);
    return action ? action.getClip().duration : null;
  }

  getAssetReports(): AssetReport[] {
    return [...this.assetReports.values()]
      .sort((left, right) => left.entityId.localeCompare(right.entityId))
      .map((report) => ({
        ...report,
        warnings: [...report.warnings],
        clips: report.clips.map((clip) => ({ ...clip })),
      }));
  }

  getEntityVisualDebug(entityId: string): string[] {
    const lines: string[] = [];
    const desiredAnimation = this.desiredAnimations.get(entityId);
    const binding = this.animationBindings.get(entityId);
    const report = this.assetReports.get(entityId);
    const object = this.entityMap.get(entityId);
    const legibility = object?.userData.legibilityState as ReturnType<typeof inferEntityLegibilityState> | undefined;

    lines.push(`Desired state: ${desiredAnimation?.state ?? "none"}`);
    lines.push(`Active clip: ${binding?.activeClipName ?? "none"}`);
    lines.push(`Loop mode: ${binding?.loopMode ?? "n/a"}`);
    lines.push(`Playback speed: ${binding ? binding.effectiveSpeed.toFixed(2) : "n/a"}`);
    lines.push(`Legibility marker: ${legibility?.state ?? "none"}`);
    if (binding?.activeState) {
      const duration = this.getAnimationDuration(entityId, binding.activeState);
      lines.push(`Active clip duration: ${duration ? `${duration.toFixed(2)}s` : "n/a"}`);
    }

    if (report) {
      lines.push(`Asset status: ${report.status} (${report.format.toUpperCase()})`);
      if (report.error) {
        lines.push(`Asset error: ${report.error}`);
      }
      for (const warning of report.warnings) {
        lines.push(`Asset warning: ${warning}`);
      }
    }

    return lines;
  }

  flashEntity(
    entityId: string,
    color = "#ff4d4d",
    durationSeconds = 0.18,
    strength = 0.95,
  ): void {
    if (!this.entityMap.has(entityId)) {
      return;
    }
    this.flashStates.set(entityId, {
      color: new THREE.Color(color),
      remainingSeconds: durationSeconds,
      durationSeconds,
      strength,
    });
  }

  updateEntityHealth(entityId: string, current: number, max: number): void {
    const bar = this.healthBars.get(entityId);
    if (!bar) {
      if (this.entityMap.has(entityId)) {
        this.createHealthBar(entityId, current, max);
      }
    } else {
      bar.current = current;
      bar.max = Math.max(1, max);
    }

    const object = this.entityMap.get(entityId);
    if (object) {
      const baseState = object.userData.baseLegibilityState as ReturnType<typeof inferEntityLegibilityState> | undefined;
      if (baseState) {
        object.userData.legibilityState = current <= 0
          ? buildDeadLegibilityState()
          : { ...baseState };
      }
      const flash = this.flashStates.get(entityId);
      this.applyVisualState(
        object,
        entityId,
        flash ? Math.max(0, flash.remainingSeconds / flash.durationSeconds) * flash.strength : 0,
        flash?.color,
      );
    }
  }

  setPlayerDangerLevel(level: number): void {
    this.playerDangerLevel = Math.max(0, Math.min(1, level));
  }

  spawnFloatingMarker(
    entityId: string,
    text: string,
    tone: "damage" | "danger" | "loot" | "down" | "info" = "info",
  ): void {
    const object = this.entityMap.get(entityId);
    if (!object) {
      return;
    }
    const element = document.createElement("div");
    element.className = `floating-marker ${tone}`;
    element.textContent = text;
    this.feedbackLayer.appendChild(element);
    const marker: FloatingMarker = {
      element,
      entityId,
      remainingSeconds: tone === "down" ? 1.05 : 0.78,
      durationSeconds: tone === "down" ? 1.05 : 0.78,
      worldOffsetY: tone === "loot" ? 1.45 : tone === "down" ? 2.15 : 1.85,
      driftY: tone === "down" ? 0.9 : 0.55,
    };
    this.floatingMarkers.add(marker);
    this.positionFloatingMarker(marker, 0);
  }

  getStats(): SceneStats {
    const info = this.renderer.info.render;
    return {
      drawCalls: info.calls,
      triangleCount: info.triangles,
      objectCount: this.entityMap.size + this.zoneGroup.children.length,
    };
  }

  getMovementBasis(): MovementBasis {
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 1e-6) {
      forward.set(0, 0, -1);
    } else {
      forward.normalize();
    }

    const right = new THREE.Vector3(-forward.z, 0, forward.x).normalize();
    return {
      forward: { x: forward.x, z: forward.z },
      right: { x: right.x, z: right.z },
    };
  }

  screenPointToGround(clientX: number, clientY: number): GroundPickResult | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = new THREE.Vector3();
    const intersects = this.raycaster.ray.intersectPlane(this.groundPlane, hit);
    if (!intersects) {
      return null;
    }
    return {
      point: {
        x: hit.x,
        y: hit.y,
        z: hit.z,
      },
    };
  }

  private buildEntityObject(entity: ReturnType<typeof resolveEntity>): THREE.Object3D {
    const group = new THREE.Group();
    group.name = entity.id;
    group.userData.entityId = entity.id;
    group.userData.baseLegibilityState = inferEntityLegibilityState(entity);
    group.userData.legibilityState = { ...group.userData.baseLegibilityState };

    const object = entity.components.render
      ? this.buildRenderable(entity)
      : this.buildFallbackPlaceholder(entity);
    object.userData.entityId = entity.id;
    group.add(object);
    const marker = this.buildEntityMarker(entity);
    if (marker) {
      group.add(marker);
    }
    const debugHelpers = this.buildEntityDebugHelpers(entity);
    if (debugHelpers) {
      group.add(debugHelpers);
    }

    const { position, rotation, scale } = entity.transform;
    group.position.set(position.x, position.y, position.z);
    group.rotation.set(rotation?.x ?? 0, rotation?.y ?? 0, rotation?.z ?? 0);
    group.scale.set(scale?.x ?? 1, scale?.y ?? 1, scale?.z ?? 1);
    return group;
  }

  private buildRenderable(entity: ReturnType<typeof resolveEntity>): THREE.Object3D {
    const render = entity.components.render as RenderComponent;
    if (render.type === "model") {
      return this.buildModelNode(entity, render);
    }
    return this.buildPrimitive(render);
  }

  private buildPrimitive(render: PrimitiveRenderComponent): THREE.Mesh {
    let geometry: THREE.BufferGeometry;
    switch (render.primitive) {
      case "box":
        geometry = new THREE.BoxGeometry(
          render.size?.x ?? 1,
          render.size?.y ?? 1,
          render.size?.z ?? 1,
        );
        break;
      case "sphere":
        geometry = new THREE.SphereGeometry(render.radius ?? 0.5, 24, 16);
        break;
      case "capsule":
        geometry = new THREE.CapsuleGeometry(
          render.radius ?? 0.45,
          render.height ?? 1,
          8,
          16,
        );
        break;
      case "cylinder":
        geometry = new THREE.CylinderGeometry(
          render.radius ?? 0.5,
          render.radius ?? 0.5,
          render.height ?? 1,
          24,
        );
        break;
      case "plane":
        geometry = new THREE.PlaneGeometry(
          render.size?.x ?? 1,
          render.size?.z ?? 1,
        );
        break;
    }

    const material = new THREE.MeshStandardMaterial({
      color: render.color,
      transparent: render.opacity !== undefined && render.opacity < 1,
      opacity: render.opacity ?? 1,
      wireframe: render.wireframe ?? false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (render.primitive === "plane") {
      mesh.rotation.x = -Math.PI * 0.5;
    }
    return mesh;
  }

  private buildModelPlaceholder(render: ModelRenderComponent): THREE.Mesh {
    const geometry = new THREE.BoxGeometry(1, 1.8, 1);
    const material = new THREE.MeshStandardMaterial({
      color: render.debugColor ?? "#b59f74",
      metalness: 0.05,
      roughness: 0.9,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.modelUri = render.uri;
    return mesh;
  }

  private buildModelNode(
    entity: ReturnType<typeof resolveEntity>,
    render: ModelRenderComponent,
  ): THREE.Object3D {
    const holder = new THREE.Group();
    const placeholder = this.buildModelPlaceholder(render);
    holder.add(placeholder);
    this.assetReports.set(entity.id, {
      entityId: entity.id,
      entityName: entity.name,
      uri: render.uri,
      format: render.format ?? inferModelFormat(render.uri),
      status: "loading",
      warnings: [],
      clips: [],
    });

    this.loadModel(render)
      .then((asset) => {
        if (!holder.parent) {
          return;
        }

        const modelRoot = this.instantiateModel(asset.scene);
        this.applyModelRenderTransform(modelRoot, render);
        holder.remove(placeholder);
        holder.add(modelRoot);

        if (asset.animations.length > 0) {
          const mixer = new THREE.AnimationMixer(modelRoot);
          const actions = new Map<string, THREE.AnimationAction>();
          for (const clip of asset.animations) {
            actions.set(clip.name, mixer.clipAction(clip));
          }

          const binding: AnimationBinding = {
            mixer,
            actions,
            clipAliases: new Map(Object.entries(render.clips ?? {})),
            activeClipName: null,
            activeState: null,
            effectiveSpeed: 1,
            loopMode: "repeat",
          };
          this.animationBindings.set(entity.id, binding);
          this.assetReports.set(entity.id, this.buildAssetReport(entity, render, binding));
          this.applyAnimationState(binding, this.desiredAnimations.get(entity.id));
        } else {
          this.assetReports.set(entity.id, this.buildAssetReport(entity, render));
        }
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        this.assetReports.set(entity.id, {
          entityId: entity.id,
          entityName: entity.name,
          uri: render.uri,
          format: render.format ?? inferModelFormat(render.uri),
          status: "error",
          warnings: [],
          clips: [],
          error: message,
        });
        console.error(`Failed to load model '${render.uri}' for entity '${entity.id}'.`, error);
        // Keep placeholder if loading fails.
      });

    return holder;
  }

  private buildFallbackPlaceholder(entity: EntitySpec): THREE.Mesh {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({
      color: entity.id === "player" ? "#2a7fff" : "#969ea6",
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  private buildEntityMarker(entity: ResolvedEntity): THREE.Object3D | null {
    const legibility = inferEntityLegibilityState(entity);
    if (!legibility) {
      return null;
    }

    const group = new THREE.Group();
    const radius = inferEntityMarkerRadius(entity);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius, Math.max(0.03, radius * 0.08), 10, 28),
      new THREE.MeshBasicMaterial({
        color: legibility.color,
        transparent: true,
        opacity: legibility.opacity,
      }),
    );
    ring.rotation.x = Math.PI * 0.5;
    ring.position.y = 0.05;
    ring.userData.marker = true;
    ring.userData.baseMarkerOpacity = legibility.opacity;
    group.add(ring);

    if (legibility.beaconHeight > 0) {
      const beacon = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(0.06, radius * 0.1), 12, 8),
        new THREE.MeshBasicMaterial({
          color: legibility.color,
          transparent: true,
          opacity: legibility.opacity * 0.9,
        }),
      );
      beacon.position.set(0, legibility.beaconHeight, 0);
      beacon.userData.marker = true;
      beacon.userData.baseMarkerOpacity = legibility.opacity * 0.9;
      group.add(beacon);
    }

    return group;
  }

  private buildZoneObject(zone: ZoneSpec): THREE.Object3D {
    if (!this.debugOptions.showZones) {
      return new THREE.Group();
    }
    const color =
      zone.kind === "safe" ? 0x2e8b57 : zone.kind === "spawn" ? 0xa94442 : 0xb38b2f;

    if (zone.shape.type === "box") {
      const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.72 });
      const object = new THREE.LineSegments(
        new THREE.EdgesGeometry(
          new THREE.BoxGeometry(
            zone.shape.size.x,
            zone.shape.size.y,
            zone.shape.size.z,
          ),
        ),
        material,
      );
      object.userData.zoneId = zone.id;
      object.userData.baseColor = color;
      object.position.set(
        zone.transform.position.x,
        zone.transform.position.y,
        zone.transform.position.z,
      );
      return object;
    }

    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.72 });
    const object = new THREE.LineSegments(
      new THREE.EdgesGeometry(
        new THREE.SphereGeometry(zone.shape.radius, 16, 12),
      ),
      material,
    );
    object.userData.zoneId = zone.id;
    object.userData.baseColor = color;
    object.position.set(
      zone.transform.position.x,
      zone.transform.position.y,
      zone.transform.position.z,
    );
    return object;
  }

  private clearAnimationBindings(): void {
    for (const binding of this.animationBindings.values()) {
      binding.mixer.stopAllAction();
    }
    this.animationBindings.clear();
  }

  private clearGroup(group: THREE.Group): void {
    for (const child of group.children) {
      child.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (mesh.userData.sharedModelResource) {
          return;
        }
        if (mesh.geometry) {
          mesh.geometry.dispose();
        }
        if (Array.isArray(mesh.material)) {
          for (const material of mesh.material) {
            material.dispose();
          }
        } else if (mesh.material) {
          mesh.material.dispose();
        }
      });
    }
    group.clear();
  }

  private tickFlashStates(dtSeconds: number): void {
    for (const [entityId, flash] of [...this.flashStates.entries()]) {
      const object = this.entityMap.get(entityId);
      if (!object) {
        this.flashStates.delete(entityId);
        continue;
      }

      const normalized =
        flash.durationSeconds <= 0
          ? 0
          : Math.max(0, flash.remainingSeconds) / flash.durationSeconds;
      const pulse = Math.sin(normalized * Math.PI);
      this.applyVisualState(object, entityId, pulse * flash.strength, flash.color);

      flash.remainingSeconds -= dtSeconds;
      if (flash.remainingSeconds <= 0) {
        this.flashStates.delete(entityId);
        this.applyVisualState(object, entityId, 0, flash.color);
      } else {
        this.flashStates.set(entityId, flash);
      }
    }
  }

  private tickFloatingMarkers(dtSeconds: number): void {
    for (const marker of [...this.floatingMarkers]) {
      marker.remainingSeconds -= dtSeconds;
      if (marker.remainingSeconds <= 0) {
        marker.element.remove();
        this.floatingMarkers.delete(marker);
        continue;
      }
      this.positionFloatingMarker(marker, 1 - (marker.remainingSeconds / marker.durationSeconds));
    }
  }

  private positionFloatingMarker(marker: FloatingMarker, normalizedLifetime: number): void {
    const object = this.entityMap.get(marker.entityId);
    if (!object) {
      marker.element.remove();
      this.floatingMarkers.delete(marker);
      return;
    }

    const worldPosition = object.getWorldPosition(new THREE.Vector3());
    worldPosition.y += marker.worldOffsetY + (marker.driftY * normalizedLifetime);
    const projected = worldPosition.project(this.camera);
    const x = ((projected.x + 1) * 0.5) * this.mount.clientWidth;
    const y = ((1 - projected.y) * 0.5) * this.mount.clientHeight;
    const scale = 1 + (normalizedLifetime * 0.08);
    marker.element.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${scale.toFixed(3)})`;
    marker.element.style.opacity = String(Math.max(0, 1 - normalizedLifetime));
  }

  private clearFloatingMarkers(): void {
    for (const marker of this.floatingMarkers) {
      marker.element.remove();
    }
    this.floatingMarkers.clear();
  }

  private createHealthBar(entityId: string, current: number, max: number): void {
    const element = document.createElement("div");
    element.className = "health-bar";
    const label = document.createElement("span");
    label.className = "health-bar-label";
    const track = document.createElement("div");
    track.className = "health-bar-track";
    const fill = document.createElement("div");
    fill.className = "health-bar-fill";
    track.appendChild(fill);
    element.append(label, track);
    this.healthBarLayer.appendChild(element);
    this.healthBars.set(entityId, {
      element,
      fill,
      label,
      current,
      max: Math.max(1, max),
    });
  }

  private tickHealthBars(): void {
    for (const [entityId, bar] of this.healthBars) {
      const object = this.entityMap.get(entityId);
      if (!object) {
        bar.element.remove();
        this.healthBars.delete(entityId);
        continue;
      }

      const ratio = Math.max(0, Math.min(1, bar.current / Math.max(1, bar.max)));
      bar.fill.style.width = `${(ratio * 100).toFixed(1)}%`;
      bar.label.textContent = `${Math.max(0, Math.round(bar.current))}/${Math.max(1, Math.round(bar.max))}`;
      bar.fill.style.background =
        ratio > 0.65
          ? "linear-gradient(90deg, #66c88a, #7be0b1)"
          : ratio > 0.33
            ? "linear-gradient(90deg, #d6b34c, #efcf68)"
            : "linear-gradient(90deg, #d85b5b, #ff8e8e)";

      const projected = object.getWorldPosition(new THREE.Vector3());
      projected.y += 2.35;
      projected.project(this.camera);
      const x = ((projected.x + 1) * 0.5) * this.mount.clientWidth;
      const y = ((1 - projected.y) * 0.5) * this.mount.clientHeight;
      const isVisible = projected.z > -1 && projected.z < 1 && shouldShowHealthBar(entityId, bar, this.selectedEntityId);
      bar.element.style.display = isVisible ? "flex" : "none";
      if (!isVisible) {
        continue;
      }
      bar.element.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
      bar.element.style.opacity = entityId === this.selectedEntityId ? "1" : ratio < 1 ? "0.96" : "0.72";
    }
  }

  private tickDangerOverlay(): void {
    this.dangerOverlay.style.opacity = `${Math.max(0, Math.min(0.68, this.playerDangerLevel * 0.6))}`;
  }

  private clearHealthBars(): void {
    for (const bar of this.healthBars.values()) {
      bar.element.remove();
    }
    this.healthBars.clear();
  }

  private rebuildWorldLabels(world: WorldDocument): void {
    this.clearWorldLabels();

    for (const item of world.entities) {
      const entity = resolveEntity(world, item);
      const entityLabel = describeEntityLabel(entity);
      if (!entityLabel) {
        continue;
      }
      this.createWorldLabel({
        key: `entity:${entity.id}`,
        targetType: "entity",
        targetId: entity.id,
        offsetY: entityLabel.offsetY,
        title: entityLabel.title,
        detail: entityLabel.detail,
        tone: entityLabel.tone,
      });
    }

    for (const zone of world.zones) {
      const zoneLabel = describeZoneLabel(zone);
      if (!zoneLabel) {
        continue;
      }
      this.createWorldLabel({
        key: `zone:${zone.id}`,
        targetType: "zone",
        targetId: zone.id,
        offsetY: zoneLabel.offsetY,
        position: new THREE.Vector3(
          zone.transform.position.x,
          zone.transform.position.y + zoneLabel.offsetY,
          zone.transform.position.z,
        ),
        title: zoneLabel.title,
        detail: zoneLabel.detail,
        tone: zoneLabel.tone,
      });
    }
  }

  private createWorldLabel(options: {
    key: string;
    targetType: "entity" | "zone";
    targetId: string;
    offsetY: number;
    title: string;
    detail?: string;
    tone: string;
    position?: THREE.Vector3;
  }): void {
    const element = document.createElement("div");
    element.className = `world-label ${options.tone}`;
    const title = document.createElement("span");
    title.className = "world-label-title";
    title.textContent = options.title;
    element.appendChild(title);
    if (options.detail) {
      const detail = document.createElement("span");
      detail.className = "world-label-detail";
      detail.textContent = options.detail;
      element.appendChild(detail);
    }
    this.labelLayer.appendChild(element);
    this.worldLabels.set(options.key, {
      element,
      targetType: options.targetType,
      targetId: options.targetId,
      offsetY: options.offsetY,
      position: options.position,
    });
  }

  private tickWorldLabels(): void {
    const playerObject = this.entityMap.get("player");
    const playerPosition = playerObject?.getWorldPosition(new THREE.Vector3()) ?? null;

    for (const [key, label] of this.worldLabels) {
      let worldPosition = label.position?.clone();
      if (!worldPosition) {
        const object = this.entityMap.get(label.targetId);
        if (!object) {
          label.element.remove();
          this.worldLabels.delete(key);
          continue;
        }
        worldPosition = object.getWorldPosition(new THREE.Vector3());
        worldPosition.y += label.offsetY;
      }

      const projected = worldPosition.project(this.camera);
      const x = ((projected.x + 1) * 0.5) * this.mount.clientWidth;
      const y = ((1 - projected.y) * 0.5) * this.mount.clientHeight;
      const cameraDistance = this.camera.position.distanceTo(worldPosition);
      const playerDistance = playerPosition ? playerPosition.distanceTo(worldPosition) : Number.POSITIVE_INFINITY;
      const selected = label.targetType === "entity"
        ? label.targetId === this.selectedEntityId
        : label.targetId === this.selectedZoneId;
      const visible = projected.z > -1
        && projected.z < 1
        && (selected || shouldShowWorldLabel(label, cameraDistance, playerDistance));
      label.element.style.display = visible ? "flex" : "none";
      if (!visible) {
        continue;
      }
      label.element.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
      label.element.style.opacity = selected ? "1" : "0.88";
    }
  }

  private clearWorldLabels(): void {
    for (const label of this.worldLabels.values()) {
      label.element.remove();
    }
    this.worldLabels.clear();
  }

  private applyVisualState(
    object: THREE.Object3D,
    entityId: string,
    flashStrength = 0,
    flashColor?: THREE.Color,
  ): void {
    const selected = entityId === this.selectedEntityId;
    const legibilityState = object.userData.legibilityState as ReturnType<typeof inferEntityLegibilityState> | undefined;
    const dead = legibilityState?.state === "dead";
    const resolvedFlashColor = flashColor ?? new THREE.Color("#ff4d4d");

    object.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.userData.marker && mesh.material instanceof THREE.MeshBasicMaterial) {
        const baseOpacity = mesh.userData.baseMarkerOpacity as number | undefined;
        if (baseOpacity !== undefined) {
          mesh.material.opacity = baseOpacity * (dead ? 0.38 : 1);
        }
        return;
      }
      if (!mesh.material || Array.isArray(mesh.material)) {
        return;
      }
      if (!(mesh.material instanceof THREE.MeshStandardMaterial)) {
        return;
      }

      if (!mesh.userData.baseColor) {
        mesh.userData.baseColor = mesh.material.color.clone();
      }
      const baseColor = mesh.userData.baseColor as THREE.Color;
      const targetColor = flashStrength > 0
        ? baseColor.clone().lerp(resolvedFlashColor, Math.min(1, flashStrength))
        : baseColor.clone();
      if (dead) {
        targetColor.lerp(new THREE.Color("#30343a"), 0.45);
      }
      mesh.material.color.copy(targetColor);
      mesh.material.emissive.set(selected ? "#2d3640" : "#000000");
      if (flashStrength > 0) {
        mesh.material.emissive.lerp(resolvedFlashColor, Math.min(1, flashStrength * 0.7));
      }
      mesh.material.transparent = dead;
      mesh.material.opacity = dead ? 0.78 : 1;
    });
  }

  private rebuildSectorOverlay(): void {
    this.clearGroup(this.sectorGroup);
    if (!this.debugOptions.showSectors || !this.currentSectorOverlay) {
      return;
    }

    const residentSet = new Set(this.currentSectorOverlay.residentSectorKeys);
    const trackedSet = new Map(this.currentSectorOverlay.trackedSectors.map((sector) => [sector.sectorKey, sector]));
    const allSectorKeys = new Set<string>([
      this.currentSectorOverlay.centerSector,
      ...this.currentSectorOverlay.residentSectorKeys,
      ...this.currentSectorOverlay.trackedSectors.map((sector) => sector.sectorKey),
    ]);

    for (const sectorKey of allSectorKeys) {
      const sectorCoord = parseSectorKey(sectorKey);
      const center = {
        x: (sectorCoord.x + 0.5) * this.currentSectorOverlay.sectorSize,
        z: (sectorCoord.z + 0.5) * this.currentSectorOverlay.sectorSize,
      };
      const isCenter = sectorKey === this.currentSectorOverlay.centerSector;
      const isResident = residentSet.has(sectorKey);
      const tracked = trackedSet.get(sectorKey);
      const color = isCenter
        ? 0x55d0ff
        : isResident
          ? 0x3b82f6
          : tracked?.status === "active"
            ? 0xff9959
            : tracked?.status === "dormant" && tracked.trend === "growing"
              ? 0xf0ad4e
              : tracked?.status === "dormant" && tracked.trend === "shrinking"
                ? 0x7db2a8
                : tracked?.status === "dormant"
                  ? 0xd69133
              : tracked?.status === "recent"
                ? 0x72c26f
                : 0x7e8a94;
      const opacity = isCenter
        ? 0.95
        : isResident
          ? 0.5
          : tracked?.status === "active"
            ? 0.82
            : tracked?.status === "dormant" && tracked.trend === "growing"
              ? 0.74
              : tracked?.status === "dormant" && tracked.trend === "shrinking"
                ? 0.56
                : tracked?.status === "dormant"
                  ? 0.64
              : tracked?.status === "recent"
                ? 0.44
                : 0.22;
      this.sectorGroup.add(
        this.buildSectorOutline(
          center.x,
          center.z,
          this.currentSectorOverlay.sectorSize,
          color,
          opacity,
        ),
      );
    }
  }

  private buildSectorOutline(
    x: number,
    z: number,
    sectorSize: number,
    color: number,
    opacity: number,
  ): THREE.Object3D {
    const object = new THREE.LineSegments(
      new THREE.EdgesGeometry(
        new THREE.BoxGeometry(sectorSize, 0.04, sectorSize),
      ),
      new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity,
      }),
    );
    object.position.set(x, 0.04, z);
    return object;
  }

  private loadModel(renderOrUri: ModelRenderComponent | string): Promise<LoadedModelAsset> {
    const render =
      typeof renderOrUri === "string"
        ? ({
            type: "model",
            uri: renderOrUri,
          } as ModelRenderComponent)
        : renderOrUri;
    const cacheKey = JSON.stringify({
      uri: render.uri,
      format: render.format ?? inferModelFormat(render.uri),
      animationSources: render.animationSources ?? {},
    });
    const cached = this.modelCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const promise = new Promise<LoadedModelAsset>((resolve, reject) => {
      const format = render.format ?? inferModelFormat(render.uri);
      if (format === "fbx") {
        void this.loadFbxAsset(render)
          .then(resolve)
          .catch(reject);
        return;
      }

      this.gltfLoader.load(
        render.uri,
        (gltf) => {
          const scene = gltf.scene || gltf.scenes[0];
          if (!scene) {
            reject(new Error(`Model '${render.uri}' has no scene.`));
            return;
          }
          scene.traverse((node) => {
            const mesh = node as THREE.Mesh;
            if (mesh.isMesh) {
              mesh.castShadow = true;
              mesh.receiveShadow = true;
            }
          });
          resolve({
            scene,
            animations: gltf.animations ?? [],
          });
        },
        undefined,
        (error) => reject(error),
      );
    });

    this.modelCache.set(cacheKey, promise);
    return promise;
  }

  private instantiateModel(scene: THREE.Object3D): THREE.Object3D {
    const instance = cloneSkinnedObject(scene);
    instance.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh) {
        if (Array.isArray(mesh.material)) {
          mesh.material = mesh.material.map((material) => material.clone());
        } else if (mesh.material) {
          mesh.material = mesh.material.clone();
        }
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.sharedModelResource = true;
      }
    });
    return instance;
  }

  private async loadFbxAsset(render: ModelRenderComponent): Promise<LoadedModelAsset> {
    const scene = await this.loadFbxObject(render.uri);
    const animations = [...scene.animations];

    for (const [state, uri] of Object.entries(render.animationSources ?? {})) {
      try {
        const clipSource = await this.loadFbxObject(uri);
        const clip = clipSource.animations[0];
        if (!clip) {
          console.warn(`FBX animation '${uri}' did not contain a clip.`);
          continue;
        }
        const namedClip = clip.clone();
        namedClip.name = state;
        animations.push(namedClip);
      } catch (error) {
        console.warn(`Failed to load FBX animation '${uri}' for state '${state}'.`, error);
      }
    }

    scene.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });

    return {
      scene,
      animations,
    };
  }

  private loadFbxObject(uri: string): Promise<THREE.Group> {
    return new Promise<THREE.Group>((resolve, reject) => {
      this.fbxLoader.load(
        uri,
        (group) => resolve(group),
        undefined,
        (error) => reject(error),
      );
    });
  }

  private applyModelRenderTransform(
    object: THREE.Object3D,
    render: ModelRenderComponent,
  ): void {
    if (render.modelScale) {
      object.scale.set(
        render.modelScale.x,
        render.modelScale.y,
        render.modelScale.z,
      );
    }
    if (render.modelOffset) {
      object.position.set(
        render.modelOffset.x,
        render.modelOffset.y,
        render.modelOffset.z,
      );
    }
    if (render.modelRotation) {
      object.rotation.set(
        render.modelRotation.x,
        render.modelRotation.y,
        render.modelRotation.z,
      );
    }
  }

  private applyAnimationState(
    binding: AnimationBinding,
    animation?: AnimationComponent,
  ): void {
    if (!animation?.state) {
      if (binding.activeClipName) {
        binding.actions.get(binding.activeClipName)?.fadeOut(0.1);
        binding.activeClipName = null;
        binding.activeState = null;
      }
      return;
    }

    const clipName = binding.clipAliases.get(animation.state) ?? animation.state;
    const action = binding.actions.get(clipName);
    if (!action) {
      return;
    }

    const fadeSeconds = animation.fadeSeconds ?? 0.2;
    action.enabled = true;
    action.setEffectiveTimeScale(animation.speed ?? 1);
    action.setLoop(
      animation.loop === "once" ? THREE.LoopOnce : THREE.LoopRepeat,
      Infinity,
    );
    action.clampWhenFinished = animation.loop === "once";

    if (binding.activeClipName === clipName) {
      binding.activeState = animation.state;
      binding.effectiveSpeed = animation.speed ?? 1;
      binding.loopMode = animation.loop ?? "repeat";
      if (!action.isRunning()) {
        action.play();
      }
      return;
    }

    const previousAction = binding.activeClipName
      ? binding.actions.get(binding.activeClipName)
      : null;
    previousAction?.fadeOut(fadeSeconds);

    action.reset();
    action.fadeIn(fadeSeconds);
    action.play();
    binding.activeClipName = clipName;
    binding.activeState = animation.state;
    binding.effectiveSpeed = animation.speed ?? 1;
    binding.loopMode = animation.loop ?? "repeat";
  }

  private setSelection(entityId: string | null, zoneId: string | null = null): void {
    this.selectedEntityId = entityId;
    this.selectedZoneId = zoneId;
    for (const [id, object] of this.entityMap) {
      const flash = this.flashStates.get(id);
      this.applyVisualState(
        object,
        id,
        flash ? Math.max(0, flash.remainingSeconds / flash.durationSeconds) * flash.strength : 0,
        flash?.color,
      );
    }
    for (const object of this.zoneGroup.children) {
      object.traverse((node) => {
        const line = node as THREE.LineSegments;
        if (!(line.material instanceof THREE.LineBasicMaterial)) {
          return;
        }
        const isSelected = node.userData.zoneId === zoneId || object.userData.zoneId === zoneId;
        line.material.color.setHex(isSelected ? 0xf6f1c1 : (object.userData.baseColor as number | undefined) ?? 0xb38b2f);
        line.material.opacity = isSelected ? 1 : 0.72;
      });
    }
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersections = this.raycaster.intersectObjects(this.entityGroup.children, true);
    const hit = intersections.find((item) => item.object.userData.entityId);
    const entityId = hit?.object.userData.entityId ?? null;
    if (entityId) {
      this.setSelection(entityId, null);
      this.onSelect({ type: "entity", id: entityId });
      return;
    }
    const zoneIntersections = this.raycaster.intersectObjects(this.zoneGroup.children, true);
    const zoneHit = zoneIntersections.find((item) => item.object.userData.zoneId || item.object.parent?.userData.zoneId);
    const zoneId = zoneHit?.object.userData.zoneId ?? zoneHit?.object.parent?.userData.zoneId ?? null;
    this.setSelection(null, zoneId);
    this.onSelect(zoneId ? { type: "zone", id: zoneId } : { type: "none", id: null });
  };

  private readonly handleResize = (): void => {
    const width = this.mount.clientWidth;
    const height = this.mount.clientHeight;
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  private buildEntityDebugHelpers(entity: ResolvedEntity): THREE.Object3D | null {
    const group = new THREE.Group();
    let hasContent = false;

    if (this.debugOptions.showCombatRanges && entity.components.combat) {
      const combatColor = entity.tags.includes("enemy") ? 0xe36b5b : 0x3d8cff;
      group.add(this.buildRadiusRing(entity.components.combat.range, combatColor, 0.18));
      hasContent = true;
    }

    if (this.debugOptions.showInteractionRanges && entity.components.interaction) {
      group.add(this.buildRadiusRing(entity.components.interaction.radius, 0xe7c25f, 0.1));
      hasContent = true;
    }

    if (this.debugOptions.showAggroRanges && entity.components.brain?.aggroRadius) {
      group.add(this.buildRadiusRing(entity.components.brain.aggroRadius, 0xff8b3d, 0.04));
      hasContent = true;
    }

    return hasContent ? group : null;
  }

  private buildRadiusRing(
    radius: number,
    color: number,
    height: number,
  ): THREE.Object3D {
    const segments = 48;
    const points: THREE.Vector3[] = [];
    for (let index = 0; index <= segments; index += 1) {
      const angle = (index / segments) * Math.PI * 2;
      points.push(new THREE.Vector3(
        Math.cos(angle) * radius,
        height,
        Math.sin(angle) * radius,
      ));
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.75,
    });
    return new THREE.LineLoop(geometry, material);
  }

  private buildAssetReport(
    entity: ResolvedEntity,
    render: ModelRenderComponent,
    binding?: AnimationBinding,
  ): AssetReport {
    const expectedStates = new Set<string>([
      ...Object.keys(render.animationSources ?? {}),
      ...Object.keys(render.clips ?? {}),
      ...Object.values(entity.components.actions ?? {}).map((action) => action.state),
      entity.components.animation?.state ?? "",
    ]);
    expectedStates.delete("");

    const clips: AssetClipReport[] = [];
    const warnings: string[] = [];
    for (const state of expectedStates) {
      const clipName = binding?.clipAliases.get(state) ?? state;
      const action = binding?.actions.get(clipName);
      clips.push({
        state,
        clipName,
        durationSeconds: action ? action.getClip().duration : null,
        status: action ? "loaded" : "missing",
      });
      if (!action) {
        warnings.push(`Missing clip for semantic state '${state}'.`);
      }
    }

    return {
      entityId: entity.id,
      entityName: entity.name,
      uri: render.uri,
      format: render.format ?? inferModelFormat(render.uri),
      status: binding ? "ready" : "loading",
      warnings,
      clips,
    };
  }
}

function inferModelFormat(uri: string): "gltf" | "fbx" {
  return uri.toLowerCase().endsWith(".fbx") ? "fbx" : "gltf";
}

function inferEntityLegibilityState(entity: ResolvedEntity): {
  state: "player" | "enemy" | "interactive" | "dead";
  color: string;
  opacity: number;
  beaconHeight: number;
} | null {
  const isDead = (entity.components.health?.current ?? 1) <= 0;
  if (isDead) {
    return {
      state: "dead",
      color: "#7e8a94",
      opacity: 0.22,
      beaconHeight: 0,
    };
  }
  if (entity.id === "player" || entity.components.brain?.archetype === "player") {
    return {
      state: "player",
      color: "#3d8cff",
      opacity: 0.85,
      beaconHeight: 2.05,
    };
  }
  if (entity.components.brain?.archetype === "zombie" || entity.tags.includes("enemy")) {
    return {
      state: "enemy",
      color: "#ff6b5c",
      opacity: 0.62,
      beaconHeight: 1.8,
    };
  }
  if (entity.components.interaction) {
    return {
      state: "interactive",
      color: "#f4d35e",
      opacity: 0.5,
      beaconHeight: 1.1,
    };
  }
  return null;
}

function buildDeadLegibilityState(): {
  state: "dead";
  color: string;
  opacity: number;
  beaconHeight: number;
} {
  return {
    state: "dead",
    color: "#7e8a94",
    opacity: 0.22,
    beaconHeight: 0,
  };
}

function inferEntityMarkerRadius(entity: ResolvedEntity): number {
  const shape = entity.components.physics?.shape;
  if (!shape) {
    return entity.id === "player" ? 0.58 : 0.5;
  }
  switch (shape.type) {
    case "capsule":
      return shape.radius + 0.1;
    case "sphere":
      return shape.radius + 0.12;
    case "box":
      return (Math.max(shape.size.x, shape.size.z) * 0.5) + 0.08;
  }
}

function shouldCreateHealthBar(entity: ResolvedEntity): boolean {
  return entity.id === "player" || entity.tags.includes("enemy") || entity.components.brain?.archetype === "zombie";
}

function shouldShowHealthBar(
  entityId: string,
  bar: HealthBarState,
  selectedEntityId: string | null,
): boolean {
  if (entityId === "player" || entityId === selectedEntityId) {
    return true;
  }
  return bar.current < bar.max || bar.current <= 0;
}

function describeEntityLabel(entity: ResolvedEntity): {
  title: string;
  detail?: string;
  tone: string;
  offsetY: number;
} | null {
  if (entity.id === "player") {
    return {
      title: "Player",
      detail: "Controlled actor",
      tone: "tone-player",
      offsetY: 2.8,
    };
  }
  if (entity.components.interaction?.kind === "loot") {
    return {
      title: entity.name,
      detail: entity.components.interaction.prompt,
      tone: "tone-loot",
      offsetY: 1.7,
    };
  }
  if (entity.components.interaction) {
    return {
      title: entity.name,
      detail: entity.components.interaction.prompt,
      tone: "tone-interact",
      offsetY: 1.7,
    };
  }
  return null;
}

function describeZoneLabel(zone: ZoneSpec): {
  title: string;
  detail?: string;
  tone: string;
  offsetY: number;
} | null {
  if (zone.kind === "objective" || zone.kind === "spawn" || zone.kind === "safe") {
    return {
      title: zone.name,
      detail: `${zone.kind} zone`,
      tone:
        zone.kind === "safe"
          ? "tone-safe"
          : zone.kind === "objective"
            ? "tone-objective"
            : "tone-spawn",
      offsetY: zone.shape.type === "sphere"
        ? zone.shape.radius + 1.8
        : (zone.shape.size.y * 0.5) + 1.4,
    };
  }
  return null;
}

function shouldShowWorldLabel(
  label: WorldLabelState,
  cameraDistance: number,
  playerDistance: number,
): boolean {
  if (label.targetType === "entity") {
    return playerDistance <= 12 || cameraDistance <= 18;
  }
  return cameraDistance <= 90;
}

function parseSectorKey(key: string): { x: number; z: number } {
  const [rawX, rawZ] = key.split(":");
  return {
    x: Number.parseInt(rawX ?? "0", 10) || 0,
    z: Number.parseInt(rawZ ?? "0", 10) || 0,
  };
}
