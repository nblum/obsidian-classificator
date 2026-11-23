import { Notice, PluginSettingTab, Setting } from "obsidian";
import { renderAbout } from "./help";
import { isLanguagePreference, languageNames } from "./i18n";
import type { LanguagePreference } from "./i18n";
import type Classificator from "./main";

const COLORS = ["gray", "green", "blue", "yellow", "orange", "red", "purple"] as const;
const saveMessages = {
  saving: { tone: "info", key: "status.saving" },
  saved: { tone: "success", key: "status.saved" },
  failed: { tone: "error", key: "errors.settingsSave" },
} as const;

export type Color = typeof COLORS[number];
export type CreationMode = "automatic" | "ask" | "off";
export type ExplorerBadgeStyle = "label" | "dot";

export interface Classification {
  value: string;
  color: Color;
}

export interface ClassificatorSettings {
  language: LanguagePreference;
  introductionSeen: boolean;
  classifications: Classification[];
  creationMode: CreationMode;
  defaultClassification: string;
  showExplorerBadge: boolean;
  explorerBadgeStyle: ExplorerBadgeStyle;
  showNoteBadge: boolean;
}

export const DEFAULT_SETTINGS: ClassificatorSettings = {
  language: "auto",
  introductionSeen: false,
  classifications: [
    { value: "unclassified", color: "gray" },
    { value: "public", color: "green" },
    { value: "internal", color: "blue" },
    { value: "confidential", color: "red" },
  ],
  creationMode: "automatic",
  defaultClassification: "unclassified",
  showExplorerBadge: true,
  explorerBadgeStyle: "label",
  showNoteBadge: true,
};

export class ClassificatorSettingTab extends PluginSettingTab {
  private statusEl?: HTMLElement;
  private saveStatus?: keyof typeof saveMessages;
  private saveRevision = 0;

  constructor(private readonly plugin: Classificator) {
    super(plugin.app, plugin);
  }

