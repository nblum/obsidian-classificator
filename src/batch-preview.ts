import { Modal, Setting } from "obsidian";
import type { App } from "obsidian";
import type { Translator } from "./i18n";
import type { BatchEntry } from "./note-classification";

export interface FolderBatchPreview {
  defaultLabel: string;
  defaultChanged: boolean;
  skipExistingNotes: boolean;
}

export class BatchPreviewModal extends Modal {
  constructor(
    app: App,
    private readonly target: string,
    private readonly entries: readonly BatchEntry[],
    private readonly translate: Translator,
    private readonly onFinish: (confirmed: boolean) => void,
    private readonly folder?: FolderBatchPreview,
  ) {
    super(app);
  }

  override onOpen(): void {
    const t = this.translate;
    this.modalEl.addClass("classificator-batch-preview");
    this.setTitle(t("batch.title"));
    if (this.folder?.defaultChanged) {
      this.contentEl.createEl("p", { text: t("folder.previewDefault", { value: this.folder.defaultLabel }) });
    }
    if (!this.folder?.skipExistingNotes) this.showNoteChanges();
    const canApply = this.folder?.defaultChanged || this.entries.some(({ action }) => action === "add" || action === "overwrite");
    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText(t(canApply ? "actions.cancel" : "actions.close"))
        .onClick(() => this.close()))
      .addButton((button) => button.setButtonText(t(this.folder ? "folder.saveAndApply" : "batch.apply"))
        .setCta().setDisabled(!canApply)
        .onClick(() => {
          this.onFinish(true);
          this.close();
        }));
  }

  private showNoteChanges(): void {
    const t = this.translate;
    this.contentEl.createEl("p", { text: t("batch.target", { value: this.target }) });
    const actions = ["add", "overwrite", "skip", "unreadable"] as const;
    for (const action of actions) {
      const entries = this.entries.filter((entry) => entry.action === action);
      const text = t(`batch.${action}`, { count: entries.length });
      if (!entries.length) {
        if (action !== "unreadable") this.contentEl.createDiv({ text });
        continue;
      }
      const details = this.contentEl.createEl("details");
      details.createEl("summary", { text });
      details.addEventListener("toggle", () => {
        if (!details.open || details.childElementCount > 1) return;
        const list = details.createEl("ul", { cls: "classificator-note-paths" });
        for (const { path } of entries) list.createEl("li", { text: path });
      });
    }
  }

  override onClose(): void {
    this.onFinish(false);
    this.contentEl.empty();
  }
}
