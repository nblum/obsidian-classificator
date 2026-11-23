import { Modal, Setting } from "obsidian";
import type { App, ButtonComponent } from "obsidian";
import type { Translator } from "./i18n";
import type { Classification } from "./settings";

export class ClassificationModal extends Modal {
  private selected: string;

  constructor(
    app: App,
    private readonly title: string,
    private readonly description: string,
    private readonly options: readonly Classification[],
    currentValue: string | undefined,
    private readonly translate: Translator,
    private readonly onFinish: (value?: string) => void,
  ) {
    super(app);
    this.selected = options.some((option) => option.value === currentValue) ? currentValue ?? "" : "";
  }

  override onOpen(): void {
    const t = this.translate;
    this.modalEl.addClass("classificator-selection-modal");
    this.setTitle(this.title);
    this.contentEl.createEl("p", { text: this.description });
    let saveButton: ButtonComponent | undefined;

    new Setting(this.contentEl)
      .setName(t("note.classification"))
      .addDropdown((dropdown) => {
        dropdown.addOption("", t("note.choose"));
        for (const option of this.options) {
          dropdown.addOption(option.value, option.value);
        }
        dropdown
          .setValue(this.selected)
          .onChange((value) => {
            this.selected = value;
            saveButton?.setDisabled(!value);
          });
        dropdown.selectEl.focus();
      });

    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText(t("actions.skip")).onClick(() => this.close()))
      .addButton((button) => {
        saveButton = button;
        button
          .setButtonText(t("actions.save"))
          .setCta()
          .setDisabled(!this.selected)
          .onClick(() => {
            if (!this.selected) return;
            this.onFinish(this.selected);
            this.close();
          });
      });
  }

  override onClose(): void {
    this.onFinish();
    this.contentEl.empty();
  }
}
