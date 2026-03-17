export {
  defaultFlatWorldOptions,
  makeFlatOutpostWorld,
  makeTownGridWorld,
  makeThirdPersonSurvivalWorld,
} from "./worldFactory";
export type { FlatWorldOptions } from "./worldFactory";

export const exampleCommandScript = JSON.stringify(
  [
    {
      op: "set_project_name",
      name: "Downtown Patrol Prototype",
    },
    {
      op: "start_project_template",
      templateId: "first_person_patrol",
    },
    {
      op: "set_project_feature",
      featureId: "sector_population",
      enabled: false,
    },
    {
      op: "set_project_gameplay_policy",
      policyId: "first_person_action",
      patch: {
        loot: {
          emptyContainerMode: "persist",
        },
        respawn: {
          mode: "disabled",
        },
      },
    },
    {
      op: "apply_world_stamp",
      stampId: "encounter_cluster",
    },
  ],
  null,
  2,
);