  override display(): void {
    const { containerEl } = this;
    const { settings, translate: t } = this.plugin;
    containerEl.empty();

    const header = containerEl.createEl("header", { cls: "classificator-settings-header" });
    header.createEl("h2", { text: this.plugin.manifest.name });
    renderAbout(header, t, this.plugin.manifest);

    new Setting(containerEl)
      .setName(t("language.label"))
      .setDesc(t("language.description"))
      .addDropdown((input) => {
        input.selectEl.setAttribute("aria-label", t("language.label"));
        input
          .addOption("auto", t("language.auto"))
          .addOptions(languageNames)
          .setValue(settings.language)
          .onChange((value) => {
            if (!isLanguagePreference(value)) return;
            this.save({ language: value }, true);
          });
      });

    new Setting(containerEl).setClass("classificator-help-actions")
      .addButton((button) => button.setButtonText(t("commands.showIntroduction"))
        .onClick(() => this.plugin.showIntroduction()))
      .addButton((button) => button.setButtonText(t("commands.showAbout"))
        .onClick(() => this.plugin.showAbout()));

    this.statusEl = containerEl.createDiv({
      cls: "classificator-settings-status",
      attr: { role: "status", "aria-atomic": "true" },
    });
    this.renderSaveStatus();

    new Setting(containerEl)
      .setName(t("settings.newNotes"))
      .setDesc(t("settings.newNotesDescription"))
      .addDropdown((input) => {
        input
          .addOption("automatic", t("settings.automatic"))
          .addOption("ask", t("settings.ask"))
          .addOption("off", t("settings.manual"))
          .setValue(settings.creationMode)
          .onChange((value) => {
            this.save({ creationMode: value as CreationMode }, true);
          });
      });

    if (settings.creationMode === "automatic") {
      new Setting(containerEl)
        .setName(t("settings.defaultValue"))
        .addDropdown((input) => {
          input.addOption("", t("settings.noDefault"));
          for (const entry of settings.classifications) {
            input.addOption(entry.value, entry.value);
          }
          input
            .setValue(settings.defaultClassification)
            .onChange((defaultClassification) => {
              this.save({ defaultClassification });
            });
        });
    }

    new Setting(containerEl)
      .setName(t("settings.explorerBadge"))
      .addDropdown((input) => {
        input.selectEl.setAttribute("aria-label", t("settings.explorerAppearance"));
        input
          .addOption("label", t("settings.textBadge"))
          .addOption("dot", t("settings.colorDot"))
          .setValue(settings.explorerBadgeStyle)
          .onChange((value) => {
            this.save({ explorerBadgeStyle: value as ExplorerBadgeStyle });
          });
      })
      .addToggle((input) => input
        .setValue(settings.showExplorerBadge)
        .onChange((showExplorerBadge) => {
          this.save({ showExplorerBadge });
        }));

    new Setting(containerEl)
      .setName(t("settings.noteBadge"))
      .setDesc(t("settings.noteBadgeDescription"))
      .addToggle((input) => input
        .setValue(settings.showNoteBadge)
        .onChange((showNoteBadge) => {
          this.save({ showNoteBadge });
        }));

    new Setting(containerEl).setName(t("settings.classifications")).setHeading();

    for (const entry of settings.classifications) {
      new Setting(containerEl)
        .setName(entry.value)
        .addDropdown((input) => {
          for (const color of COLORS) input.addOption(color, t(`colors.${color}`));
          input.setValue(entry.color).onChange((value) => {
            const classifications = this.plugin.settings.classifications.map((current) =>
              current.value === entry.value ? { ...current, color: value as Color } : current,
            );
            this.save({ classifications });
          });
        })
        .addExtraButton((button) => button
          .setIcon("trash")
          .setTooltip(t("settings.removeClassification"))
          .onClick(() => {
            const current = this.plugin.settings;
            this.save({
              classifications: current.classifications.filter((item) => item.value !== entry.value),
              defaultClassification: current.defaultClassification === entry.value
                ? ""
                : current.defaultClassification,
            }, true);
          }));
    }

    let candidate = "";
    const addClassification = () => {
      const value = candidate.trim();
      const { classifications } = this.plugin.settings;
      if (!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(value)) {
        new Notice(t("errors.invalidClassification"));
        return;
      }
      if (classifications.some((entry) => entry.value === value)) {
        new Notice(t("errors.duplicateClassification"));
        return;
      }
      this.save({ classifications: [...classifications, { value, color: "gray" }] }, true);
    };

    new Setting(containerEl)
      .setName(t("settings.newClassification"))
      .addText((input) => {
        input.setPlaceholder(t("settings.classificationPlaceholder")).onChange((value) => { candidate = value; });
        input.inputEl.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            addClassification();
          }
        });
      })
      .addButton((button) => button.setButtonText(t("actions.add")).onClick(addClassification));
  }

  override hide(): void {
    this.statusEl = undefined;
  }

  private save(update: Partial<ClassificatorSettings>, redraw = false): void {
    const revision = ++this.saveRevision;
    this.saveStatus = "saving";
    const write = this.plugin.updateSettings(update);
    if (redraw) this.display();
    else this.renderSaveStatus();

    void write.then(() => this.finishSave(revision, "saved"), () => this.finishSave(revision, "failed"));
  }

  private finishSave(revision: number, status: "saved" | "failed"): void {
    if (revision !== this.saveRevision) return;
    this.saveStatus = status;
    if (status === "failed" && !this.statusEl) new Notice(this.plugin.translate("errors.settingsSave"));
    this.renderSaveStatus();
  }

  private renderSaveStatus(): void {
    if (!this.statusEl) return;
    this.statusEl.empty();
    if (!this.saveStatus) return;
    const { tone, key } = saveMessages[this.saveStatus];
    this.statusEl.createEl("p", {
      cls: ["classificator-message", `classificator-message--${tone}`],
      text: this.plugin.translate(key),
    });
  }
}
