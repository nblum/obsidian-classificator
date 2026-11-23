import { Notice, PluginSettingTab, requireApiVersion, Setting } from "obsidian";
import type { SettingDefinitionRender } from "obsidian";
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

type SettingsRow = Omit<SettingDefinitionRender, "render"> & {
  render: (setting: Setting) => void | (() => void);
};

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

export const UNCLASSIFIED = "unclassified";

export const DEFAULT_SETTINGS: ClassificatorSettings = {
  language: "auto",
  introductionSeen: false,
  classifications: [
    { value: UNCLASSIFIED, color: "gray" },
    { value: "public", color: "green" },
    { value: "internal", color: "blue" },
    { value: "confidential", color: "red" },
  ],
  creationMode: "automatic",
  defaultClassification: UNCLASSIFIED,
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

  override getSettingDefinitions(): SettingsRow[] {
    return this.createSettingsRows();
  }

  // Obsidian versions before 1.13 call display() to build the settings tab.
  override display(): void {
    this.renderLegacySettings();
  }

  private renderLegacySettings(): void {
    this.containerEl.empty();
    for (const { name, desc, render } of this.createSettingsRows()) {
      const setting = new Setting(this.containerEl).setName(name);
      if (desc) setting.setDesc(desc);
      render(setting);
    }
  }

  private createSettingsRows(): SettingsRow[] {
    const { settings, translate: t, manifest } = this.plugin;
    const rows: SettingsRow[] = [
      {
        name: manifest.name,
        searchable: false,
        render: (setting) => {
          setting.setClass("classificator-settings-header").setHeading();
          const about = setting.infoEl.createDiv();
          renderAbout(about, t, manifest);
          return () => about.remove();
        },
      },
      {
        name: t("language.label"),
        desc: t("language.description"),
        render: (setting) => {
          setting.addDropdown((input) => {
            input.selectEl.setAttribute("aria-label", t("language.label"));
            input
              .addOption("auto", t("language.auto"))
              .addOptions(languageNames)
              .setValue(settings.language)
              .onChange((value) => {
                if (isLanguagePreference(value)) this.save({ language: value }, true);
              });
          });
        },
      },
      {
        name: "",
        searchable: false,
        render: (setting) => {
          setting.setClass("classificator-help-actions")
            .addButton((button) => button.setButtonText(t("commands.showIntroduction"))
              .onClick(() => this.plugin.showIntroduction()))
            .addButton((button) => button.setButtonText(t("commands.showAbout"))
              .onClick(() => this.plugin.showAbout()));
        },
      },
      {
        name: "",
        searchable: false,
        render: (setting) => {
          setting.setClass("classificator-settings-status-row");
          const statusEl = setting.infoEl.createDiv({
            cls: "classificator-settings-status",
            attr: { role: "status", "aria-atomic": "true" },
          });
          this.statusEl = statusEl;
          this.renderSaveStatus();
          return () => {
            statusEl.remove();
            if (this.statusEl === statusEl) this.statusEl = undefined;
          };
        },
      },
      {
        name: t("settings.newNotes"),
        desc: t("settings.newNotesDescription"),
        render: (setting) => {
          setting.addDropdown((input) => input
            .addOption("automatic", t("settings.automatic"))
            .addOption("ask", t("settings.ask"))
            .addOption("off", t("settings.manual"))
            .setValue(settings.creationMode)
            .onChange((value) => {
              this.save({ creationMode: value as CreationMode }, true);
            }));
        },
      },
    ];

    if (settings.creationMode === "automatic") {
      rows.push({
        name: t("settings.defaultValue"),
        render: (setting) => {
          setting.addDropdown((input) => {
            input.addOption("", t("settings.noDefault"));
            for (const entry of settings.classifications) {
              input.addOption(entry.value, entry.value);
            }
            input
              .setValue(settings.defaultClassification)
              .onChange((defaultClassification) => this.save({ defaultClassification }));
          });
        },
      });
    }

    rows.push(
      {
        name: t("settings.explorerBadge"),
        aliases: [t("settings.explorerAppearance")],
        render: (setting) => {
          setting.addDropdown((input) => {
            input.selectEl.setAttribute("aria-label", t("settings.explorerAppearance"));
            input
              .addOption("label", t("settings.textBadge"))
              .addOption("dot", t("settings.colorDot"))
              .setValue(settings.explorerBadgeStyle)
              .onChange((value) => this.save({ explorerBadgeStyle: value as ExplorerBadgeStyle }));
          }).addToggle((input) => input
            .setValue(settings.showExplorerBadge)
            .onChange((showExplorerBadge) => this.save({ showExplorerBadge })));
        },
      },
      {
        name: t("settings.noteBadge"),
        desc: t("settings.noteBadgeDescription"),
        render: (setting) => {
          setting.addToggle((input) => input
            .setValue(settings.showNoteBadge)
            .onChange((showNoteBadge) => this.save({ showNoteBadge })));
        },
      },
      {
        name: t("settings.classifications"),
        render: (setting) => { setting.setHeading(); },
      },
    );

    for (const entry of settings.classifications) {
      rows.push({
        name: entry.value,
        render: (setting) => {
          setting.addDropdown((input) => {
            for (const color of COLORS) input.addOption(color, t(`colors.${color}`));
            input.setValue(entry.color).onChange((value) => {
              const classifications = this.plugin.settings.classifications.map((current) =>
                current.value === entry.value ? { ...current, color: value as Color } : current,
              );
              this.save({ classifications });
            });
          }).addExtraButton((button) => button
            .setIcon("trash")
            .setTooltip(t("settings.removeClassification"))
            .onClick(() => {
              const current = this.plugin.settings;
              this.save({
                classifications: current.classifications.filter((item) => item.value !== entry.value),
                defaultClassification: current.defaultClassification === entry.value ? "" : current.defaultClassification,
              }, true);
            }));
        },
      });
    }

    rows.push({
      name: t("settings.newClassification"),
      render: (setting) => this.renderAddClassification(setting),
    });
    return rows;
  }

  private renderAddClassification(setting: Setting): void {
    const { translate: t } = this.plugin;
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

    setting
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
    if (redraw) {
      if (requireApiVersion("1.13.0")) this.update();
      else this.renderLegacySettings();
    } else {
      this.renderSaveStatus();
    }

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
