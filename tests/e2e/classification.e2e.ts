import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { $, browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";
import { Key } from "webdriverio";
import manifest from "../../manifest.json" with { type: "json" };
import type Classificator from "../../src/main";
import type { ClassificatorSettings } from "../../src/settings";
import { closeSettings, openSettings } from "./obsidian-settings";

const pluginId = "classificator";
const existing = "Existing.md";
const modal = ".classificator-selection-modal";
const folderModal = ".classificator-folder-settings-modal";
const folderClassification = `${folderModal} select[aria-label="Standardeinstufung"]:not([aria-hidden="true"])`;
const folderScope = `${folderModal} select[aria-label="Geltungsbereich"]:not([aria-hidden="true"])`;
const folderNoteMode = `${folderModal} select[aria-label="Zu ändernde Notizen"]:not([aria-hidden="true"])`;
const preview = ".classificator-batch-preview";
const overview = ".classificator-overview";
const explorerToggle = ".nav-header .nav-buttons-container > button.classificator-explorer-toggle";
const headerBadge = ".workspace-leaf.mod-active .classificator-badge--header";

function explorerStyle(value: string) {
  return $(`.classificator-classification-setting[data-classification="${value}"] select[aria-label="Dateibaum"]:not([aria-hidden="true"])`);
}

function explorerRow(path: string): string {
  return `.nav-file-title[data-path="${path}"]`;
}

function explorerBadge(path: string): string {
  return `${explorerRow(path)} .classificator-badge--explorer`;
}

function folderRow(path: string): string {
  return `.nav-folder-title[data-path="${path}"]`;
}

async function createFile(path: string, contents = ""): Promise<void> {
  await browser.executeObsidian(async ({ app }, filename, text) => {
    await app.vault.create(filename, text);
  }, path, contents);
}

async function createFolder(path: string): Promise<void> {
  await browser.executeObsidian(async ({ app }, folderPath) => {
    await app.vault.createFolder(folderPath);
  }, path);
}

async function createImage(path: string): Promise<Buffer> {
  const contents = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2i0AAAAASUVORK5CYII=", "base64");
  await browser.executeObsidian(async ({ app }, filename, bytes) => {
    await app.vault.createBinary(filename, Uint8Array.from(bytes).buffer);
  }, path, [...contents]);
  return contents;
}

async function openFolderSettings(path: string): Promise<void> {
  await $(folderRow(path)).click({ button: "right" });
  await $(".menu-item-title=Classificator: Ordnerregeln").click();
  await expect($(folderModal)).toBeDisplayed();
}

async function loadSettings(settings: Partial<ClassificatorSettings> & { showNoteBadge?: boolean }): Promise<void> {
  await obsidianPage.disablePlugin(pluginId);
  await writeFile(settingsPath(), JSON.stringify({ language: "de", introductionSeen: true, ...settings }));
  await obsidianPage.enablePlugin(pluginId);
}

function settingsPath(): string {
  return join(obsidianPage.getVaultPath(), ".obsidian", "plugins", pluginId, "data.json");
}

async function saveClassification(value: string): Promise<void> {
  // Recent Obsidian versions add an aria-hidden select to measure dropdown width.
  await $(`${modal} select:not([aria-hidden="true"])`).selectByAttribute("value", value);
  await $(`${modal} button.mod-cta`).click();
}

describe("Classificator in Obsidian", () => {
  beforeEach(async () => {
    await browser.reloadObsidian({ vault: "tests/e2e/vault" });
    await loadSettings({});
  });

  it("classifies a new empty note and shows its badges", async () => {
    const path = "New note.md";
    await createFile(path);
    await obsidianPage.openFile(path);

    await expect($(explorerBadge(path))).toHaveText("unclassified");
    await expect($(headerBadge)).toHaveText("unclassified");
    expect(await obsidianPage.read(path)).toMatch(/^---\r?\nclassification: unclassified\r?\n---/);
  });

  it("uses the configured default only for new empty Markdown notes", async () => {
    await loadSettings({ defaultClassification: "confidential" });
    const template = "---\nclassification: public\ntopic: handbook\n---\n\nTemplate text.\n";
    await createFile("From template.md", template);
    await createFile("_meta.md");
    await createFile("Attachment.txt");
    await createFile("Empty note.md");

    await expect($(explorerBadge("Empty note.md"))).toHaveText("confidential");
    expect(await obsidianPage.read("Empty note.md")).toMatch(/^---\r?\nclassification: confidential\r?\n---/);
    expect(await obsidianPage.read("From template.md")).toBe(template);
    expect(await obsidianPage.read("_meta.md")).toBe("");
    expect(await obsidianPage.read("Attachment.txt")).toBe("");
  });

  it("queues prompts for new notes and leaves a skipped note empty", async () => {
    await loadSettings({ creationMode: "ask" });
    await createFile("First prompt.md");
    await createFile("Second prompt.md");

    await expect($(`${modal} p`)).toHaveText("First prompt");
    await expect($(`${modal} button.mod-cta`)).toBeDisabled();
    await saveClassification("public");
    await expect($(`${modal} p`)).toHaveText("Second prompt");
    await $(modal).$("button=Überspringen").click();
    await expect($(modal)).not.toExist();

    await expect($(explorerBadge("First prompt.md"))).toHaveText("public");
    expect(await obsidianPage.read("First prompt.md")).toMatch(/^---\r?\nclassification: public\r?\n---/);
    expect(await obsidianPage.read("Second prompt.md")).toBe("");
  });

  it("keeps a new note empty in manual mode until classified from its header", async () => {
    await loadSettings({ creationMode: "off" });
    await createFolder("Manual");
    await createFile("Manual/_meta.md", "---\nclassification: confidential\n---\n");
    const path = "Manual/Manual note.md";
    await createFile(path);
    if (!await $(explorerRow(path)).isDisplayed()) await $(folderRow("Manual")).click();
    await expect($(explorerRow(path))).toBeDisplayed();
    await obsidianPage.openFile(path);

    await expect($(headerBadge)).toHaveText("Einstufen");
    await expect($(explorerBadge(path))).not.toExist();
    await expect($(modal)).not.toExist();
    expect(await obsidianPage.read(path)).toBe("");

    await $(headerBadge).click();
    await expect($(modal)).not.toExist();
    await $(".menu-item-title=internal").click();
    await expect($(headerBadge)).toHaveText("internal");
    await expect($(explorerBadge(path))).toHaveText("internal");
    expect(await obsidianPage.read(path)).toMatch(/^---\r?\nclassification: internal\r?\n---/);
  });

  it("reclassifies a note from its explorer badge without opening the note", async () => {
    const otherNote = "Open note.md";
    await createFile(otherNote, "Open note content.\n");
    await obsidianPage.openFile(otherNote);

    await $(explorerBadge(existing)).click();
    await expect($(modal)).not.toExist();
    await $(".menu-item-title=confidential").click();

    await expect($(explorerBadge(existing))).toHaveText("confidential");
    const openPath = await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getMostRecentLeaf(app.workspace.rootSplit)?.view;
      return view instanceof obsidian.MarkdownView ? view.file?.path : undefined;
    });
    expect(openPath).toBe(otherNote);
    const text = await obsidianPage.read(existing);
    expect(text).toMatch(/^classification: confidential$/m);
    expect(text).toMatch(/^topic: handbook$/m);
    expect(text).toContain("Original note content.");
  });

  it("reclassifies a note through the command and preserves unrelated frontmatter and content", async () => {
    await obsidianPage.openFile(existing);
    await browser.executeObsidianCommand(`${pluginId}:classify-note`);
    await saveClassification("internal");

    await expect($(headerBadge)).toHaveText("internal");
    await expect($(explorerBadge(existing))).toHaveText("internal");
    const text = await obsidianPage.read(existing);
    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1];
    expect(frontmatter).toMatch(/^classification: internal$/m);
    expect(frontmatter).toMatch(/^topic: handbook$/m);
    expect(text).toContain("Original note content.");
  });

  it("classifies the file selected in the explorer menu and preserves the open note", async () => {
    const openNote = "Open note.md";
    await createFile(openNote);
    await obsidianPage.openFile(openNote);
    await expect($(headerBadge)).toHaveText("unclassified");
    const original = await obsidianPage.read(openNote);

    await $(explorerRow(existing)).click({ button: "right" });
    await $(".menu-item-title=Notiz einstufen").click();
    await expect($(`${modal} p`)).toHaveText("Existing");
    await saveClassification("confidential");

    await expect($(explorerBadge(existing))).toHaveText("confidential");
    expect(await obsidianPage.read(existing)).toMatch(/^classification: confidential$/m);
    expect(await obsidianPage.read(openNote)).toBe(original);
  });

  it("applies one classification to selected notes across folders", async () => {
    const secondNote = "Projects/Batch note.md";
    const folderRules = "Projects/_meta.md";
    const folderContents = "---\nclassification: public\n---\n";
    const attachment = "ZZ Board.canvas";
    const attachmentContents = '{"nodes":[],"edges":[]}';
    const otherNote = "Unselected.md";
    await createFolder("Projects");
    await createFile(secondNote, "Second note content.\n");
    await createFile(folderRules, folderContents);
    await createFile(attachment, attachmentContents);
    await createFile(otherNote, "Unselected note content.\n");
    await $(folderRow("Projects")).click();

    await $(explorerRow(folderRules)).click();
    await browser.action("key").down(Key.Shift).perform(true);
    try {
      await browser.action("pointer").move({ origin: $(explorerRow(existing)) }).down().up().perform(true);
    } finally {
      await browser.releaseActions();
    }
    await $(explorerRow(existing)).click({ button: "right" });
    await $(".menu-item-title=Ausgewählte Notizen einstufen").click();
    await expect($(`${modal} p`)).toHaveText("Ausgewählte Notizen (2)");
    await expect($(`${modal} button.mod-cta`)).toBeDisabled();
    await saveClassification("confidential");
    await expect($(preview).$("summary=Neu setzen (1)")).toBeDisplayed();
    await expect($(preview).$("summary=Vorhandenen Wert überschreiben (1)")).toBeDisplayed();
    await $(preview).$("summary=Neu setzen (1)").click();
    await expect($(preview).$(`li=${secondNote}`)).toBeDisplayed();
    expect(await obsidianPage.read(existing)).toMatch(/^classification: public$/m);
    expect(await obsidianPage.read(secondNote)).toBe("Second note content.\n");
    await $(preview).$("button=Änderungen anwenden").click();

    await expect($(explorerBadge(existing))).toHaveText("confidential");
    await expect($(explorerBadge(secondNote))).toHaveText("confidential");
    const existingContents = await obsidianPage.read(existing);
    expect(existingContents).toMatch(/^classification: confidential$/m);
    expect(existingContents).toMatch(/^topic: handbook$/m);
    expect(existingContents).toContain("Original note content.");
    const secondContents = await obsidianPage.read(secondNote);
    expect(secondContents).toMatch(/^classification: confidential$/m);
    expect(secondContents).toContain("Second note content.");
    expect(await obsidianPage.read(folderRules)).toBe(folderContents);
    expect(await obsidianPage.read(attachment)).toBe(attachmentContents);
    expect(await obsidianPage.read(otherNote)).toBe("Unselected note content.\n");
  });

  it("classifies a binary attachment while preserving the existing _meta.md and its folder rule", async () => {
    const attachment = "Projects/Offer #1.png";
    const metadataPath = "Projects/_meta.md";
    const body = "\r\n# Project documentation\r\n\r\nPreserve this body verbatim.\r\n";
    const metadata = [
      "---", "# Folder default", "classification: confidential # Keep this comment", 'topic: "handbook"',
      "links: [one, two]", "counter: 9007199254740993", "precision: 1.00299003849399405969696969", "attachment-classifications:",
      "  other.png: public # Existing attachment", "---", "",
    ].join("\r\n") + body;
    await createFolder("Projects");
    await createFile(metadataPath, metadata);
    const original = await createImage(attachment);
    await $(folderRow("Projects")).click();

    await $(explorerRow(attachment)).click({ button: "right" });
    await $(".menu-item-title=Anhang einstufen").click();
    await expect($(`${modal} p`)).toHaveText("Offer #1.png");
    await saveClassification("internal");
    await expect($(explorerBadge(attachment))).toHaveText("internal");

    const updated = await obsidianPage.read(metadataPath);
    for (const line of metadata.split("\r\n").filter(Boolean)) expect(updated).toContain(line);
    expect(updated.endsWith(body)).toBe(true);
    expect(await readFile(join(obsidianPage.getVaultPath(), attachment))).toEqual(original);

    await $(explorerBadge(attachment)).click();
    await $(".menu-item-title=public").click();
    await expect($(explorerBadge(attachment))).toHaveText("public");
    await loadSettings({});
    await expect($(explorerBadge(attachment))).toHaveText("public");
    const note = "Projects/New note.md";
    await createFile(note);
    await expect($(explorerBadge(note))).toHaveText("confidential");

    await expect($(explorerBadge(metadataPath))).toHaveText("unclassified");
    await expect($(explorerBadge(metadataPath))).not.toHaveAttribute("aria-haspopup");
    await $(explorerRow(metadataPath)).click({ button: "right" });
    await expect($(".menu-item-title=Notiz einstufen")).not.toExist();
    await browser.keys(Key.Escape);
    await obsidianPage.openFile(metadataPath);
    await expect($(headerBadge)).toHaveText("unclassified");
    await expect($(headerBadge)).not.toHaveAttribute("aria-haspopup");
    await browser.executeObsidianCommand(`${pluginId}:classify-note`);
    await expect($(modal)).not.toExist();
    expect(await obsidianPage.read(metadataPath)).toContain("classification: confidential # Keep this comment");
  });

  it("classifies an open image from its header even when explorer badges are hidden", async () => {
    await loadSettings({ showExplorerClassifications: false });
    const first = "First.png";
    const second = "Second.png";
    const original = await createImage(first);
    await createImage(second);

    await obsidianPage.openFile(first);
    await expect($(headerBadge)).toHaveText("Einstufen");
    await expect($(headerBadge)).toHaveAttribute("aria-label", "Anhang einstufen");
    await browser.execute((selector) => document.querySelector<HTMLElement>(selector)?.focus(), headerBadge);
    await browser.keys(Key.Enter);
    await $(".menu-item-title=confidential").click();
    await expect($(headerBadge)).toHaveText("confidential");
    await expect($(explorerBadge(first))).not.toExist();

    await obsidianPage.openFile(second);
    await expect($(headerBadge)).toHaveText("Einstufen");
    await $(headerBadge).click();
    await $(".menu-item-title=internal").click();
    await expect($(headerBadge)).toHaveText("internal");
    const metadata = await obsidianPage.read("_meta.md");
    expect(metadata).toContain("First.png: confidential");
    expect(metadata).toContain("Second.png: internal");
    expect(await readFile(join(obsidianPage.getVaultPath(), first))).toEqual(original);

    await $(headerBadge).click();
    await $(".menu-item-title=public").click();
    await expect($(headerBadge)).toHaveText("public");
    await obsidianPage.disablePlugin(pluginId);
    await expect($(headerBadge)).not.toExist();
  });

  it("previews and applies a mixed selection and moves attachment classifications with their files", async () => {
    const board = "Board.canvas";
    const renamed = "Renamed.canvas";
    const moved = "Projects/Renamed.canvas";
    const contents = '{"nodes":[],"edges":[]}';
    await createFolder("Projects");
    await createFile(board, contents);
    await $(explorerRow(board)).click();
    await browser.action("key").down(Key.Shift).perform(true);
    try {
      await browser.action("pointer").move({ origin: $(explorerRow(existing)) }).down().up().perform(true);
    } finally {
      await browser.releaseActions();
    }
    await $(explorerRow(existing)).click({ button: "right" });
    await $(".menu-item-title=Ausgewählte Dateien einstufen").click();
    await expect($(`${modal} p`)).toHaveText("Ausgewählte Dateien (2)");
    await saveClassification("internal");
    await expect($(preview).$("summary=Neu setzen (1)")).toBeDisplayed();
    await expect($(preview).$("summary=Vorhandenen Wert überschreiben (1)")).toBeDisplayed();
    await $(preview).$("button=Änderungen anwenden").click();
    await expect($(explorerBadge(board))).toHaveText("internal");
    await expect($(explorerBadge(existing))).toHaveText("internal");

    const rename = async (from: string, to: string) => browser.executeObsidian(async ({ app }, oldPath, newPath) => {
      const file = app.vault.getFileByPath(oldPath);
      if (!file) throw new Error("Attachment is missing");
      await app.fileManager.renameFile(file, newPath);
    }, from, to);
    await rename(board, renamed);
    await expect($(explorerBadge(renamed))).toHaveText("internal");
    expect(await obsidianPage.read("_meta.md")).not.toContain(board);
    await rename(renamed, moved);
    await browser.waitUntil(async () => !(await obsidianPage.read("_meta.md")).includes(renamed));
    if (!await $(explorerRow(moved)).isDisplayed()) await $(folderRow("Projects")).click();
    await expect($(explorerBadge(moved))).toHaveText("internal");
    expect(await obsidianPage.read("Projects/_meta.md")).toContain(`${renamed}: internal`);
    expect(await obsidianPage.read(moved)).toBe(contents);
  });

  it("leaves _meta.md intact when its attachment field is already used for non-mapping data", async () => {
    const original = "---\nclassification: internal\nattachment-classifications: [original data]\n---\n\nNotes.\n";
    await createFile("_meta.md", original);
    await createImage("Offer.png");
    await $(explorerRow("Offer.png")).click({ button: "right" });
    await $(".menu-item-title=Anhang einstufen").click();
    await saveClassification("confidential");
    await expect($(".notice=Classificator: „Offer“ konnte nicht eingestuft werden.")).toBeDisplayed();
    expect(await obsidianPage.read("_meta.md")).toBe(original);
    await expect($(explorerBadge("Offer.png"))).not.toExist();
  });

  it("preserves an existing flow-style _meta.md when adding an attachment entry", async () => {
    const properties = 'classification: internal, topic: "handbook", precision: 1.00299003849399405969696969';
    await createFile("_meta.md", `---\n{ ${properties} } # Existing comment\n---\n\nExisting body.\n`);
    await createImage("Offer.png");
    await $(explorerRow("Offer.png")).click({ button: "right" });
    await $(".menu-item-title=Anhang einstufen").click();
    await saveClassification("confidential");

    await expect($(explorerBadge("Offer.png"))).toHaveText("confidential");
    expect(await obsidianPage.read("_meta.md")).toContain(`${properties} } # Existing comment\n---\n\nExisting body.\n`);
  });

  it("keeps the header badge as text despite saved header appearance settings", async () => {
    const badgeStyles = { explorer: "dot", header: "dot" } as const;
    await loadSettings({
      explorerBadgeStyle: "dot",
      showNoteBadge: false,
      classifications: [
        { value: "public", color: "green", badgeStyles },
        { value: "internal", color: "blue" },
      ],
    });
    await obsidianPage.openFile(existing);

    const badge = $(`${explorerBadge(existing)}.classificator-badge--dot`);
    const header = $(".workspace-split.mod-root .classificator-badge--header");
    await expect(badge).toBeDisplayed();
    await expect(badge).toHaveAttribute("aria-label", "Einstufung ändern: public");
    await expect(badge).toHaveAttribute("data-color", "green");
    await badge.moveTo();
    expect((await badge.getCSSProperty("background-color")).value).toBe("rgba(0,0,0,0)");
    expect((await badge.getCSSProperty("border-top-width")).value).toBe("1px");
    await expect(header).toHaveText("public");
    await badge.click();
    await $(".menu-item-title=internal").click();
    await expect(badge).toHaveAttribute("aria-label", "Einstufung ändern: internal");
    await expect(header).toHaveText("internal");
  });

  it("saves per-classification explorer styles and keeps the header badge visible", async () => {
    await loadSettings({ explorerBadgeStyle: "dot" });
    const internal = "Internal note.md";
    const confidential = "Confidential note.md";
    const contents = "---\nclassification: confidential\n---\n\nConfidential note content.\n";
    await createFile(internal, "---\nclassification: internal\n---\n");
    await createFile(confidential, contents);
    await obsidianPage.openFile(confidential);
    await expect($(`${explorerBadge(confidential)}.classificator-badge--dot`)).toBeDisplayed();
    await expect($(headerBadge)).toHaveText("confidential");

    const mainWindow = await openSettings();
    try {
      await expect(explorerStyle("public")).toHaveValue("dot");
      await expect($('.classificator-classification-setting select[aria-label="Notizkopf"]')).not.toExist();
      await explorerStyle("internal").selectByAttribute("value", "label");
      await explorerStyle("confidential").selectByAttribute("value", "hidden");
      await expect($(".classificator-message--success")).toHaveText("Einstellungen gespeichert.");
    } finally {
      await closeSettings(mainWindow);
    }

    await expect($(explorerBadge(confidential))).not.toExist();
    await expect($(headerBadge)).toHaveText("confidential");
    expect(await obsidianPage.read(confidential)).toBe(contents);
    await expect($(`${explorerBadge(existing)}.classificator-badge--dot`)).toBeDisplayed();
    await expect($(explorerBadge(internal))).toHaveText("internal");

    await obsidianPage.disablePlugin(pluginId);
    await obsidianPage.enablePlugin(pluginId);
    await obsidianPage.openFile(existing);
    await expect($(headerBadge)).toHaveText("public");
    await expect($(explorerBadge(confidential))).not.toExist();

    await obsidianPage.openFile(internal);
    const badge = $(headerBadge);
    await expect(badge).toHaveText("internal");
    await badge.click();
    await $(".menu-item-title=confidential").click();
    await expect(badge).toHaveText("confidential");
    await expect($(explorerBadge(internal))).not.toExist();
    expect(await obsidianPage.read(internal)).toMatch(/^classification: confidential$/m);

    await browser.executeObsidianCommand(`${pluginId}:classify-note`);
    await saveClassification("public");
    await expect($(headerBadge)).toHaveText("public");
    await expect($(`${explorerBadge(internal)}.classificator-badge--dot`)).toBeDisplayed();
  });

  it("toggles explorer badges from the toolbar and restores their configured styles", async () => {
    await loadSettings({
      classifications: [
        { value: "public", color: "green", badgeStyles: { explorer: "label" } },
        { value: "internal", color: "blue", badgeStyles: { explorer: "dot" } },
        { value: "confidential", color: "red", badgeStyles: { explorer: "hidden" } },
      ],
      showExplorerBadge: false,
    });
    const internal = "Internal note.md";
    const confidential = "Confidential note.md";
    await createFile(internal, "---\nclassification: internal\n---\n");
    await createFile(confidential, "---\nclassification: confidential\n---\n");
    await obsidianPage.openFile(existing);
    const contents = await obsidianPage.read(existing);
    const header = $(".workspace-split.mod-root .classificator-badge--header");
    const toggle = $(explorerToggle);

    await expect(toggle).toHaveAttribute("aria-label", "Einstufungen im Dateibaum anzeigen");
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect($(explorerBadge(existing))).toHaveText("public");
    await expect($(`${explorerBadge(internal)}.classificator-badge--dot`)).toBeDisplayed();
    await expect($(explorerBadge(confidential))).not.toExist();

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect($(explorerBadge(existing))).not.toExist();
    await expect($(explorerBadge(internal))).not.toExist();
    await expect(header).toHaveText("public");
    await browser.waitUntil(async () => {
      const data: unknown = JSON.parse(await readFile(settingsPath(), "utf8"));
      return (data as Partial<ClassificatorSettings>).showExplorerClassifications === false;
    });
    await obsidianPage.disablePlugin(pluginId);
    await expect(toggle).not.toExist();
    await obsidianPage.enablePlugin(pluginId);
    await expect($(explorerToggle)).toHaveAttribute("aria-pressed", "false");
    await expect($(explorerBadge(existing))).not.toExist();

    await browser.execute((selector) => document.querySelector<HTMLElement>(selector)?.focus(), explorerToggle);
    await browser.keys(Key.Space);
    await expect($(explorerToggle)).toHaveAttribute("aria-pressed", "true");
    await expect($(explorerBadge(existing))).toHaveText("public");
    await expect($(`${explorerBadge(internal)}.classificator-badge--dot`)).toBeDisplayed();
    await expect($(explorerBadge(confidential))).not.toExist();
    await expect(header).toHaveText("public");
    expect(await obsidianPage.read(existing)).toBe(contents);
  });

  it("right-aligns note labels and dots with attachment badges in the file explorer", async () => {
    await loadSettings({
      classifications: [
        { value: "public", color: "green", badgeStyles: { explorer: "label" } },
        { value: "internal", color: "blue", badgeStyles: { explorer: "dot" } },
      ],
    });
    const note = "Longer note title.md";
    const attachment = "Image.png";
    await createFile(note, "---\nclassification: internal\n---\n");
    await createImage(attachment);
    await createFile("_meta.md", "---\nattachment-classifications:\n  Image.png: public\n---\n");

    const badges = [existing, note, attachment].map(explorerBadge);
    for (const selector of badges) await expect($(selector)).toBeDisplayed();
    const rightOffsets = await browser.execute((selectors) => selectors.map((selector) => {
      const badge = document.querySelector<HTMLElement>(selector);
      const row = badge?.parentElement;
      if (!badge || !row) throw new Error(`Missing explorer badge for ${selector}`);
      const style = getComputedStyle(row);
      const rowContentRight = row.getBoundingClientRect().right - parseFloat(style.paddingRight) - parseFloat(style.borderRightWidth);
      return Math.abs(rowContentRight - badge.getBoundingClientRect().right);
    }), badges);

    for (const offset of rightOffsets) expect(offset).toBeLessThan(1);
  });

  it("opens the header menu by keyboard and removes it on unload", async () => {
    await loadSettings({ showExplorerBadge: false });
    await obsidianPage.openFile(existing);

    await expect($(headerBadge)).toHaveText("public");
    await expect($(explorerBadge(existing))).not.toExist();
    await browser.execute((selector) => document.querySelector<HTMLElement>(selector)?.focus(), headerBadge);
    await browser.keys(Key.Enter);
    await expect($(".menu-item-title=public")).toBeDisplayed();
    await browser.keys(Key.Escape);
    await expect($(".menu-item-title=public")).not.toExist();

    await $(headerBadge).click();
    await expect($(".menu-item-title=public")).toBeDisplayed();
    await obsidianPage.disablePlugin(pluginId);
    await expect($(headerBadge)).not.toExist();
    await expect($(".menu-item-title=public")).not.toExist();
  });

  it("applies a freshly written folder classification and uses the global default in a subfolder", async () => {
    await loadSettings({ defaultClassification: "public" });
    await createFolder("Projects");
    await createFolder("Projects/Archive");
    await createFile("Projects/_meta.md", "---\nclassification: confidential\n---\n");
    await createFile("Projects/Brief.md");
    await createFile("Projects/Archive/Old brief.md");

    await browser.waitUntil(async () => (await obsidianPage.read("Projects/Brief.md")).includes("classification: confidential"));
    await browser.waitUntil(async () => (await obsidianPage.read("Projects/Archive/Old brief.md")).includes("classification: public"));
  });

  it("inherits the nearest folder rule when enabled, including a rule at the vault root", async () => {
    await loadSettings({ defaultClassification: "public" });
    const mainWindow = await openSettings();
    try {
      const toggle = $(".checkbox-container[aria-label='Ordnerregeln vererben']");
      await expect(toggle).not.toHaveElementClass("is-enabled");
      await toggle.click();
      await expect($(".classificator-message--success")).toHaveText("Einstellungen gespeichert.");
    } finally {
      await closeSettings(mainWindow);
    }
    await obsidianPage.disablePlugin(pluginId);
    await obsidianPage.enablePlugin(pluginId);
    await createFolder("Projects");
    await createFolder("Projects/Archive");
    await createFolder("Projects/Archive/Older");
    await createFolder("Other");
    await createFile("_meta.md", "---\nclassification: internal\n---\n");
    await createFile("Projects/_meta.md", "---\nclassification: confidential\n---\n");
    await createFile("Projects/Archive/Older/_meta.md", "---\nclassification: public\n---\n");
    await createFile("Projects/Archive/Inherited.md");
    await createFile("Projects/Archive/Older/Override.md");
    await createFile("Other/From root.md");

    await browser.waitUntil(async () => (await obsidianPage.read("Projects/Archive/Inherited.md")).includes("classification: confidential"));
    await browser.waitUntil(async () => (await obsidianPage.read("Projects/Archive/Older/Override.md")).includes("classification: public"));
    await browser.waitUntil(async () => (await obsidianPage.read("Other/From root.md")).includes("classification: internal"));
    await $(folderRow("Projects")).click();
    await openFolderSettings("Projects/Archive");
    await expect($(folderClassification)).toHaveValue("");
    await expect($(`${folderClassification} option:checked`)).toHaveText("Geerbt von Projects (confidential)");
  });

  it("creates _meta.md with the classification selected in a folder's context menu", async () => {
    await createFolder("Projects");
    const note = "Projects/Brief.md";
    const contents = "Existing brief.\n";
    await createFile(note, contents);
    await openFolderSettings("Projects");
    await $(folderClassification).selectByAttribute("value", "internal");
    await $(folderModal).$("button=Regel speichern").click();

    await openFolderSettings("Projects");
    expect(await $(folderClassification).getValue()).toBe("internal");
    expect(await obsidianPage.read("Projects/_meta.md")).toMatch(/^classification: internal$/m);
    expect(await obsidianPage.read(note)).toBe(contents);
  });

  it("previews folder batches by scope, applies them separately, and skips changes made after review", async () => {
    await createFolder("Projects");
    await createFolder("Projects/Archive");
    const classified = "Projects/Classified.md";
    const classifiedContents = "---\nclassification: 'legacy' # Keep this value\ntopic: handbook\n---\n\nOriginal classified note.\n";
    const blank = "Projects/Blank.md";
    const missing = "Projects/Archive/Missing.md";
    const unclassified = "Projects/Archive/Unclassified.md";
    const nestedRules = "Projects/Archive/_meta.md";
    const ruleContents = "---\nclassification: public\n---\n";
    const attachment = "Projects/Attachment.txt";
    const outsideContents = await obsidianPage.read(existing);
    await createFile(classified, classifiedContents);
    await createFile(blank, "---\nclassification:\n---\n\nBlank classification.\n");
    await createFile(missing, "Missing classification.\n");
    await createFile(unclassified, "---\nclassification: unclassified\n---\n\nUnclassified note.\n");
    await createFile(nestedRules, ruleContents);
    await createFile(attachment, "Attachment contents.");

    await openFolderSettings("Projects");
    await expect($(folderScope)).toHaveValue("direct");
    await expect($(folderNoteMode)).toHaveValue("unclassified");
    await $(folderClassification).selectByAttribute("value", "internal");
    await $(folderModal).$("button=Änderungen prüfen").click();
    await expect($(preview).$("summary=Neu setzen (1)")).toBeDisplayed();
    await expect($(preview).$("summary=Überspringen (1)")).toBeDisplayed();
    await $(preview).$("button=Abbrechen").click();
    expect(await obsidianPage.read(blank)).toContain("classification:\n");
    expect(await obsidianPage.read(missing)).toBe("Missing classification.\n");

    await expect($(folderClassification)).toHaveValue("internal");
    await $(folderScope).selectByAttribute("value", "recursive");
    await $(folderModal).$("button=Änderungen prüfen").click();
    await expect($(preview).$("summary=Neu setzen (2)")).toBeDisplayed();
    await expect($(preview).$("summary=Vorhandenen Wert überschreiben (1)")).toBeDisplayed();
    await $(preview).$("button=Änderungen anwenden").click();

    for (const path of [blank, missing, unclassified]) {
      await browser.waitUntil(async () => /^classification: internal$/m.test(await obsidianPage.read(path)));
    }
    expect(await obsidianPage.read(classified)).toBe(classifiedContents);
    expect(await browser.executeObsidian(({ app }) => app.vault.getFileByPath("Projects/_meta.md") === null)).toBe(true);

    await expect($(folderModal)).toBeDisplayed();
    await $(folderClassification).selectByAttribute("value", "confidential");
    await $(folderNoteMode).selectByAttribute("value", "always");
    await $(folderModal).$("button=Änderungen prüfen").click();
    await expect($(preview).$("summary=Vorhandenen Wert überschreiben (4)")).toBeDisplayed();
    await browser.executeObsidian(async ({ app }, path, toMove) => {
      const file = app.vault.getFileByPath(path);
      const moving = app.vault.getFileByPath(toMove);
      if (!file || !moving) throw new Error("Missing a file from the preview");
      await app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
        frontmatter.classification = "public";
      });
      await app.fileManager.renameFile(moving, "Moved.md");
    }, classified, missing);
    await $(preview).$("button=Änderungen anwenden").click();

    for (const path of [blank, unclassified]) {
      await browser.waitUntil(async () => /^classification: confidential$/m.test(await obsidianPage.read(path)));
    }
    await expect($(".classificator-batch-notice=Einstufung abgeschlossen. Geändert: 2. Übersprungen: 2. Fehlgeschlagen: 0.")).toBeDisplayed();
    expect(await obsidianPage.read(classified)).toMatch(/^classification: public$/m);
    expect(await obsidianPage.read("Moved.md")).toMatch(/^classification: internal$/m);
    expect(await obsidianPage.read(nestedRules)).toBe(ruleContents);
    expect(await obsidianPage.read(attachment)).toBe("Attachment contents.");
    expect(await obsidianPage.read(existing)).toBe(outsideContents);
    await $(folderModal).$("button=Regel speichern").click();
    await browser.waitUntil(async () => /^classification: confidential$/m.test(await obsidianPage.read("Projects/_meta.md")));
  });

  it("removes the classification when reset to global and preserves the rest of _meta.md", async () => {
    await loadSettings({ defaultClassification: "public" });
    await createFolder("Projects");
    await createFile("Projects/_meta.md", "---\nclassification: confidential\ntopic: handbook\n---\n\nFolder notes.\n");

    await openFolderSettings("Projects");
    expect(await $(folderClassification).getValue()).toBe("confidential");
    await $(folderClassification).selectByAttribute("value", "");
    await $(folderModal).$("button=Regel speichern").click();

    await browser.waitUntil(async () => !(await obsidianPage.read("Projects/_meta.md")).includes("classification:"));
    const metadata = await obsidianPage.read("Projects/_meta.md");
    expect(metadata).toMatch(/^topic: handbook$/m);
    expect(metadata).toContain("Folder notes.");

    await createFile("Projects/New brief.md");
    await browser.waitUntil(async () => (await obsidianPage.read("Projects/New brief.md")).includes("classification: public"));
  });

  it("filters classification issues by status and folder and opens the chosen note", async () => {
    await createFolder("Projects");
    await createFolder("Projects/Archive");
    await createFolder("Projects 2025");
    await createFile("Projects/Missing.md", "Missing classification.\n");
    await createFile("Projects/Blank.md", "---\nclassification:\n---\n");
    await createFile("Projects/Unclassified.md", "---\nclassification: unclassified\n---\n");
    await createFile("Projects/Archive/Legacy.md", "---\nclassification: legacy\n---\n");
    await createFile("Projects/Archive/List.md", "---\nclassification: [public]\n---\n");
    await createFile("Projects 2025/Outside.md", "---\nclassification: legacy\n---\n");
    await createFile("Projects/_meta.md", "---\nclassification: legacy\n---\n");
    await browser.waitUntil(() => browser.executeObsidian(({ app }) => {
      const file = app.vault.getFileByPath("Projects/Archive/List.md");
      return !!file && Array.isArray(app.metadataCache.getFileCache(file)?.frontmatter?.classification);
    }));
    await browser.executeObsidianCommand(`${pluginId}:classification-overview`);
    await expect($(overview)).toBeDisplayed();
    await expect($(`${overview} [role="status"]`)).toHaveText("Passende Notizen (6)");
    const status = $(`${overview} select[aria-label="Status"]:not([aria-hidden="true"])`);
    const folder = $(`${overview} select[aria-label="Ordner"]:not([aria-hidden="true"])`);
    await status.selectByAttribute("value", "missing");
    await expect($(`${overview} [role="status"]`)).toHaveText("Passende Notizen (2)");
    await status.selectByAttribute("value", "unclassified");
    await expect($(overview).$("button=Projects/Unclassified.md")).toBeDisplayed();
    await status.selectByAttribute("value", "unknown");
    await folder.selectByAttribute("value", "Projects");
    await expect($(`${overview} [role="status"]`)).toHaveText("Passende Notizen (2)");
    await expect($(overview).$("span=Unbekannte Einstufung (legacy)")).toBeDisplayed();
    await expect($(overview).$("button=Projects/Archive/List.md")).toBeDisplayed();
    await expect($(overview).$("button=Projects 2025/Outside.md")).not.toExist();
    await $(overview).$("button=Projects/Archive/Legacy.md").click();
    await expect($(overview)).not.toExist();
    await expect($(headerBadge)).toHaveText("legacy");
  });

  it("updates and persists the interface language and can return to the Obsidian language", async () => {
    const languageSelect = (label: string) => $(`select[aria-label="${label}"]:not([aria-hidden="true"])`);
    await obsidianPage.openFile(existing);
    await expect($(headerBadge)).toHaveAttribute("aria-label", "Einstufung ändern: public");

    let mainWindow = await openSettings();
    try {
      await languageSelect("Sprache").selectByAttribute("value", "fr");
      await expect($(".setting-item-name=Nouvelles notes")).toBeDisplayed();
      await expect($(".classificator-settings-header .classificator-about-meta")).toBeDisplayed();
      await expect($(".classificator-message--success")).toHaveText("Paramètres enregistrés.");
    } finally {
      await closeSettings(mainWindow);
    }

    await expect($(headerBadge)).toHaveAttribute("aria-label", "Modifier la classification : public");
    const commandName = await browser.executeObsidian(({ app }) => {
      const { commands } = app as unknown as { commands: { commands: Record<string, { name: string }> } };
      return commands.commands["classificator:classify-note"]?.name;
    });
    expect(commandName).toBe("Classificator: Classer la note active");

    await browser.executeObsidianCommand(`${pluginId}:classify-note`);
    await expect($(`${modal} .modal-title`)).toHaveText("Classer la note");
    await saveClassification("internal");
    await expect($(headerBadge)).toHaveText("internal");
    expect(await obsidianPage.read(existing)).toMatch(/^classification: internal$/m);

    await browser.waitUntil(async () => {
      const data: unknown = JSON.parse(await readFile(settingsPath(), "utf8"));
      return (data as Partial<ClassificatorSettings>).language === "fr";
    });
    await obsidianPage.disablePlugin(pluginId);
    await obsidianPage.enablePlugin(pluginId);
    mainWindow = await openSettings();
    try {
      await expect(languageSelect("Langue")).toHaveValue("fr");
      await languageSelect("Langue").selectByAttribute("value", "auto");
      await expect($(".setting-item-name=New notes")).toBeDisplayed();
      await expect(languageSelect("Language")).toHaveValue("auto");
    } finally {
      await closeSettings(mainWindow);
    }
  });

  it("shows the introduction once and opens both help dialogs from settings and commands", async () => {
    await loadSettings({ introductionSeen: false });
    const intro = $(".classificator-introduction-modal");
    const about = $(".classificator-about-modal");
    const next = () => intro.$("button.mod-cta");
    await expect(intro.$("h3")).toHaveText("Eine Notiz einstufen");
    await expect(intro.$(".classificator-intro-progress")).toHaveText("Schritt 1 von 3");
    await next().click();
    await expect(intro.$("h3")).toHaveText("Standard für neue Notizen festlegen");
    await intro.$("button=Zurück").click();
    await expect(intro.$("h3")).toHaveText("Eine Notiz einstufen");
    await next().click();
    await next().click();
    await expect(intro.$("h3")).toHaveText("Ordnerregeln festlegen");
    await expect(next()).toHaveText("Fertig");
    await next().click();
    await expect(intro).not.toExist();
    await browser.waitUntil(async () => {
      const settings: unknown = JSON.parse(await readFile(settingsPath(), "utf8"));
      return (settings as Partial<ClassificatorSettings>).introductionSeen === true;
    });

    await obsidianPage.disablePlugin(pluginId);
    await obsidianPage.enablePlugin(pluginId);
    const mainWindow = await openSettings();
    try {
      const header = $(".classificator-settings-header");
      await expect(header).toHaveElementClass("setting-item-heading");
      await expect(header.$(".setting-item-name")).toHaveText(manifest.name);
      await expect(header.$(".classificator-about-meta")).toHaveText(expect.stringContaining(manifest.version));
      await expect(header.$(".classificator-about-meta")).toHaveText(expect.stringContaining(manifest.author));
      await expect(header.$('a[href="https://github.com/nblum/obsidian-classificator#readme"]')).toHaveText("Dokumentation");
      await $("button=Einführung anzeigen").click();
      await expect(intro.$("h3")).toHaveText("Eine Notiz einstufen");
      await browser.keys("Escape");
      await $("button=Über Classificator").click();
      await expect(about.$('a[href="https://github.com/nblum/obsidian-classificator/issues/new"]')).toHaveText("Feedback geben");
      await about.$("button=Schließen").click();
    } finally {
      await closeSettings(mainWindow);
    }

    await browser.executeObsidianCommand(`${pluginId}:show-introduction`);
    await expect(intro).toBeDisplayed();
    await browser.keys("Escape");
    await browser.executeObsidianCommand(`${pluginId}:show-about`);
    await expect(about.$(".modal-title")).toHaveText("Über Classificator");
    await about.$("button=Schließen").click();
  });

  it("finds Classificator options through Obsidian's settings search", async function () {
    const supportsSettingsSearch = await browser.executeObsidian(({ obsidian }) => obsidian.requireApiVersion("1.13.0"));
    if (!supportsSettingsSearch) this.skip();

    const mainWindow = await openSettings();
    try {
      await $(".setting-search-container input").setValue("public");
      const result = $(".setting-search-results").$(".vertical-tab-nav-item-title=public");
      await expect(result).toBeDisplayed();
      await result.click();
      await expect(explorerStyle("public")).toBeDisplayed();
    } finally {
      await closeSettings(mainWindow);
    }
  });

  it("shows a failed settings save and recovers on the next change", async () => {
    await browser.executeObsidian(({ plugins }) => {
      const plugin = plugins.classificator as Classificator;
      const save = plugin.saveData.bind(plugin);
      plugin.saveData = () => {
        plugin.saveData = save;
        return Promise.reject(new Error("Simulated save failure"));
      };
    });
    const waitForStatus = (tone: string, text: string) => browser.waitUntil(() => browser.execute((className, expected) => {
      const status = document.querySelector('.classificator-settings-status[role="status"]');
      return status?.querySelector(className)?.textContent === expected;
    }, `.classificator-message--${tone}`, text), { timeoutMsg: `Settings status did not show: ${text}` });
    const mainWindow = await openSettings();
    try {
      const select = (label: string) => $(`select[aria-label="${label}"]:not([aria-hidden="true"])`);
      await select("Sprache").selectByAttribute("value", "en");
      await waitForStatus("error", "Classificator: Could not save settings.");
      await select("Language").selectByAttribute("value", "de");
      await waitForStatus("success", "Einstellungen gespeichert.");
    } finally {
      await closeSettings(mainWindow);
    }
  });
});
