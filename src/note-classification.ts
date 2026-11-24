import { getFrontMatterInfo, parseYaml, stringifyYaml } from "obsidian";
import type { TFile, Vault } from "obsidian";

export const CLASSIFICATION_FIELD = "classification";
export const UNCLASSIFIED = "unclassified";

export type BatchMode = "always" | "unclassified";
export type BatchEntry =
  | { action: "add" | "overwrite"; file: TFile; path: string; previous: string }
  | { action: "skip" | "unreadable"; path: string };

export function isMissingClassification(value: unknown): boolean {
  return value == null || (typeof value === "string" && value.trim() === "");
}

export function isExplicitlyUnclassified(value: unknown): boolean {
  return typeof value === "string" && value.trim() === UNCLASSIFIED;
}

export function classificationSnapshot(value: unknown): string {
  // Comparing serialized values also covers lists and other non-string properties.
  return stringifyYaml({ [CLASSIFICATION_FIELD]: value });
}

export function previewValue(file: TFile, value: unknown, target: string, mode: BatchMode): BatchEntry {
  const { path } = file;
  const missing = isMissingClassification(value);
  if (value === target || (mode === "unclassified" && !missing && !isExplicitlyUnclassified(value))) {
    return { path, action: "skip" };
  }
  return { file, path, action: missing ? "add" : "overwrite", previous: classificationSnapshot(value) };
}

export async function previewClassification(
  vault: Vault, file: TFile, target: string, mode: BatchMode,
): Promise<BatchEntry> {
  const { path } = file;
  try {
    const { exists, frontmatter } = getFrontMatterInfo(await vault.read(file));
    const parsed: unknown = exists ? parseYaml(frontmatter) : null;
    if (parsed != null && (typeof parsed !== "object" || Array.isArray(parsed))) {
      return { path, action: "unreadable" };
    }
    const value = (parsed as Record<string, unknown> | null)?.[CLASSIFICATION_FIELD];
    return file.path === path ? previewValue(file, value, target, mode) : { path, action: "skip" };
  } catch {
    return { path, action: "unreadable" };
  }
}
