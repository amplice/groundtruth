import { getProjectTemplate } from "./projectTemplates";
import { ProjectDocument, projectFromWorld } from "./schema";
import { makeFlatOutpostWorld, makeTownGridWorld } from "./sampleWorld";
import { applyWorldStamp } from "./worldStamps";

export interface WorldRecipeDescriptor {
  id: string;
  label: string;
  summary: string;
  buildProject(projectName?: string): ProjectDocument;
}

const worldRecipes: WorldRecipeDescriptor[] = [
  {
    id: "survival_town",
    label: "Survival Town",
    summary: "Third-person survival project with a town layout, extra encounters, and sector simulation left on.",
    buildProject(projectName) {
      const template = getProjectTemplate("survival_outpost");
      const baseWorld = template ? template.buildWorld() : makeTownGridWorld();
      const townWorld = applyWorldStamp(
        applyWorldStamp(baseWorld, "street_block"),
        "encounter_cluster",
      );
      return projectFromWorld({
        ...townWorld,
        gameMode: "third_person_survival",
        metadata: {
          ...townWorld.metadata,
          id: "groundtruth.recipe.survival_town",
          name: projectName?.trim() || "Survival Town",
          description: "Town-style survival slice with denser encounter structure.",
        },
      }, {
        id: "groundtruth.project.recipe.survival_town",
        name: projectName?.trim() || "Survival Town",
        description: "Recipe project built from the Survival Town recipe.",
        templateId: "recipe.survival_town",
        defaultGameMode: "third_person_survival",
      });
    },
  },
  {
    id: "first_person_sweep",
    label: "First-Person Sweep",
    summary: "First-person patrol project with town blocks, added encounters, and sector simulation disabled for a cleaner slice.",
    buildProject(projectName) {
      const baseWorld = makeTownGridWorld({
        seed: 88,
        worldHalfExtent: 78,
        buildingCount: 14,
        zombieCount: 20,
        crateCount: 6,
      });
      const world = applyWorldStamp(
        applyWorldStamp(baseWorld, "street_block"),
        "encounter_cluster",
      );
      const project = projectFromWorld({
        ...world,
        gameMode: "first_person",
        metadata: {
          ...world.metadata,
          id: "groundtruth.recipe.first_person_sweep",
          name: projectName?.trim() || "First-Person Sweep",
          description: "Street-level patrol sweep with first-person readability focus.",
        },
      }, {
        id: "groundtruth.project.recipe.first_person_sweep",
        name: projectName?.trim() || "First-Person Sweep",
        description: "Recipe project built from the First-Person Sweep recipe.",
        templateId: "recipe.first_person_sweep",
        defaultGameMode: "first_person",
      });
      project.runtime.featureOverrides.sector_population = { enabled: false };
      return project;
    },
  },
  {
    id: "top_down_hotzone",
    label: "Top-Down Hotzone",
    summary: "Top-down combat pocket with arena and loot clusters for quick overhead layout testing.",
    buildProject(projectName) {
      const baseWorld = makeTownGridWorld({
        seed: 96,
        worldHalfExtent: 64,
        buildingCount: 8,
        zombieCount: 16,
        crateCount: 7,
      });
      const world = applyWorldStamp(
        applyWorldStamp(baseWorld, "arena_cluster"),
        "loot_cluster",
      );
      return projectFromWorld({
        ...world,
        gameMode: "top_down",
        metadata: {
          ...world.metadata,
          id: "groundtruth.recipe.top_down_hotzone",
          name: projectName?.trim() || "Top-Down Hotzone",
          description: "Compact top-down combat space with loot pressure and objective geometry.",
        },
      }, {
        id: "groundtruth.project.recipe.top_down_hotzone",
        name: projectName?.trim() || "Top-Down Hotzone",
        description: "Recipe project built from the Top-Down Hotzone recipe.",
        templateId: "recipe.top_down_hotzone",
        defaultGameMode: "top_down",
      });
    },
  },
  {
    id: "platformer_gauntlet",
    label: "Platformer Gauntlet",
    summary: "Platformer project with repeated platform runs and an encounter cluster to pressure traversal.",
    buildProject(projectName) {
      const baseWorld = makeFlatOutpostWorld({
        seed: 104,
        worldHalfExtent: 62,
        buildingCount: 4,
        zombieCount: 10,
        crateCount: 4,
      });
      const world = applyWorldStamp(
        applyWorldStamp(baseWorld, "platform_run"),
        "encounter_cluster",
      );
      return projectFromWorld({
        ...world,
        gameMode: "platformer",
        metadata: {
          ...world.metadata,
          id: "groundtruth.recipe.platformer_gauntlet",
          name: projectName?.trim() || "Platformer Gauntlet",
          description: "Traversal-heavy platformer slice with added hostile pressure.",
        },
      }, {
        id: "groundtruth.project.recipe.platformer_gauntlet",
        name: projectName?.trim() || "Platformer Gauntlet",
        description: "Recipe project built from the Platformer Gauntlet recipe.",
        templateId: "recipe.platformer_gauntlet",
        defaultGameMode: "platformer",
      });
    },
  },
];

export function listWorldRecipes(): WorldRecipeDescriptor[] {
  return worldRecipes.map((recipe) => ({ ...recipe }));
}

export function getWorldRecipe(recipeId: string): WorldRecipeDescriptor | null {
  return worldRecipes.find((recipe) => recipe.id === recipeId) ?? null;
}
