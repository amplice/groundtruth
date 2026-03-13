import { RuntimeFeature, RuntimeFeatureId } from "./types";
import { SectorPopulationFeature } from "./sectorPopulationFeature";

export function createRuntimeFeatures(featureIds: RuntimeFeatureId[] = []): RuntimeFeature[] {
  return featureIds.map((featureId) => {
    switch (featureId) {
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
