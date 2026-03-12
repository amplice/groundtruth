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
- `src/runtime`
  - three.js scene runtime
  - Rapier collider sync
- `src/modules`
  - genre/runtime modules
  - current seed module: `third_person_survival`
- `src/ai`
  - reserved for future command, eval, and inspection modules

## Immediate Next Steps

1. Swap primitive character prefabs for supplied glTF assets using the new semantic animation bindings.
2. Add save/load and screenshot metadata.
3. Add world evaluation and asset diagnostics.
4. Split authoritative simulation from the browser client when the single-player loop stabilizes.
5. Add more genre packs on top of the same semantic core.
