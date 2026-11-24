import { getFrontMatterInfo, parseYaml } from "obsidian";
import type { App, TFolder } from "obsidian";
import { isMap } from "yaml";
import { deleteMetadataKey, metadataPath, updateFolderMetadata } from "./folder-metadata";
import { CLASSIFICATION_FIELD } from "./note-classification";
import type { ClassificatorSettings } from "./settings";

export interface FolderDefault {
  value: string;
  folderPath?: string;
}

export async function readFolderClassification(app: App, folder: TFolder): Promise<string | undefined> {
  const file = app.vault.getFileByPath(metadataPath(folder));
  if (!file) return undefined;
  // A newly created or edited _meta.md may not be indexed in the metadata cache yet.
  const { exists, frontmatter } = getFrontMatterInfo(await app.vault.read(file));
  if (!exists) return undefined;
  const parsed: unknown = parseYaml(frontmatter);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
  const classification = (parsed as Record<string, unknown>)[CLASSIFICATION_FIELD];
  return typeof classification === "string" ? classification.trim() || undefined : undefined;
}

export async function resolveFolderDefault(
  app: App, folder: TFolder | null, settings: ClassificatorSettings,
): Promise<FolderDefault> {
  for (let current = folder; current; current = settings.inheritFolderRules ? current.parent : null) {
    const value = await readFolderClassification(app, current);
    if (value !== undefined) return { value, folderPath: current.path };
  }
  return { value: settings.defaultClassification };
}

export async function writeFolderClassification(app: App, folder: TFolder, classification: string | null): Promise<void> {
  await updateFolderMetadata(app, folder, CLASSIFICATION_FIELD, (document) => {
    if (classification === null) {
      const map = document.contents;
      if (!isMap(map) || !map.has(CLASSIFICATION_FIELD)) return false;
      deleteMetadataKey(map, CLASSIFICATION_FIELD);
    } else {
      if (document.get(CLASSIFICATION_FIELD) === classification) return false;
      document.set(CLASSIFICATION_FIELD, classification);
    }
    return true;
  });
}
