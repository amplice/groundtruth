export {
  defaultFlatWorldOptions,
  makeFlatOutpostWorld,
  makeThirdPersonSurvivalWorld,
} from "./worldFactory";
export type { FlatWorldOptions } from "./worldFactory";

export const exampleCommandScript = JSON.stringify(
  [
    {
      op: "generate_flat_world",
      options: {
        seed: 21,
        worldHalfExtent: 84,
        buildingCount: 16,
        zombieCount: 24,
        crateCount: 8,
      },
    },
    {
      op: "set_world_name",
      name: "Generated Test Basin",
      description: "Procedural flat-world test with roads, cube buildings, and zombie spawns.",
    },
  ],
  null,
  2,
);
