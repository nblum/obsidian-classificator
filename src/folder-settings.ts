import { getFrontMatterInfo, parseYaml, stringifyYaml } from "obsidian";
import type { App, TFolder } from "obsidian";

export const FOLDER_META_FILENAME = "_meta.md";
export const CLASSIFICATION_FIELD = "classification";

function metadataPath(folder: TFolder): string {
  return folder.isRoot() ? FOLDER_META_FILENAME : `${folder.path}/${FOLDER_META_FILENAME}`;
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

export async function writeFolderClassification(app: App, folder: TFolder, classification: string | null): Promise<void> {
  const { vault, fileManager } = app;
  if (vault.getFolderByPath(folder.path) !== folder) throw new Error("Folder no longer exists");
  const path = metadataPath(folder);

  let file = vault.getFileByPath(path);
  if (!file) {
    if (classification === null) return;
    const frontmatter = stringifyYaml({ [CLASSIFICATION_FIELD]: classification }).trimEnd();
    try {
      await vault.create(path, `---\n${frontmatter}\n---\n`);
      return;
    } catch (error) {
      // The file may have appeared since the lookup.
      file = vault.getFileByPath(path);
      if (!file) throw error;
    }
  }

  await fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
    if (classification === null) delete frontmatter[CLASSIFICATION_FIELD];
    else frontmatter[CLASSIFICATION_FIELD] = classification;
  });
}
