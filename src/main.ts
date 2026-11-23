import { getLanguage, moment, Notice, Plugin, TFile, TFolder } from "obsidian";
import type { Command, Modal, TAbstractFile } from "obsidian";
import { ClassificationBadges } from "./badges";
import { CLASSIFICATION_FIELD, FOLDER_META_FILENAME, readFolderClassification, writeFolderClassification } from "./folder-settings";
import { FolderSettingsModal } from "./folder-settings-modal";
import { AboutModal, IntroductionModal } from "./help";
import { createTranslator, isLanguagePreference, resolveLanguage } from "./i18n";
import type { TranslationKey } from "./i18n";
import { ClassificationModal } from "./selection";
import { ClassificatorSettingTab, DEFAULT_SETTINGS } from "./settings";
import type { ClassificatorSettings } from "./settings";

export default class Classificator extends Plugin {
  override settings: ClassificatorSettings = DEFAULT_SETTINGS;
  translate = createTranslator("en");
  private readonly localizedCommands: Array<{ command: Command; key: TranslationKey }> = [];
  private badges?: ClassificationBadges;
  private modal?: Modal;
  private prompts = Promise.resolve();
  private settingsWrite = Promise.resolve();
  private stopped = false;

  override async onload(): Promise<void> {
    const savedSettings = await this.loadData() as Partial<ClassificatorSettings> | null;
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...savedSettings,
      language: isLanguagePreference(savedSettings?.language) ? savedSettings.language : DEFAULT_SETTINGS.language,
    };
    this.applyLanguage();
    this.badges = new ClassificationBadges(this);
    this.addSettingTab(new ClassificatorSettingTab(this));
    this.addLocalizedCommand("commands.classifyNote", {
      id: "classify-note",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!this.isNote(file)) return false;
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

    const { workspace, vault, metadataCache } = this.app;
    this.registerEvent(workspace.on("file-menu", (menu, file) => {
      if (file instanceof TFolder) {
        menu.addItem((item) => item
          .setTitle(`${this.manifest.name}: ${this.translate("folder.title")}`)
          .setIcon("settings")
          .onClick(() => { void this.editFolderSettings(file); }));
        return;
      }
      if (!this.isNote(file)) return;
      menu.addItem((item) => item
        .setTitle(this.translate("note.classify"))
        .setIcon("tag")
        .onClick(() => { void this.selectForFile(file); }));
    }));

    const refresh = () => this.badges?.refresh();
    this.registerEvent(workspace.on("layout-change", refresh));
    this.registerEvent(workspace.on("file-open", refresh));
    this.registerEvent(workspace.on("active-leaf-change", refresh));
    this.registerEvent(metadataCache.on("changed", refresh));
    this.registerEvent(vault.on("rename", refresh));
    this.registerEvent(vault.on("delete", refresh));
    workspace.onLayoutReady(() => {
      if (this.stopped) return;
      this.registerEvent(vault.on("create", (file) => this.onCreate(file)));
      refresh();
      if (!this.settings.introductionSeen) this.showIntroduction();
    });
  }

  override onunload(): void {
    this.stopped = true;
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

  private addLocalizedCommand(key: TranslationKey, options: Omit<Command, "name">): void {
    const command = this.addCommand({ ...options, name: this.translate(key) });
    this.localizedCommands.push({ command, key });
  }

  private applyLanguage(): void {
    // Obsidian added getLanguage in 1.8.7. Older releases configure Moment with the same locale.
    const locale = typeof getLanguage === "function" ? getLanguage() : moment.locale();
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

  getClassification(file: TFile): string | undefined {
    const value: unknown = this.app.metadataCache.getFileCache(file)?.frontmatter?.[CLASSIFICATION_FIELD];
    return typeof value === "string" && value.trim() ? value : undefined;
  }

  selectForFile(file: TFile, onlyIfMissing = false): Promise<void> {
    return this.queuePrompt(async () => {
      if (!this.canWrite(file)) return;
      const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (onlyIfMissing && frontmatter && Object.hasOwn(frontmatter, CLASSIFICATION_FIELD)) return;
      const { classifications } = this.settings;
      if (!classifications.length) {
        if (!onlyIfMissing) new Notice(this.translate("errors.noClassifications"));
        return;
      }

      const value = await new Promise<string | undefined>((resolve) => {
        this.modal = new ClassificationModal(
          this.app, file.basename, classifications, this.getClassification(file), this.translate, resolve,
        );
        this.modal.open();
      });
      this.modal = undefined;
      if (value && !this.stopped) await this.writeClassification(file, value, onlyIfMissing);
    }, "errors.openClassification");
  }

  private editFolderSettings(folder: TFolder): Promise<void> {
    return this.queuePrompt(async () => {
      const currentClassification = await readFolderClassification(this.app, folder);
      if (this.stopped) return;
      const classification = await new Promise<string | null | undefined>((resolve) => {
        this.modal = new FolderSettingsModal(this.app, folder.path, currentClassification, this.settings, this.translate, resolve);
        this.modal.open();
      });
      this.modal = undefined;
      if (classification !== undefined && !this.stopped) await writeFolderClassification(this.app, folder, classification);
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

  private isNote(file: TAbstractFile | null): file is TFile {
    return file instanceof TFile && file.extension === "md";
  }

  private canWrite(file: TFile): boolean {
    return this.app.vault.getFileByPath(file.path) === file;
  }

  private onCreate(file: TAbstractFile): void {
    this.badges?.refresh();
    if (!this.isNote(file) || file.name === FOLDER_META_FILENAME || file.stat.size !== 0) return;
    if (this.settings.creationMode === "ask") {
      void this.selectForFile(file, true);
    } else if (this.settings.creationMode === "automatic") {
      void this.classifyNewNote(file);
    }
  }

  private async classifyNewNote(file: TFile): Promise<void> {
    const folder = file.parent ?? this.app.vault.getRoot();
    try {
      const folderClassification = await readFolderClassification(this.app, folder);
      if (this.stopped || (file.parent ?? this.app.vault.getRoot()) !== folder || this.settings.creationMode !== "automatic") return;
      const classification = folderClassification ?? this.settings.defaultClassification;
      if (this.settings.classifications.some(({ value }) => value === classification)) {
        await this.writeClassification(file, classification, true);
      }
    } catch {
      if (!this.stopped && this.canWrite(file)) {
        new Notice(this.translate("errors.folderRead", { name: file.basename }));
      }
    }
  }

  private async writeClassification(file: TFile, value: string, onlyIfMissing: boolean): Promise<void> {
    if (!this.canWrite(file) || (onlyIfMissing && file.name === FOLDER_META_FILENAME)) return;
    try {
      await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
        if (onlyIfMissing && Object.hasOwn(frontmatter, CLASSIFICATION_FIELD)) return;
        frontmatter[CLASSIFICATION_FIELD] = value;
      });
    } catch {
      if (this.canWrite(file)) new Notice(this.translate("errors.classificationWrite", { name: file.basename }));
    }
  }
}
