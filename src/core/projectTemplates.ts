import { WorldDocument } from "./schema";
import { makeFlatOutpostWorld, makeThirdPersonSurvivalWorld, makeTownGridWorld, makeUrbanCityWorld } from "./sampleWorld";

export interface ProjectTemplateDescriptor {
  id: string;
  label: string;
  summary: string;
  gameMode: WorldDocument["gameMode"];
  buildWorld(): WorldDocument;
}

const projectTemplates: ProjectTemplateDescriptor[] = [
  {
    id: "survival_outpost",
    label: "Survival Outpost",
    summary: "Balanced survival slice with zombies, loot, and sector pressure.",
    gameMode: "third_person_survival",
    buildWorld: () => makeThirdPersonSurvivalWorld(),
  },
  {
    id: "third_person_arena",
    label: "Third-Person Arena",
    summary: "Third-person action sandbox with a readable combat layout.",
    gameMode: "third_person",
    buildWorld: () => makeFlatOutpostWorld({
      seed: 33,
      worldHalfExtent: 68,
      buildingCount: 10,
      zombieCount: 14,
      crateCount: 6,
    }),
  },
  {
    id: "first_person_patrol",
    label: "First-Person Patrol",
    summary: "First-person prototype world for close-range patrol and combat testing.",
    gameMode: "first_person",
    buildWorld: () => makeTownGridWorld({
      seed: 51,
      worldHalfExtent: 74,
      buildingCount: 12,
      zombieCount: 18,
      crateCount: 5,
    }),
  },
  {
    id: "urban_city_survival",
    label: "Urban City Survival",
    summary: "City-block survival slice built from the URBAN road and apartment kit.",
    gameMode: "third_person_survival",
    buildWorld: () => makeUrbanCityWorld({
      seed: 91,
      worldHalfExtent: 96,
      buildingCount: 12,
      zombieCount: 22,
      crateCount: 8,
    }),
  },
  {
    id: "top_down_encounter",
    label: "Top-Down Encounter",
    summary: "Overhead action template with a centered ring of threats.",
    gameMode: "top_down",
    buildWorld: () => makeTownGridWorld({
      seed: 62,
      worldHalfExtent: 64,
      buildingCount: 8,
      zombieCount: 16,
      crateCount: 6,
    }),
  },
  {
    id: "platformer_course",
    label: "Platformer Course",
    summary: "Side-view traversal lane with enemies and loot placed along the route.",
    gameMode: "platformer",
    buildWorld: () => makeFlatOutpostWorld({
      seed: 77,
      worldHalfExtent: 58,
      buildingCount: 4,
      zombieCount: 8,
      crateCount: 4,
    }),
  },
];

export function listProjectTemplates(): ProjectTemplateDescriptor[] {
  return projectTemplates.map((template) => ({ ...template }));
}

export function getProjectTemplate(templateId: string): ProjectTemplateDescriptor | null {
  return projectTemplates.find((template) => template.id === templateId) ?? null;
}
