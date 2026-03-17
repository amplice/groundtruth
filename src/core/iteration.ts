import { AppCommand } from "./commands";
import { EvaluationReport } from "./evaluation";
import { GameMode, ProjectDocument, WorldDocument } from "./schema";

export interface IterationSuggestion {
  id: string;
  title: string;
  summary: string;
  commands: AppCommand[];
  appliedRecently?: boolean;
  appliedCount?: number;
}

export function buildIterationSuggestions(
  project: ProjectDocument,
  world: WorldDocument,
  worldEvaluation: EvaluationReport,
  playtestEvaluation: EvaluationReport | null,
): IterationSuggestion[] {
  const suggestions: IterationSuggestion[] = [];
  const appliedHistory = project.runtime.appliedSuggestions.filter((entry) => entry.worldId === world.metadata.id);
  const appliedCountFor = (suggestionId: string) =>
    appliedHistory.filter((entry) => entry.suggestionId === suggestionId).length;
  const wasAppliedRecently = (suggestionId: string) =>
    appliedHistory.slice(-6).some((entry) => entry.suggestionId === suggestionId);
  const hasFinding = (code: string) =>
    worldEvaluation.findings.some((finding) => finding.code === code) ||
    !!playtestEvaluation?.findings.some((finding) => finding.code === code);

  if (hasFinding("player_missing")) {
    suggestions.push({
      id: "restore_playable_slice",
      title: "Restore Playable Slice",
      summary: "Current world is missing a player. Start a coherent recipe instead of patching the slice by hand.",
      commands: [
        {
          op: "start_world_recipe",
          recipeId: defaultRecipeForMode(world.gameMode),
          projectName: project.metadata.name,
        },
      ],
    });
  }

  if (hasFinding("no_enemies") || hasFinding("playtest_low_signal")) {
    suggestions.push({
      id: "add_encounter_pressure",
      title: "Add Encounter Pressure",
      summary: "World lacks meaningful combat pressure. Add an encounter cluster to create a clearer test slice.",
      commands: [
        { op: "apply_world_stamp", stampId: "encounter_cluster" },
        { op: "save_project_world", name: `${world.metadata.name} Encounter Variant` },
      ],
    });
  }

  if (hasFinding("no_loot") || hasFinding("playtest_pressure_without_reward")) {
    suggestions.push({
      id: "add_loot_reward",
      title: "Add Reward Layer",
      summary: "Play space has pressure without enough reward. Add a loot pocket to improve the combat-to-reward loop.",
      commands: [
        { op: "apply_world_stamp", stampId: "loot_cluster" },
        { op: "save_project_world", name: `${world.metadata.name} Loot Variant` },
      ],
    });
  }

  if (hasFinding("playtest_high_death_count")) {
    suggestions.push({
      id: "reduce_runtime_pressure",
      title: "Reduce Runtime Pressure",
      summary: "Recent playtesting shows repeated deaths. Save a softer variant and disable hostile AI for a readability pass.",
      commands: [
        { op: "save_project_world", name: `${world.metadata.name} Soft Variant` },
        { op: "set_project_feature", featureId: "hostile_ai", enabled: false },
      ],
    });
  }

  if (hasFinding("sector_entity_density") || hasFinding("sector_zombie_density") || hasFinding("active_sector_pressure")) {
    suggestions.push({
      id: "rebuild_from_recipe",
      title: "Rebuild From Cleaner Recipe",
      summary: "Current slice is overcrowded. Start a cleaner recipe-driven project variant with more intentional structure.",
      commands: [
        {
          op: "start_world_recipe",
          recipeId: defaultRecipeForMode(world.gameMode),
          projectName: `${project.metadata.name} Refined`,
        },
      ],
    });
  }

  if (suggestions.length === 0) {
    suggestions.push({
      id: "preserve_current_variant",
      title: "Preserve Current Variant",
      summary: "Current slice is reasonably healthy. Save a project-world copy before making more aggressive changes.",
      commands: [
        { op: "save_project_world", name: `${world.metadata.name} Iteration Copy` },
      ],
    });
  }

  return suggestions
    .map((suggestion) => ({
      ...suggestion,
      appliedCount: appliedCountFor(suggestion.id),
      appliedRecently: wasAppliedRecently(suggestion.id),
    }))
    .slice(0, 4);
}

function defaultRecipeForMode(gameMode: GameMode): string {
  switch (gameMode) {
    case "first_person":
      return "first_person_sweep";
    case "top_down":
      return "top_down_hotzone";
    case "platformer":
      return "platformer_gauntlet";
    case "third_person_survival":
      return "survival_town";
    case "third_person":
    default:
      return "survival_town";
  }
}
