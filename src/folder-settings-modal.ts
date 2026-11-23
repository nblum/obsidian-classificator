import { Modal, Setting } from "obsidian";
import type { App } from "obsidian";
import type { Translator } from "./i18n";
import type { ClassificatorSettings } from "./settings";

export class FolderSettingsModal extends Modal {
  constructor(
    app: App,
    private readonly path: string,
    private readonly currentClassification: string | undefined,
    private readonly settings: ClassificatorSettings,
    private readonly translate: Translator,
    private readonly onFinish: (classification?: string | null) => void,
  ) {
    super(app);
  }

  override onOpen(): void {
    const { currentClassification, settings, translate: t } = this;
    this.modalEl.addClass("classificator-folder-settings-modal");
    this.setTitle(t("folder.title"));
    this.contentEl.createEl("p", { text: this.path });

    let classification = currentClassification ?? "";

    new Setting(this.contentEl)
      .setName(t("folder.default"))
      .setDesc(t("folder.description"))
      .addDropdown((dropdown) => {
        dropdown.selectEl.setAttribute("aria-label", t("folder.default"));
        dropdown.addOption("", t("folder.global", { value: settings.defaultClassification || t("settings.noDefault") }));
        for (const { value } of settings.classifications) dropdown.addOption(value, value);
        if (classification && !settings.classifications.some(({ value }) => value === classification)) {
          dropdown.addOption(classification, t("folder.unconfigured", { value: classification }));
        }
        dropdown.setValue(classification).onChange((value) => { classification = value; });
      });

    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText(t("actions.cancel")).onClick(() => this.close()))
      .addButton((button) => button.setButtonText(t("actions.save")).setCta().onClick(() => {
        if (classification !== (currentClassification ?? "")) this.onFinish(classification || null);
        this.close();
      }));
  }

  override onClose(): void {
    this.onFinish();
    this.contentEl.empty();
  }
}
