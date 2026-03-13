# Groundtruth Architecture

Groundtruth is a browser-first semantic runtime for AI-native 3D games.

## Positioning

- `Axiom`
  - legacy/reference runtime
  - useful for simulation ideas and salvageable pure logic
- `Groundtruth`
  - new primary direction
  - browser-first
  - semantic world model
  - three.js presentation layer
  - Rapier physics integration

## Core Rule

The AI edits world semantics, not engine internals.

## Current Packages

- `src/core`
  - world schema
  - semantic commands
  - sample world documents
  - store/diagnostics
  - world evaluation
  - persistent simulation state for sector pools and sector lifecycle
- `src/runtime`
  - three.js scene runtime
  - Rapier collider sync
  - far-field sector population manager
- `src/modules`
  - genre/runtime modules
  - registry + sandbox fallback
  - current fully implemented seed module: `third_person_survival`
- `src/ai`
  - reserved for future command, eval, and inspection modules

## Current Shape

- The browser runtime/editor is the primary product surface.
- Worlds are semantic documents with persistent simulation metadata.
- Genre logic lives behind runtime-module boundaries.
- Unimplemented genres fall back to a sandbox module so authoring/evaluation still works.
- Large-world work currently centers on sector activation, pooling, and lifecycle tracking.

## Immediate Next Steps

1. Add more far-field sector simulation beyond pooled counts so offline sectors evolve cheaply.
2. Extract more `third_person_survival` assumptions into reusable genre contracts.
3. Add first additional module beyond survival, even if initially sandbox-light.
4. Keep hardening authoring/evaluation so humans and AI can diagnose the runtime without DevTools.
5. Split authoritative simulation from the browser client when the single-player loop stabilizes.
