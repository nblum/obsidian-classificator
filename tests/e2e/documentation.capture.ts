import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { $, browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";
import { closeSettings, openSettings } from "./obsidian-settings";
import assets from "./screenshot-assets.json" with { type: "json" };

const pluginId = "classificator";
const output = resolve("e2e-results/screenshots");
const intro = ".classificator-introduction-modal";
const about = ".classificator-about-modal";
const folder = ".classificator-folder-settings-modal";
const headerBadge = ".workspace-leaf.mod-active .classificator-badge--header";
const lastExplorerRow = '.nav-file-title[data-path="Team playbook.md"]';
type Region = { x: number; y: number; width: number; height: number };

async function setViewport(): Promise<void> {
  await browser.sendCommand("Emulation.setDeviceMetricsOverride", {
    width: 1280, height: 900, deviceScaleFactor: 1, mobile: false,
  });
  await expect($("body")).toHaveElementClass("theme-light");
}

async function capture(filename: string, target: string | Region): Promise<void> {
  await browser.execute(async () => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    await document.fonts.ready;
    await new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));
  });
  let image: string;
  if (typeof target === "string") {
    const element = $(target);
    await expect(element).toBeDisplayed();
    await element.waitForStable();
    image = await browser.takeElementScreenshot((await element.getElement()).elementId);
  } else {
    const result: unknown = await browser.sendCommandAndGetResult("Page.captureScreenshot", {
      format: "png", clip: { ...target, scale: 1 },
    });
    if (!result || typeof result !== "object" || !("data" in result) || typeof result.data !== "string") {
      throw new Error(`Chromium did not return the image for ${filename}.`);
    }
    image = result.data;
  }
  await writeFile(join(output, filename), Buffer.from(image, "base64"));
}

async function settingsRegion(): Promise<Region> {
  return browser.execute(() => {
    const header = document.querySelector(".classificator-settings-header")?.getBoundingClientRect();
    const status = document.querySelector(".classificator-settings-status")?.getBoundingClientRect();
    if (!header || !status) throw new Error("The settings header or save status is missing.");
    const x = Math.max(0, Math.floor(header.left) - 16);
    const y = Math.max(0, Math.floor(header.top) - 12);
    return {
      x, y,
      width: Math.min(innerWidth, Math.ceil(header.right) + 16) - x,
      height: Math.min(innerHeight, Math.ceil(status.bottom) + 12) - y,
    };
  });
}

async function explorerRegion(): Promise<Region> {
  await $(lastExplorerRow).waitForStable();
  return browser.execute((rowSelector) => {
    const toolbar = document.querySelector(".nav-header")?.getBoundingClientRect();
    const lastRow = document.querySelector(rowSelector)?.getBoundingClientRect();
    if (!toolbar || !lastRow) throw new Error("The file explorer toolbar or final row is missing.");
    const x = Math.floor(toolbar.left);
    const y = Math.floor(toolbar.top);
    return { x, y, width: Math.ceil(toolbar.right) - x, height: Math.ceil(lastRow.bottom) + 16 - y };
  }, lastExplorerRow);
}

describe("Classificator documentation screenshots (opt-in)", () => {
  before(async () => {
    await mkdir(output, { recursive: true });
    await Promise.all([...assets.map(({ filename }) => filename), "index.html"].map((filename) =>
      rm(join(output, filename), { force: true })));
    await writeFile(join(obsidianPage.getVaultPath(), ".obsidian", "plugins", pluginId, "data.json"),
      JSON.stringify({ language: "en" }));
    await copyFile("assets/teaser/teaser.png", join(obsidianPage.getVaultPath(), "Projects", "Cover.png"));
    await setViewport();
    await obsidianPage.enablePlugin(pluginId);
  });

  it("captures classification workflows, the file explorer, settings and help", async () => {
    await expect($(`${intro} h3`)).toHaveText("Classify a note");
    await capture("introduction.png", intro);
    await browser.keys("Escape");

    await obsidianPage.openFile("Release notes.md");
    await expect($(headerBadge)).toHaveText("public");
    await expect($(`${lastExplorerRow} .classificator-badge--explorer`)).toHaveText("internal");
    // Exclude the vault switcher below the note. Its temporary name changes between runs.
    await capture("classification.png", { x: 0, y: 0, width: 1280, height: 560 });

    await $('.nav-folder-title[data-path="Projects"]').click({ button: "right" });
    await $(".menu-item-title=Classificator: Folder rules").click();
    await expect($(`${folder} select[aria-label="Default classification"]:not([aria-hidden="true"])`)).toHaveValue("confidential");
    await capture("folder-rules.png", folder);
    await browser.keys("Escape");

    const mainWindow = await openSettings();
    try {
      await setViewport();
      await $('.classificator-classification-setting[data-classification="public"] select[aria-label="File explorer"]:not([aria-hidden="true"])')
        .selectByAttribute("value", "dot");
      await expect($(".classificator-message--success")).toHaveText("Settings saved.");
      await capture("settings.png", await settingsRegion());
    } finally {
      await closeSettings(mainWindow);
    }

    await browser.executeObsidianCommand(`${pluginId}:show-about`);
    await expect($(`${about} .modal-title`)).toHaveText("About Classificator");
    await capture("about.png", about);
    await browser.keys("Escape");

    await $('.nav-folder-title[data-path="Projects"]').click();
    await expect($('.nav-file-title[data-path="Projects/Offer.pdf"] .classificator-badge--explorer')).toHaveText("confidential");
    await expect($('.nav-file-title[data-path="Projects/Cover.png"] .classificator-badge--dot')).toBeDisplayed();
    await capture("file-explorer.png", await explorerRegion());

    await obsidianPage.openFile("Projects/Offer.pdf");
    await expect($(headerBadge)).toHaveText("confidential");
    await expect($(".workspace-leaf.mod-active .pdf-viewer-container .page canvas")).toBeDisplayed();
    await $(headerBadge).click();
    await expect($(".menu-item-title=internal")).toBeDisplayed();
    await capture("change-classification.png", { x: 344, y: 40, width: 936, height: 330 });
    await $(".menu-item-title=internal").click();
    await expect($(headerBadge)).toHaveText("internal");
    expect(await obsidianPage.read("Projects/_meta.md")).toContain("Offer.pdf: internal");
  });
});
