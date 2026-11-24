import { Modal, Setting } from "obsidian";
import type { App, ButtonComponent } from "obsidian";
import type { FolderDefault } from "./folder-settings";
import type { Translator } from "./i18n";
import type { BatchMode } from "./note-classification";
import type { ClassificatorSettings } from "./settings";

export interface FolderSettingsDraft {
  classification: string;
  mode: BatchMode;
  recursive: boolean;
}

export type FolderSettingsAction =
  | { kind: "save"; draft: FolderSettingsDraft }
  | { kind: "preview"; value: string; draft: FolderSettingsDraft };

export class FolderSettingsModal extends Modal {
  constructor(
    app: App,
    private readonly path: string,
    private readonly draft: FolderSettingsDraft,
    private readonly savedClassification: string,
    private readonly fallback: FolderDefault,
    private readonly settings: ClassificatorSettings,
    private readonly translate: Translator,
    private readonly onFinish: (action?: FolderSettingsAction) => void,
  ) {
    super(app);
  }

  override onOpen(): void {
    const { fallback, settings, translate: t } = this;
    const draft = { ...this.draft };
    let saveButton: ButtonComponent | undefined;
    let previewButton: ButtonComponent | undefined;
    const canSave = () => draft.classification !== this.savedClassification;
    const target = () => draft.classification || fallback.value;
    const canPreview = () => settings.classifications.some(({ value }) => value === target());
    this.modalEl.addClass("classificator-folder-settings-modal");
    this.setTitle(t("folder.title"));
    this.contentEl.createEl("p", { text: this.path });

    let fallbackValue = fallback.value || t("settings.noDefault");
    if (fallback.value && !settings.classifications.some(({ value }) => value === fallback.value)) {
      fallbackValue = t("folder.unconfigured", { value: fallback.value });
    }
    const fallbackLabel = fallback.folderPath === undefined
      ? t("folder.global", { value: fallbackValue })
      : t("folder.inherited", { folder: fallback.folderPath, value: fallbackValue });
    new Setting(this.contentEl).setName(t("folder.default")).setDesc(t("folder.description"))
      .setClass("classificator-folder-actions")
      .addDropdown((dropdown) => {
        dropdown.selectEl.setAttribute("aria-label", t("folder.default"));
        dropdown.addOption("", fallbackLabel);
        for (const { value } of settings.classifications) dropdown.addOption(value, value);
        if (draft.classification && !settings.classifications.some(({ value }) => value === draft.classification)) {
          dropdown.addOption(draft.classification, t("folder.unconfigured", { value: draft.classification }));
        }
        dropdown.setValue(draft.classification).onChange((value) => {
          draft.classification = value;
          saveButton?.setDisabled(!canSave());
          previewButton?.setDisabled(!canPreview());
        });
      })
      .addButton((button) => {
        saveButton = button;
        button.setButtonText(t("folder.saveRule")).setDisabled(!canSave()).onClick(() => {
          this.onFinish({ kind: "save", draft });
          this.close();
        });
      });

    new Setting(this.contentEl).setHeading().setName(t("folder.existingNotes"))
      .setDesc(t("folder.existingNotesHelp"));
    new Setting(this.contentEl).setName(t("folder.scope")).addDropdown((dropdown) => {
      dropdown.selectEl.setAttribute("aria-label", t("folder.scope"));
      dropdown.addOption("direct", t("folder.direct"))
        .addOption("recursive", t("folder.recursive"))
        .setValue(draft.recursive ? "recursive" : "direct")
        .onChange((value) => { draft.recursive = value === "recursive"; });
    });
    new Setting(this.contentEl).setName(t("folder.notes")).addDropdown((dropdown) => {
      dropdown.selectEl.setAttribute("aria-label", t("folder.notes"));
      dropdown.addOption("unclassified", t("folder.unclassifiedNotes"))
        .addOption("always", t("folder.allNotes"))
        .setValue(draft.mode)
        .onChange((value) => { draft.mode = value === "always" ? "always" : "unclassified"; });
    });
    new Setting(this.contentEl).setClass("classificator-folder-actions")
      .addButton((button) => button.setButtonText(t("actions.close")).onClick(() => this.close()))
      .addButton((button) => {
        previewButton = button;
        button.setButtonText(t("batch.preview")).setCta().setDisabled(!canPreview()).onClick(() => {
          this.onFinish({ kind: "preview", value: target(), draft });
          this.close();
        });
      });
  }

  override onClose(): void {
    this.onFinish();
    this.contentEl.empty();
  }
}
