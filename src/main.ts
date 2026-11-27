import { getLanguage, Menu, moment, Notice, Plugin, requireApiVersion, TFile, TFolder, Vault } from "obsidian";
import type { Command, Modal, TAbstractFile } from "obsidian";
import { cachedAttachmentClassification, moveAttachmentClassification, readAttachmentClassification, writeAttachmentClassification } from "./attachment-classification";
import { ClassificationBadges } from "./badges";
import { BatchPreviewModal } from "./batch-preview";
import type { FolderBatchPreview } from "./batch-preview";
import { FOLDER_META_FILENAME } from "./folder-metadata";
import { readFolderClassification, resolveFolderDefault, writeFolderClassification } from "./folder-settings";
import { FolderSettingsModal } from "./folder-settings-modal";
import type { FolderSettingsAction, FolderSettingsDraft } from "./folder-settings-modal";
import { AboutModal, IntroductionModal } from "./help";
import { createTranslator, isLanguagePreference, resolveLanguage } from "./i18n";
import type { TranslationKey } from "./i18n";
import { CLASSIFICATION_FIELD, UNCLASSIFIED, classificationSnapshot, isExplicitlyUnclassified, isMissingClassification, previewClassification, previewValue } from "./note-classification";
import type { BatchEntry, BatchMode } from "./note-classification";
import { ClassificationOverview } from "./overview";
import { ClassificationModal } from "./selection";
import { ClassificatorSettingTab, DEFAULT_SETTINGS } from "./settings";
import type { ClassificatorSettings } from "./settings";

type WriteMode = BatchMode | "missing";
type WriteResult = "changed" | "skipped" | "failed";

const KEEP_CLASSIFICATION = new Error("Keep existing classification");

export default class Classificator extends Plugin {
  override settings: ClassificatorSettings = DEFAULT_SETTINGS;
  translate = createTranslator("en");
  private readonly localizedCommands: Array<{ command: Command; key: TranslationKey }> = [];
  private badges?: ClassificationBadges;
  private classificationMenu?: Menu;
  private modal?: Modal;
  private prompts = Promise.resolve();
  private attachmentWrites = Promise.resolve();
  private settingsWrite = Promise.resolve();
  private stopped = false;

