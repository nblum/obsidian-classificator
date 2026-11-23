import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { $, browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";
import manifest from "../../manifest.json" with { type: "json" };
import type Classificator from "../../src/main";
import type { ClassificatorSettings } from "../../src/settings";
import { closeSettings, openSettings } from "./obsidian-settings";

const pluginId = "classificator";
const existing = "Existing.md";
const modal = ".classificator-selection-modal";
const folderModal = ".classificator-folder-settings-modal";
const folderClassification = `${folderModal} select[aria-label="Standardeinstufung"]:not([aria-hidden="true"])`;
const headerBadge = ".workspace-leaf.mod-active .classificator-badge--header";

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

async function openFolderSettings(path: string): Promise<void> {
  await $(folderRow(path)).click({ button: "right" });
  await $(".menu-item-title=Classificator: Ordnerregeln").click();
  await expect($(folderModal)).toBeDisplayed();
}

async function loadSettings(settings: Partial<ClassificatorSettings>): Promise<void> {
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
    await saveClassification("internal");
    await expect($(headerBadge)).toHaveText("internal");
    await expect($(explorerBadge(path))).toHaveText("internal");
    expect(await obsidianPage.read(path)).toMatch(/^---\r?\nclassification: internal\r?\n---/);
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

  it("displays a labeled color dot with the header badge disabled", async () => {
    await loadSettings({ explorerBadgeStyle: "dot", showNoteBadge: false });
    await obsidianPage.openFile(existing);

    const badge = $(`${explorerBadge(existing)}.classificator-badge--dot`);
    await expect(badge).toBeDisplayed();
    await expect(badge).toHaveAttribute("aria-label", "public");
    await expect(badge).toHaveAttribute("title", "public");
    await expect(badge).toHaveAttribute("data-color", "green");
    await expect($(headerBadge)).not.toExist();
  });

  it("keeps the header badge with the explorer badge disabled and removes it on unload", async () => {
    await loadSettings({ showExplorerBadge: false });
    await obsidianPage.openFile(existing);

    await expect($(headerBadge)).toHaveText("public");
    await expect($(explorerBadge(existing))).not.toExist();
    await obsidianPage.disablePlugin(pluginId);
    await expect($(headerBadge)).not.toExist();
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

  it("creates _meta.md with the classification selected in a folder's context menu", async () => {
    await createFolder("Projects");
    await openFolderSettings("Projects");
    await $(folderClassification).selectByAttribute("value", "internal");
    await $(`${folderModal} button.mod-cta`).click();

    await openFolderSettings("Projects");
    expect(await $(folderClassification).getValue()).toBe("internal");
    expect(await obsidianPage.read("Projects/_meta.md")).toMatch(/^classification: internal$/m);
  });

  it("removes the classification when reset to global and preserves the rest of _meta.md", async () => {
    await loadSettings({ defaultClassification: "public" });
    await createFolder("Projects");
    await createFile("Projects/_meta.md", "---\nclassification: confidential\ntopic: handbook\n---\n\nFolder notes.\n");

    await openFolderSettings("Projects");
    expect(await $(folderClassification).getValue()).toBe("confidential");
    await $(folderClassification).selectByAttribute("value", "");
    await $(`${folderModal} button.mod-cta`).click();

    await browser.waitUntil(async () => !(await obsidianPage.read("Projects/_meta.md")).includes("classification:"));
    const metadata = await obsidianPage.read("Projects/_meta.md");
    expect(metadata).toMatch(/^topic: handbook$/m);
    expect(metadata).toContain("Folder notes.");

    await createFile("Projects/New brief.md");
    await browser.waitUntil(async () => (await obsidianPage.read("Projects/New brief.md")).includes("classification: public"));
  });

  it("updates and persists the interface language and can return to the Obsidian language", async () => {
    const languageSelect = (label: string) => $(`select[aria-label="${label}"]:not([aria-hidden="true"])`);
    await obsidianPage.openFile(existing);
    await expect($(headerBadge)).toHaveAttribute("aria-label", "Einstufung ändern: public");

    let mainWindow = await openSettings();
    try {
      await languageSelect("Sprache").selectByAttribute("value", "fr");
      await expect($(".setting-item-name=Nouvelles notes")).toBeDisplayed();
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
      await expect(header.$("h2")).toHaveText(manifest.name);
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

  it("shows a failed settings save and recovers on the next change", async () => {
    await browser.executeObsidian(({ plugins }) => {
      const plugin = plugins.classificator as Classificator;
      const save = plugin.saveData.bind(plugin);
      plugin.saveData = () => {
        plugin.saveData = save;
        return Promise.reject(new Error("Simulated save failure"));
      };
    });
    const status = $(".classificator-settings-status");
    const mainWindow = await openSettings();
    try {
      const select = (label: string) => $(`select[aria-label="${label}"]:not([aria-hidden="true"])`);
      await select("Sprache").selectByAttribute("value", "en");
      await expect(status.$(".classificator-message--error")).toHaveText("Classificator: Could not save settings.");
      await expect(status).toHaveAttribute("role", "status");
      await select("Language").selectByAttribute("value", "de");
      await expect(status.$(".classificator-message--success")).toHaveText("Einstellungen gespeichert.");
    } finally {
      await closeSettings(mainWindow);
    }
  });
});
