import { Modal, Setting } from "obsidian";
import type { App } from "obsidian";
import type { Translator } from "./i18n";
import type { ClassificatorSettings } from "./settings";

export interface FolderSettingsSelection {
  classification: string | null;
  applyTo?: { classification: string; scope: "unclassified" | "always" };
}

export class FolderSettingsModal extends Modal {
  constructor(
    app: App,
    private readonly path: string,
    private readonly currentClassification: string | undefined,
    private readonly settings: ClassificatorSettings,
    private readonly translate: Translator,
    private readonly onFinish: (selection?: FolderSettingsSelection) => void,
  ) {
    super(app);
  }

  override onOpen(): void {
    const { currentClassification, settings, translate: t } = this;
    this.modalEl.addClass("classificator-folder-settings-modal");
    this.setTitle(t("folder.title"));
    this.contentEl.createEl("p", { text: this.path });

    let classification = currentClassification ?? "";
    const effectiveClassification = () => {
      const value = classification || settings.defaultClassification;
      return settings.classifications.some((option) => option.value === value) ? value : undefined;
    };

    const defaultSetting = new Setting(this.contentEl)
      .setName(t("folder.default"))
      .setDesc(t("folder.description"));
    const applyAll = this.addCheckbox("all", t("folder.applyAll"), t("folder.applyAllDescription"), false);
    const applyUnclassified = this.addCheckbox(
      "unclassified", t("folder.applyUnclassified"), t("folder.applyUnclassifiedDescription"), true,
    );

    const updateCheckboxes = () => {
      const disabled = !effectiveClassification();
      applyAll.disabled = disabled;
      applyUnclassified.disabled = disabled;
    };
    defaultSetting.addDropdown((dropdown) => {
      dropdown.selectEl.setAttribute("aria-label", t("folder.default"));
      dropdown.addOption("", t("folder.global", { value: settings.defaultClassification || t("settings.noDefault") }));
      for (const { value } of settings.classifications) dropdown.addOption(value, value);
      if (classification && !settings.classifications.some(({ value }) => value === classification)) {
        dropdown.addOption(classification, t("folder.unconfigured", { value: classification }));
      }
      dropdown.setValue(classification).onChange((value) => {
        classification = value;
        updateCheckboxes();
      });
    });
    updateCheckboxes();

    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText(t("actions.cancel")).onClick(() => this.close()))
      .addButton((button) => button.setButtonText(t("actions.save")).setCta().onClick(() => {
        const selection: FolderSettingsSelection = { classification: classification || null };
        const value = effectiveClassification();
        if (value && (applyAll.checked || applyUnclassified.checked)) {
          selection.applyTo = { classification: value, scope: applyAll.checked ? "always" : "unclassified" };
        }
        this.onFinish(selection);
        this.close();
      }));
  }

  override onClose(): void {
    this.onFinish();
    this.contentEl.empty();
  }

  private addCheckbox(kind: "all" | "unclassified", name: string, description: string, checked: boolean): HTMLInputElement {
    const id = `classificator-folder-apply-${kind}`;
    const setting = new Setting(this.contentEl).setDesc(description);
    setting.nameEl.createEl("label", { text: name, attr: { for: id } });
    setting.descEl.id = `${id}-description`;
    const checkbox = setting.controlEl.createEl("input", {
      type: "checkbox", attr: { id, "aria-describedby": setting.descEl.id },
    });
    checkbox.checked = checked;
    return checkbox;
  }
}
