import { CombatFeature } from "./combatFeature";
import { CombatFeedbackFeature } from "./combatFeedbackFeature";
import { InteractionInventoryFeature } from "./interactionInventoryFeature";
import { RuntimeFeature, RuntimeFeatureId } from "./types";
import { SectorPopulationFeature } from "./sectorPopulationFeature";

export function createRuntimeFeatures(featureIds: RuntimeFeatureId[] = []): RuntimeFeature[] {
  return featureIds.map((featureId) => {
    switch (featureId) {
      case "combat":
        return new CombatFeature();
      case "combat_feedback":
        return new CombatFeedbackFeature();
      case "interaction_inventory":
        return new InteractionInventoryFeature();
      case "sector_population":
        return new SectorPopulationFeature();
      default:
        return assertUnreachable(featureId);
    }
  });
}

function assertUnreachable(value: never): never {
  throw new Error(`Unhandled runtime feature '${String(value)}'.`);
}
