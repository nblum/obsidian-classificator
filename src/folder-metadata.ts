import { getFrontMatterInfo } from "obsidian";
import type { App, TFolder } from "obsidian";
import { CST, isMap, isNode, isScalar, parseDocument } from "yaml";
import type { Document, YAMLMap } from "yaml";

export const FOLDER_META_FILENAME = "_meta.md";

export function metadataPath(folder: TFolder): string {
  return folder.isRoot() ? FOLDER_META_FILENAME : `${folder.path}/${FOLDER_META_FILENAME}`;
}

function parseMetadata(yaml: string) {
  const document = parseDocument(yaml, { intAsBigInt: true, keepSourceTokens: true });
  if (document.errors.length || (document.contents !== null && !isMap(document.contents))) {
    throw new Error("Invalid folder metadata frontmatter");
  }
  return document;
}

const FRONTMATTER_OPEN = /^(?:\uFEFF)?---[\t ]*(?:\r?\n|$)/;

function readMetadata(text: string) {
  const info = getFrontMatterInfo(text);
  if (!info.exists && FRONTMATTER_OPEN.test(text)) throw new Error("Unclosed folder metadata frontmatter");
  return { info, document: parseMetadata(info.frontmatter) };
}

function propertyRange(document: Document, field: string) {
  const map = document.contents;
  if (!isMap(map) || (map.srcToken?.type !== "block-map" && map.srcToken?.type !== "flow-collection")) return undefined;
  const index = map.items.findIndex((pair) => isScalar(pair.key) && pair.key.value === field);
  const item = map.srcToken.items[index];
  if (!item?.key) return undefined;
  const explicit = item.start.findIndex((token) => token.type === "explicit-key-ind");
  const start = explicit < 0 ? [] : item.start.slice(explicit);
  const from = start[0]?.offset ?? item.key.offset;
  const source = CST.stringify({ ...item, start });
  const lineEnd = source.lastIndexOf("\n");
  // The separator of an empty value may contain the next property's indentation.
  const length = map.srcToken.type === "block-map" && lineEnd >= 0 ? lineEnd + 1 : source.length;
  return { from, to: from + length };
}

function renderMetadata(original: string, before: Document, after: Document, field: string, newline: string): string {
  const rendered = after.toString({ lineWidth: 0 }).replaceAll("\n", newline);
  const replacement = propertyRange(parseMetadata(rendered), field);
  const previous = propertyRange(before, field);
  const map = before.contents;
  const token = isMap(map) ? map.srcToken : undefined;
  let patched: string | undefined;
  if (replacement && (token?.type === "block-map" || token?.type === "flow-collection")) {
    const property = rendered.slice(replacement.from, replacement.to);
    if (token.type === "block-map") {
      const indentation = " ".repeat(token.indent);
      const indented = property.slice(0, -newline.length).replaceAll(newline, newline + indentation) + newline;
      const end = token.offset + CST.stringify(token).length;
      patched = previous
        ? original.slice(0, previous.from) + indented + original.slice(previous.to)
        : original.slice(0, end) + indentation + indented + original.slice(end);
    } else if (previous) {
      patched = original.slice(0, previous.from) + property + original.slice(previous.to);
    } else {
      const offset = token.start.offset + 1;
      patched = original.slice(0, offset) + property.trim() + (token.items.length ? ", " : "") + original.slice(offset);
    }
  } else if (previous && token?.type === "block-map") {
    const value = before.get(field, true);
    const indentation = " ".repeat(token.indent);
    const comments = isNode(value) ? [value.commentBefore, value.comment].filter(Boolean).join("\n") : "";
    const preserved = comments ? comments.split("\n").map((line) => `${indentation}#${line}${newline}`).join("") : "";
    patched = original.slice(0, previous.from - token.indent) + preserved + original.slice(previous.to);
  }
  if (patched !== undefined) {
    parseMetadata(patched);
    return patched;
  }
  return rendered;
}

export async function readFolderMetadata(app: App, folder: TFolder): Promise<Document> {
  const file = app.vault.getFileByPath(metadataPath(folder));
  return file ? readMetadata(await app.vault.read(file)).document : parseMetadata("");
}

export function deleteMetadataKey(map: YAMLMap, key: string): void {
  const pair = map.items.find((entry) => isScalar(entry.key) && entry.key.value === key);
  if (!pair) return;
  const comments = [pair.key, pair.value].filter(isNode).flatMap(({ commentBefore, comment }) => [commentBefore, comment]);
  const remaining = [map.comment, ...comments].filter(Boolean).join("\n");
  map.delete(key);
  if (remaining) map.comment = remaining;
}

export async function updateFolderMetadata(
  app: App, folder: TFolder, field: string, update: (document: Document) => boolean,
): Promise<boolean> {
  const { vault } = app;
  const path = metadataPath(folder);
  const currentFolder = () => vault.getFolderByPath(folder.path) === folder && metadataPath(folder) === path;
  if (!currentFolder()) throw new Error("Folder no longer exists");

  let changed = false;
  const edit = (text: string) => {
    if (!currentFolder()) throw new Error("Folder no longer exists");
    const { info, document } = readMetadata(text);
    const before = document.clone();
    changed = update(document);
    if (!changed) return text;
    const newline = text.includes("\r\n") ? "\r\n" : "\n";
    const yaml = renderMetadata(info.frontmatter, before, document, field, newline);
    if (info.exists) {
      // Obsidian's full frontmatter rewrite drops comments. Keep the note body verbatim too.
      return `${text.slice(0, info.from)}${yaml}${text.slice(info.to)}`;
    }
    const bom = text.startsWith("\uFEFF") ? "\uFEFF" : "";
    const body = text.slice(bom.length);
    return `${bom}---${newline}${yaml}---${newline}${body ? `${newline}${body}` : ""}`;
  };

  let file = vault.getFileByPath(path);
  if (!file) {
    const contents = edit("");
    if (!changed) return false;
    try {
      await vault.create(path, contents);
      return true;
    } catch (error) {
      // A folder rule or another writer may have created the file in the meantime.
      file = vault.getFileByPath(path);
      if (!file) throw error;
    }
  }

  const keep = new Error("Keep existing folder metadata");
  try {
    await vault.process(file, (text) => {
      if (file.path !== path) throw new Error("Folder metadata moved");
      const updated = edit(text);
      if (!changed) throw keep;
      return updated;
    });
  } catch (error) {
    if (error !== keep) throw error;
  }
  return changed;
}
