import { getLanguage, moment, Notice, Plugin, requireApiVersion, TFile, TFolder, Vault } from "obsidian";
import type { Command, Modal, TAbstractFile } from "obsidian";
import { ClassificationBadges } from "./badges";
import { CLASSIFICATION_FIELD, FOLDER_META_FILENAME, readFolderClassification, writeFolderClassification } from "./folder-settings";
import { FolderSettingsModal } from "./folder-settings-modal";
import type { FolderSettingsSelection } from "./folder-settings-modal";
import { AboutModal, IntroductionModal } from "./help";
import { createTranslator, isLanguagePreference, resolveLanguage } from "./i18n";
import type { TranslationKey } from "./i18n";
import { ClassificationModal } from "./selection";
import { ClassificatorSettingTab, DEFAULT_SETTINGS, UNCLASSIFIED } from "./settings";
import type { ClassificatorSettings } from "./settings";

type WriteMode = "always" | "missing" | "unclassified";

const KEEP_CLASSIFICATION = new Error("Keep existing classification");

function isUnclassified(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  return trimmed === "" || trimmed === UNCLASSIFIED;
}

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
    this.registerEvent(workspace.on("files-menu", (menu, files) => {
      const notes = files.filter((file) => this.isBatchNote(file));
      if (!notes.length) return;
      menu.addItem((item) => item
        .setTitle(this.translate("note.classifySelected"))
        .setIcon("tag")
        .onClick(() => { void this.selectForFiles(notes); }));
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

  getClassification(file: TFile): string | undefined {
    const value: unknown = this.app.metadataCache.getFileCache(file)?.frontmatter?.[CLASSIFICATION_FIELD];
    return typeof value === "string" && value.trim() ? value : undefined;
  }

  selectForFile(file: TFile, onlyIfMissing = false): Promise<void> {
    return this.queuePrompt(async () => {
      if (!this.canWrite(file)) return;
      if (onlyIfMissing) {
        const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
        if (!this.settings.classifications.length || (frontmatter && Object.hasOwn(frontmatter, CLASSIFICATION_FIELD))) return;
      }

      const value = await this.chooseClassification(this.translate("note.classify"), file.basename, this.getClassification(file));
      if (value && !this.stopped) await this.writeClassification(file, value, onlyIfMissing ? "missing" : "always");
    }, "errors.openClassification");
  }

  private selectForFiles(files: readonly TFile[]): Promise<void> {
    return this.queuePrompt(async () => {
      const notes = files.filter((file) => this.canWrite(file));
      if (!notes.length) return;

      const value = await this.chooseClassification(
        this.translate("note.classifySelected"), this.translate("note.selectedCount", { count: notes.length }),
      );
      if (value) await this.writeClassifications(notes, value, "always");
    }, "errors.openClassification");
  }

  private async chooseClassification(title: string, description: string, currentValue?: string): Promise<string | undefined> {
    const { classifications } = this.settings;
    if (!classifications.length) {
      new Notice(this.translate("errors.noClassifications"));
      return undefined;
    }

    const value = await new Promise<string | undefined>((resolve) => {
      this.modal = new ClassificationModal(this.app, title, description, classifications, currentValue, this.translate, resolve);
      this.modal.open();
    });
    this.modal = undefined;
    return value;
  }

  private editFolderSettings(folder: TFolder): Promise<void> {
    return this.queuePrompt(async () => {
      const currentClassification = await readFolderClassification(this.app, folder);
      if (this.stopped) return;
      const selection = await new Promise<FolderSettingsSelection | undefined>((resolve) => {
        this.modal = new FolderSettingsModal(this.app, folder.path, currentClassification, this.settings, this.translate, resolve);
        this.modal.open();
      });
      this.modal = undefined;
      if (!selection || this.stopped) return;
      if (selection.classification !== (currentClassification ?? null)) {
        await writeFolderClassification(this.app, folder, selection.classification);
      }
      const { applyTo } = selection;
      if (!applyTo || this.stopped || this.app.vault.getFolderByPath(folder.path) !== folder) return;

      const notes: TFile[] = [];
      Vault.recurseChildren(folder, (file) => {
        if (this.isBatchNote(file)) notes.push(file);
      });
      await this.writeClassifications(notes, applyTo.classification, applyTo.scope);
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

  private isBatchNote(file: TAbstractFile): file is TFile {
    return this.isNote(file) && file.name !== FOLDER_META_FILENAME;
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

  private async classifyNewNote(file: TFile): Promise<void> {
    const folder = file.parent ?? this.app.vault.getRoot();
    try {
      const folderClassification = await readFolderClassification(this.app, folder);
      if (this.stopped || (file.parent ?? this.app.vault.getRoot()) !== folder || this.settings.creationMode !== "automatic") return;
      const classification = folderClassification ?? this.settings.defaultClassification;
      if (this.settings.classifications.some(({ value }) => value === classification)) {
        await this.writeClassification(file, classification, "missing");
      }
    } catch {
      if (!this.stopped && this.canWrite(file)) {
        new Notice(this.translate("errors.folderRead", { name: file.basename }));
      }
    }
  }

  private async writeClassifications(notes: readonly TFile[], value: string, mode: WriteMode): Promise<void> {
    for (const note of notes) {
      if (this.stopped) return;
      if (this.isBatchNote(note)) await this.writeClassification(note, value, mode);
    }
  }

  private async writeClassification(file: TFile, value: string, mode: WriteMode): Promise<void> {
    if (!this.canWrite(file) || (mode === "missing" && !this.isBatchNote(file))) return;
    try {
      await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
        const currentValue = frontmatter[CLASSIFICATION_FIELD];
        if (currentValue === value
          || (mode === "missing" && Object.hasOwn(frontmatter, CLASSIFICATION_FIELD))
          || (mode === "unclassified" && !isUnclassified(currentValue))) {
          // Returning from the callback would still let Obsidian reserialize the existing frontmatter.
          throw KEEP_CLASSIFICATION;
        }
        frontmatter[CLASSIFICATION_FIELD] = value;
      });
    } catch (error) {
      if (error !== KEEP_CLASSIFICATION && !this.stopped && this.canWrite(file)) {
        new Notice(this.translate("errors.classificationWrite", { name: file.basename }));
      }
    }
  }
}