  override async onload(): Promise<void> {
    const savedSettings = await this.loadData() as Partial<ClassificatorSettings> | null;
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...savedSettings,
      inheritFolderRules: savedSettings?.inheritFolderRules === true,
      language: isLanguagePreference(savedSettings?.language) ? savedSettings.language : DEFAULT_SETTINGS.language,
    };
    this.applyLanguage();
    this.badges = new ClassificationBadges(this);
    this.addSettingTab(new ClassificatorSettingTab(this));
    this.addLocalizedCommand("commands.classifyNote", {
      id: "classify-note",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || !this.isBatchNote(file)) return false;
        if (!checking) void this.selectForFile(file);
        return true;
      },
    });
    this.addLocalizedCommand("commands.showIntroduction", {
      id: "show-introduction",
      callback: () => this.showIntroduction(),
    });
    this.addLocalizedCommand("commands.showAbout", {
      id: "show-about",
      callback: () => this.showAbout(),
    });
    this.addLocalizedCommand("commands.showOverview", {
      id: "classification-overview",
      callback: () => { void this.showOverview(); },
    });

    const { workspace, vault, metadataCache } = this.app;
    this.registerEvent(workspace.on("file-menu", (menu, file) => {
      if (file instanceof TFolder) {
        menu.addItem((item) => item
          .setTitle(`${this.manifest.name}: ${this.translate("folder.title")}`)
          .setIcon("settings")
          .onClick(() => { void this.editFolderSettings(file); }));
        return;
      }
      if (!this.isClassifiable(file)) return;
      menu.addItem((item) => item
        .setTitle(this.translate(this.isNote(file) ? "note.classify" : "attachment.classify"))
        .setIcon("tag")
        .onClick(() => { void this.selectForFile(file); }));
    }));
    this.registerEvent(workspace.on("files-menu", (menu, files) => {
      const selection = files.filter((file) => this.isClassifiable(file));
      if (!selection.length) return;
      const includesAttachments = selection.some((file) => !this.isNote(file));
      menu.addItem((item) => item
        .setTitle(this.translate(includesAttachments ? "attachment.classifySelected" : "note.classifySelected"))
        .setIcon("tag")
        .onClick(() => { void this.selectForFiles(selection, includesAttachments); }));
    }));

    const refresh = () => this.badges?.refresh();
    this.registerEvent(workspace.on("layout-change", refresh));
    this.registerEvent(workspace.on("file-open", refresh));
    this.registerEvent(workspace.on("active-leaf-change", refresh));
    this.registerEvent(metadataCache.on("changed", refresh));
    // Startup can reuse cached metadata without firing a per-file change event.
    this.registerEvent(metadataCache.on("resolved", refresh));
    this.registerEvent(vault.on("rename", (file, oldPath) => {
      if (file instanceof TFile) this.onAttachmentPathChange(oldPath, this.isNote(file) ? null : file);
      refresh();
    }));
    this.registerEvent(vault.on("delete", (file) => {
      if (file instanceof TFile) this.onAttachmentPathChange(file.path, null);
      refresh();
    }));
    workspace.onLayoutReady(() => {
      if (this.stopped) return;
      this.registerEvent(vault.on("create", (file) => this.onCreate(file)));
      refresh();
      if (!this.settings.introductionSeen) this.showIntroduction();
    });
  }

  override onunload(): void {
    this.stopped = true;
    this.classificationMenu?.hide();
    this.modal?.close();
    this.badges?.dispose();
  }

  updateSettings(update: Partial<ClassificatorSettings>): Promise<void> {
    const settings = { ...this.settings, ...update };
    const languageChanged = settings.language !== this.settings.language;
    this.settings = settings;
    if (languageChanged) this.applyLanguage();
    this.badges?.refresh();
    const write = this.settingsWrite.then(() => this.saveData(settings));
    this.settingsWrite = write.catch(() => undefined);
    return write;
  }

  toggleExplorerClassifications(): void {
    if (this.stopped) return;
    void this.updateSettings({ showExplorerClassifications: !this.settings.showExplorerClassifications }).catch(() => {
      if (!this.stopped) new Notice(this.translate("errors.settingsSave"));
    });
  }

  private addLocalizedCommand(key: TranslationKey, options: Omit<Command, "name">): void {
    const command = this.addCommand({ ...options, name: this.translate(key) });
    this.localizedCommands.push({ command, key });
  }

  private applyLanguage(): void {
    const locale = requireApiVersion("1.8.7") ? getLanguage() : moment.locale();
    this.translate = createTranslator(resolveLanguage(this.settings.language, locale));
    for (const { command, key } of this.localizedCommands) {
      command.name = `${this.manifest.name}: ${this.translate(key)}`;
    }
  }

  showIntroduction(): void {
    void this.queuePrompt(async () => {
      await this.openHelpDialog((close) => new IntroductionModal(this.app, this.translate, close));
      if (this.stopped || this.settings.introductionSeen) return;
      await this.updateSettings({ introductionSeen: true }).catch(() => {
        if (!this.stopped) new Notice(this.translate("errors.settingsSave"));
      });
    }, "errors.openHelp");
  }

  showAbout(): void {
    void this.queuePrompt(() => this.openHelpDialog((close) =>
      new AboutModal(this.app, this.translate, this.manifest, close)), "errors.openHelp");
  }

  private async openHelpDialog(create: (close: () => void) => Modal): Promise<void> {
    await new Promise<void>((resolve) => {
      this.modal = create(resolve);
      this.modal.open();
    });
    this.modal = undefined;
  }

  private showOverview(): Promise<void> {
    return this.queuePrompt(async () => {
      const files = this.app.vault.getMarkdownFiles().filter((file) => this.isBatchNote(file));
      const configured = new Set(this.settings.classifications.map(({ value }) => value));
      await new Promise<void>((resolve) => {
        this.modal = new ClassificationOverview(this.app, files, configured, this.translate, (file) => {
          if (!this.canWrite(file)) return;
          void this.app.workspace.getLeaf(false).openFile(file).catch(() => {
            if (!this.stopped) new Notice(this.translate("errors.openOverviewNote", { name: file.basename }));
          });
        }, resolve);
        this.modal.open();
      });
      this.modal = undefined;
    }, "errors.openOverview");
  }

  getClassification(file: TFile): string | undefined {
    if (file.name === FOLDER_META_FILENAME) return UNCLASSIFIED;
    const value: unknown = this.isNote(file)
      ? this.app.metadataCache.getFileCache(file)?.frontmatter?.[CLASSIFICATION_FIELD]
      : cachedAttachmentClassification(this.app, file);
    return typeof value === "string" && value.trim() ? value : undefined;
  }

  showClassificationMenu(file: TFile, badge: HTMLElement): void {
    if (this.stopped || !this.isClassifiable(file) || !this.canWrite(file)) return;
    const { classifications } = this.settings;
    if (!classifications.length) {
      new Notice(this.translate("errors.noClassifications"));
      return;
    }

    this.classificationMenu?.hide();
    const current = this.getClassification(file);
    const menu = new Menu();
    for (const { value } of classifications) {
      menu.addItem((item) => item
        .setTitle(value)
        .setChecked(value === current)
        .onClick(() => { void this.writeClassification(file, value, "always"); }));
    }
    menu.onHide(() => {
      badge.setAttribute("aria-expanded", "false");
      this.classificationMenu = undefined;
    });
    this.classificationMenu = menu;
    badge.setAttribute("aria-expanded", "true");
    const { left, bottom } = badge.getBoundingClientRect();
    menu.showAtPosition({ x: left, y: bottom }, badge.ownerDocument);
  }

  selectForFile(file: TFile, onlyIfMissing = false): Promise<void> {
    return this.queuePrompt(async () => {
      if (!this.isClassifiable(file) || !this.canWrite(file)) return;
      if (onlyIfMissing) {
        const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
        if (!this.settings.classifications.length || (frontmatter && Object.hasOwn(frontmatter, CLASSIFICATION_FIELD))) return;
      }

      const note = this.isNote(file);
      const value = await this.chooseClassification(this.translate(note ? "note.classify" : "attachment.classify"),
        note ? file.basename : file.name, this.getClassification(file));
      if (value && !this.stopped) await this.writeClassification(file, value, onlyIfMissing ? "missing" : "always");
    }, "errors.openClassification");
  }

  private selectForFiles(files: readonly TFile[], includesAttachments: boolean): Promise<void> {
    return this.queuePrompt(async () => {
      const selection = files.filter((file) => this.canWrite(file));
      if (!selection.length) return;

      const value = await this.chooseClassification(
        this.translate(includesAttachments ? "attachment.classifySelected" : "note.classifySelected"),
        this.translate(includesAttachments ? "attachment.selectedCount" : "note.selectedCount", { count: selection.length }),
        undefined, "batch.preview",
      );
      if (!value) return;
      const entries = await this.confirmBatch(selection, value, "always");
      if (entries) await this.applyBatch(entries, value, "always");
    }, "errors.openClassification");
  }

  private async chooseClassification(
    title: string, description: string, currentValue?: string, submit: TranslationKey = "actions.save",
  ): Promise<string | undefined> {
    const { classifications } = this.settings;
    if (!classifications.length) {
      new Notice(this.translate("errors.noClassifications"));
      return undefined;
    }

    const value = await new Promise<string | undefined>((resolve) => {
      this.modal = new ClassificationModal(this.app, title, description, classifications, currentValue, submit, this.translate, resolve);
      this.modal.open();
    });
    this.modal = undefined;
    return value;
  }

  private editFolderSettings(folder: TFolder): Promise<void> {
    return this.queuePrompt(async () => {
      const { vault } = this.app;
      const { path } = folder;
      const isCurrent = () => !this.stopped && vault.getFolderByPath(path) === folder;
      let draft: FolderSettingsDraft | undefined;
      while (isCurrent()) {
        const currentClassification = await readFolderClassification(this.app, folder);
        const settings = this.settings;
        const parent = settings.inheritFolderRules && !folder.isRoot() ? folder.parent : null;
        const fallback = await resolveFolderDefault(this.app, parent, settings);
        if (!isCurrent()) return;
        draft ??= { classification: currentClassification ?? "", mode: "unclassified", recursive: false, skipExistingNotes: false };
        const dialogDraft = draft;
        const action = await new Promise<FolderSettingsAction | undefined>((resolve) => {
          this.modal = new FolderSettingsModal(
            this.app, path, dialogDraft, currentClassification ?? "", fallback, settings, this.translate, resolve,
          );
          this.modal.open();
        });
        this.modal = undefined;
        if (!action || !isCurrent()) return;
        draft = action.draft;
        const classification = draft.classification || null;
        const defaultChanged = classification !== (currentClassification ?? null);
        let entries: BatchEntry[] | undefined;
        if (action.kind === "preview") {
          const notes: TFile[] = [];
          if (!draft.skipExistingNotes) {
            if (draft.recursive) {
              Vault.recurseChildren(folder, (file) => {
                if (this.isBatchNote(file)) notes.push(file);
              });
            } else {
              notes.push(...folder.children.filter((file) => this.isBatchNote(file)));
            }
          }
          entries = await this.confirmBatch(notes, action.value, draft.mode, {
            defaultLabel: action.defaultLabel, defaultChanged, skipExistingNotes: draft.skipExistingNotes,
          });
          if (!entries || !isCurrent()) continue;
        }
        if (defaultChanged) {
          await writeFolderClassification(this.app, folder, classification);
          if (isCurrent()) new Notice(this.translate("folder.defaultSaved"));
        }
        if (action.kind === "save") continue;
        if (entries?.length && isCurrent()) {
          await this.applyBatch(entries, action.value, draft.mode);
        }
        return;
      }
    }, "errors.folderSettings");
  }

  private queuePrompt(task: () => Promise<void>, errorMessage: TranslationKey): Promise<void> {
    this.prompts = this.prompts.then(async () => {
      if (!this.stopped) await task();
    }).catch(() => {
      this.modal = undefined;
      if (!this.stopped) new Notice(this.translate(errorMessage));
    });
    return this.prompts;
  }

  private isNote(file: TFile): boolean {
    return file.extension === "md";
  }

  private isClassifiable(file: TAbstractFile): file is TFile {
    return file instanceof TFile && file.name !== FOLDER_META_FILENAME;
  }

  private isBatchNote(file: TAbstractFile): file is TFile {
    return this.isClassifiable(file) && this.isNote(file);
  }

  private canWrite(file: TFile): boolean {
    return this.app.vault.getFileByPath(file.path) === file;
  }

  private onCreate(file: TAbstractFile): void {
    this.badges?.refresh();
    if (!this.isBatchNote(file) || file.stat.size !== 0) return;
    if (this.settings.creationMode === "ask") {
      void this.selectForFile(file, true);
    } else if (this.settings.creationMode === "automatic") {
      void this.classifyNewNote(file);
    }
  }

  private queueAttachmentWrite<T>(task: () => Promise<T>): Promise<T> {
    const write = this.attachmentWrites.then(task);
    this.attachmentWrites = write.then(() => undefined, () => undefined);
    return write;
  }

  private onAttachmentPathChange(oldPath: string, file: TFile | null): void {
    if (oldPath.endsWith(".md")) return;
    const { vault } = this.app;
    const separator = oldPath.lastIndexOf("/");
    const source = separator < 0 ? vault.getRoot() : vault.getFolderByPath(oldPath.slice(0, separator));
    if (!source) return;
    const oldName = oldPath.slice(separator + 1);
    const destination = file ? file.parent ?? vault.getRoot() : null;
    const name = file?.name ?? oldName;
    void this.queueAttachmentWrite(async () => {
      if (!this.stopped) await moveAttachmentClassification(this.app, source, oldName, destination, name);
    }).catch(() => {
      if (!this.stopped) new Notice(this.translate("errors.attachmentMetadata", { name: oldName }));
    });
  }

  private async classifyNewNote(file: TFile): Promise<void> {
    const folder = file.parent ?? this.app.vault.getRoot();
    const { path } = folder;
    const settings = this.settings;
    try {
      const effective = await resolveFolderDefault(this.app, folder, settings);
      if (this.stopped || (file.parent ?? this.app.vault.getRoot()) !== folder || folder.path !== path
        || this.settings.creationMode !== "automatic" || this.settings.inheritFolderRules !== settings.inheritFolderRules) return;
      const classification = effective.folderPath === undefined ? this.settings.defaultClassification : effective.value;
      if (this.settings.classifications.some(({ value }) => value === classification)) {
        await this.writeClassification(file, classification, "missing");
      }
    } catch {
      if (!this.stopped && this.canWrite(file)) {
        new Notice(this.translate("errors.folderRead", { name: file.basename }));
      }
    }
  }

  private async confirmBatch(
    files: readonly TFile[], value: string, mode: BatchMode, folder?: FolderBatchPreview,
  ): Promise<BatchEntry[] | undefined> {
    const entries: BatchEntry[] = [];
    const candidates = files.map((file) => ({ file, path: file.path })).sort((a, b) => a.path.localeCompare(b.path));
    for (const { file, path } of candidates) {
      if (this.stopped) return;
      entries.push(await this.previewFile(file, path, value, mode));
    }
    if (this.stopped) return;
    const confirmed = await new Promise<boolean>((resolve) => {
      this.modal = new BatchPreviewModal(this.app, value, entries, this.translate, resolve, folder);
      this.modal.open();
    });
    this.modal = undefined;
    return confirmed && !this.stopped ? entries : undefined;
  }

  private async applyBatch(entries: readonly BatchEntry[], value: string, mode: BatchMode): Promise<void> {
    const counts = { changed: 0, skipped: 0, failed: 0 };
    const progress = this.showBatchNotice(this.translate("batch.applying"), "info", 0);
    try {
      for (const entry of entries) {
        if (this.stopped) return;
        const outcome = "file" in entry ? await this.writeClassification(entry.file, value, mode, entry)
          : entry.action === "unreadable" ? "failed" : "skipped";
        counts[outcome]++;
      }
    } finally {
      progress.hide();
    }
    if (!this.stopped) this.showBatchNotice(this.translate("batch.result", counts), counts.failed ? "error" : "success");
  }

  private async previewFile(file: TFile, path: string, value: string, mode: BatchMode): Promise<BatchEntry> {
    if (file.path !== path || !this.canWrite(file)) return { path, action: "skip" };
    if (this.isNote(file)) return previewClassification(this.app.vault, file, value, mode);
    try {
      const current = await readAttachmentClassification(this.app, file.parent ?? this.app.vault.getRoot(), file.name);
      return file.path === path ? previewValue(file, current, value, mode) : { path, action: "skip" };
    } catch {
      return { path, action: "unreadable" };
    }
  }

  private showBatchNotice(text: string, tone: "info" | "success" | "error", duration?: number): Notice {
    const message = createFragment((fragment) => {
      fragment.createDiv({ cls: `classificator-batch-notice classificator-message--${tone}`, text });
    });
    return new Notice(message, duration);
  }

  private async writeClassification(
    file: TFile, value: string, mode: WriteMode, expected?: { path: string; previous: string },
  ): Promise<WriteResult> {
    if (this.stopped || !this.isClassifiable(file) || !this.canWrite(file)
      || (expected && expected.path !== file.path)) return "skipped";
    const shouldWrite = (current: unknown) => !this.stopped && current !== value
      && (!expected || (expected.path === file.path && expected.previous === classificationSnapshot(current)))
      && (mode !== "unclassified" || isMissingClassification(current) || isExplicitlyUnclassified(current));
    try {
      if (!this.isNote(file)) {
        const { path, name } = file;
        const folder = file.parent ?? this.app.vault.getRoot();
        const changed = await this.queueAttachmentWrite(() => writeAttachmentClassification(this.app, folder, name, value,
          (current) => file.path === path && this.canWrite(file) && shouldWrite(current)));
        return changed ? "changed" : "skipped";
      }
      await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
        const currentValue = frontmatter[CLASSIFICATION_FIELD];
        if (!this.isBatchNote(file) || !shouldWrite(currentValue)
          || (mode === "missing" && Object.hasOwn(frontmatter, CLASSIFICATION_FIELD))) {
          // Returning from the callback would still let Obsidian reserialize the existing frontmatter.
          throw KEEP_CLASSIFICATION;
        }
        frontmatter[CLASSIFICATION_FIELD] = value;
      });
      return "changed";
    } catch (error) {
      if (error === KEEP_CLASSIFICATION || !this.canWrite(file)) return "skipped";
      if (!expected && !this.stopped) {
        new Notice(this.translate("errors.classificationWrite", { name: file.basename }));
      }
      return "failed";
    }
  }
}
