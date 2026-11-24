import { Modal, Setting } from "obsidian";
import type { App, TFile } from "obsidian";
import type { Translator } from "./i18n";
import { CLASSIFICATION_FIELD, isExplicitlyUnclassified, isMissingClassification } from "./note-classification";

const statuses = ["missing", "unclassified", "unknown"] as const;
type Status = typeof statuses[number];

export class ClassificationOverview extends Modal {
  constructor(
    app: App,
    private readonly notes: readonly TFile[],
    private readonly configured: ReadonlySet<string>,
    private readonly translate: Translator,
    private readonly openNote: (file: TFile) => void,
    private readonly onFinish: () => void,
  ) {
    super(app);
  }

  override onOpen(): void {
    const t = this.translate;
    this.modalEl.addClass("classificator-overview");
    this.setTitle(t("commands.showOverview"));
    const folders = new Set<string>();
    const issues: Array<{ file: TFile; status: Status; value?: string }> = [];
    for (const file of this.notes) {
      const value: unknown = this.app.metadataCache.getFileCache(file)?.frontmatter?.[CLASSIFICATION_FIELD];
      if (isMissingClassification(value)) issues.push({ file, status: "missing" });
      else if (isExplicitlyUnclassified(value)) issues.push({ file, status: "unclassified" });
      else if (typeof value !== "string" || !this.configured.has(value)) {
        issues.push({ file, status: "unknown", value: typeof value === "string" ? value : undefined });
      }
      for (let folder = file.parent; folder && !folder.isRoot(); folder = folder.parent) {
        folders.add(folder.path);
      }
    }
    issues.sort((a, b) => a.file.path.localeCompare(b.file.path));

    let selectedStatus = "";
    let selectedFolder = "";
    new Setting(this.contentEl).setName(t("overview.status")).addDropdown((dropdown) => {
      dropdown.selectEl.setAttribute("aria-label", t("overview.status"));
      dropdown.addOption("", t("overview.allStatuses"));
      for (const status of statuses) dropdown.addOption(status, t(`overview.${status}`));
      dropdown.onChange((value) => { selectedStatus = value; renderResults(); });
    });
    new Setting(this.contentEl).setName(t("overview.folder")).addDropdown((dropdown) => {
      dropdown.selectEl.setAttribute("aria-label", t("overview.folder"));
      dropdown.addOption("", t("overview.allFolders"));
      for (const path of [...folders].sort((a, b) => a.localeCompare(b))) dropdown.addOption(path, path);
      dropdown.onChange((value) => { selectedFolder = value; renderResults(); });
    });
    const count = this.contentEl.createEl("p", { attr: { role: "status" } });
    const results = this.contentEl.createEl("ul", { cls: "classificator-overview-results classificator-note-paths" });
    const renderResults = () => {
      results.empty();
      const matches = issues.filter(({ file, status }) => (!selectedStatus || selectedStatus === status)
        && (!selectedFolder || file.path.startsWith(`${selectedFolder}/`)));
      count.setText(matches.length ? t("overview.count", { count: matches.length }) : t("overview.empty"));
      for (const { file, status, value } of matches) {
        const row = results.createEl("li");
        row.createEl("button", { text: file.path, attr: { type: "button" } }).addEventListener("click", () => {
          this.close();
          this.openNote(file);
        });
        row.createSpan({ text: value === undefined ? t(`overview.${status}`) : t("overview.unknownValue", { value }) });
      }
    };
    renderResults();
  }

  override onClose(): void {
    this.onFinish();
    this.contentEl.empty();
  }
}
