import { ProjectDocument, isProjectDocument } from "./schema";

export const PROJECT_EXPORT_KIND = "groundtruth_project";
export const PLAYABLE_BUILD_KIND = "groundtruth_playable";
export const EXPORT_VERSION = 1;

export interface ProjectExportEnvelope {
  kind: typeof PROJECT_EXPORT_KIND;
  version: typeof EXPORT_VERSION;
  capturedAt: string;
  screenshot?: string;
  project: ProjectDocument;
}

export interface PlayableBuildManifest {
  title: string;
  startupWorldId: string;
  defaultGameMode: ProjectDocument["metadata"]["defaultGameMode"];
}

export interface PlayableBuildDocument {
  kind: typeof PLAYABLE_BUILD_KIND;
  version: typeof EXPORT_VERSION;
  builtAt: string;
  manifest: PlayableBuildManifest;
  project: ProjectDocument;
}

export function createProjectExportEnvelope(
  project: ProjectDocument,
  screenshot?: string,
): ProjectExportEnvelope {
  return {
    kind: PROJECT_EXPORT_KIND,
    version: EXPORT_VERSION,
    capturedAt: new Date().toISOString(),
    screenshot,
    project,
  };
}

export function createPlayableBuildDocument(
  project: ProjectDocument,
): PlayableBuildDocument {
  return {
    kind: PLAYABLE_BUILD_KIND,
    version: EXPORT_VERSION,
    builtAt: new Date().toISOString(),
    manifest: {
      title: project.metadata.name,
      startupWorldId: project.currentWorldId,
      defaultGameMode: project.metadata.defaultGameMode,
    },
    project,
  };
}

export function isProjectExportEnvelope(value: unknown): value is ProjectExportEnvelope {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<ProjectExportEnvelope>;
  return (
    candidate.kind === PROJECT_EXPORT_KIND
    && candidate.version === EXPORT_VERSION
    && !!candidate.project
    && isProjectDocument(candidate.project)
  );
}

export function isPlayableBuildDocument(value: unknown): value is PlayableBuildDocument {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<PlayableBuildDocument>;
  return (
    candidate.kind === PLAYABLE_BUILD_KIND
    && candidate.version === EXPORT_VERSION
    && !!candidate.project
    && isProjectDocument(candidate.project)
  );
}

export function resolveImportedProject(value: unknown): ProjectDocument | null {
  if (isProjectDocument(value)) {
    return value;
  }
  if (isProjectExportEnvelope(value)) {
    return value.project;
  }
  if (isPlayableBuildDocument(value)) {
    return value.project;
  }
  return null;
}
