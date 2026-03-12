# Groundtruth Asset Contract

Groundtruth expects the AI/runtime layer to work from semantic prefab metadata, with art assets supplied separately.

## Character Test Bundle

For the first real asset integration pass, these are enough:

1. `player.glb`
2. `zombie.glb`
3. one static building model like `shack.glb`

## Character Requirements

- Units: meters
- Up axis: `+Y`
- Forward facing: `+Z`
- Feet placed on the ground plane at `Y = 0`
- Single skinned mesh or a small number of skinned mesh children
- Textures embedded or referenced correctly from the glTF

## Recommended Animation Set

For `player.glb`:

- `Idle`
- `Walk`
- `Run`
- `Attack`
- `Death`

For `zombie.glb`:

- `Idle`
- `Walk`
- `Attack`
- `Death`

## How Groundtruth Maps Clips

Prefab render components can alias semantic states to clip names:

```ts
render: {
  type: "model",
  uri: "/assets/player.glb",
  clips: {
    idle: "Idle",
    walk: "Walk",
    run: "Run",
    attack: "Attack",
    death: "Death",
  },
}
```

Animation state is then driven semantically:

```ts
animation: {
  state: "idle",
  fadeSeconds: 0.15,
}
```

## Static Prop Requirements

For buildings and props:

- origin should be sensible for placement, ideally centered on the footprint
- meshes should be reasonably low-poly
- collision will initially come from semantic physics shapes, not mesh colliders

## What To Send Me First

The smallest useful handoff for live testing is:

1. one humanoid survivor model with `Idle`, `Walk`, and `Run`
2. one zombie model with `Idle` and `Walk`
3. one building model

That is enough to validate import, animation switching, placement scale, and collision fit.
