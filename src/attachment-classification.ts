import type { App, TFile, TFolder } from "obsidian";
import { isMap } from "yaml";
import type { Document } from "yaml";
import { deleteMetadataKey, metadataPath, readFolderMetadata, updateFolderMetadata } from "./folder-metadata";

const ATTACHMENT_FIELD = "attachment-classifications";

function attachmentMap(document: Document) {
  const map = document.get(ATTACHMENT_FIELD, true);
  if (isMap(map)) return map;
  if (document.has(ATTACHMENT_FIELD)) throw new Error("Attachment classifications must be a YAML mapping");
  return undefined;
}

export function cachedAttachmentClassification(app: App, file: TFile): unknown {
  const folder = file.parent ?? app.vault.getRoot();
  const meta = app.vault.getFileByPath(metadataPath(folder));
  if (!meta) return undefined;
  const values: unknown = app.metadataCache.getFileCache(meta)?.frontmatter?.[ATTACHMENT_FIELD];
  if (!values || typeof values !== "object" || Array.isArray(values) || !Object.hasOwn(values, file.name)) return undefined;
  return (values as Record<string, unknown>)[file.name];
}

export async function readAttachmentClassification(app: App, folder: TFolder, name: string): Promise<unknown> {
  return attachmentMap(await readFolderMetadata(app, folder))?.get(name);
}

export function writeAttachmentClassification(
  app: App, folder: TFolder, name: string, value: string,
  shouldWrite: (current: unknown) => boolean,
): Promise<boolean> {
  return updateFolderMetadata(app, folder, ATTACHMENT_FIELD, (document) => {
    const map = attachmentMap(document);
    if (!shouldWrite(map?.get(name))) return false;
    if (map) map.set(name, value);
    else document.set(ATTACHMENT_FIELD, new Map([[name, value]]));
    return true;
  });
}

export async function moveAttachmentClassification(
  app: App, source: TFolder, oldName: string, destination: TFolder | null, newName: string,
): Promise<void> {
  if (source === destination && oldName === newName) return;
  const remove = (document: Document, expected?: string) => {
    const map = attachmentMap(document);
    const value = map?.get(oldName);
    if (!map || typeof value !== "string" || (expected !== undefined && value !== expected)) return false;
    if (source === destination) map.set(newName, value);
    deleteMetadataKey(map, oldName);
    return true;
  };
  if (!destination || source === destination) {
    await updateFolderMetadata(app, source, ATTACHMENT_FIELD, remove);
    return;
  }

  const value = await readAttachmentClassification(app, source, oldName);
  if (typeof value !== "string") return;
  // Keep the source entry if writing the destination fails.
  await writeAttachmentClassification(app, destination, newName, value, (current) => current !== value);
  await updateFolderMetadata(app, source, ATTACHMENT_FIELD, (document) => remove(document, value));
}
