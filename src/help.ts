import { Modal } from "obsidian";
import type { App, PluginManifest } from "obsidian";
import type { TranslationKey, Translator } from "./i18n";
import { introductionIllustrations } from "./introduction-illustrations";

const repository = "https://github.com/nblum/obsidian-classificator";
const aboutLinks = [
  ["about.documentation", `${repository}#readme`],
  ["about.repository", repository],
  ["about.feedback", `${repository}/issues/new`],
  ["about.website", "https://blum-nico.de"],
] as const satisfies readonly (readonly [TranslationKey, string])[];

export function renderAbout(container: HTMLElement, t: Translator, manifest: PluginManifest): void {
  container.createEl("p", { text: t("about.description") });

  const metadata = container.createEl("p", { cls: "classificator-about-meta" });
  metadata.createSpan({ text: t("about.version", { version: manifest.version }) });
  metadata.createSpan({ text: t("about.author", { author: manifest.author }) });

  const links = container.createEl("ul", { cls: "classificator-about-links" });
  for (const [key, href] of aboutLinks) {
    links.createEl("li").createEl("a", {
      text: t(key),
      cls: "external-link",
      attr: { href, target: "_blank", rel: "noopener" },
    });
  }
}

export class AboutModal extends Modal {
  constructor(
    app: App,
    private readonly t: Translator,
    private readonly manifest: PluginManifest,
    private readonly onFinish: () => void,
  ) {
    super(app);
  }

  override onOpen(): void {
    this.modalEl.addClass("classificator-about-modal");
    this.setTitle(this.t("commands.showAbout"));
    renderAbout(this.contentEl, this.t, this.manifest);
    this.contentEl.createDiv({ cls: "classificator-dialog-actions" })
      .createEl("button", { text: this.t("actions.close") })
      .addEventListener("click", () => this.close());
  }

  override onClose(): void {
    this.contentEl.empty();
    this.onFinish();
  }
}

const introductionSteps = [
  ["intro.welcomeTitle", "intro.welcomeDescription", "welcome"],
  ["intro.noteTitle", "intro.noteDescription", "picker"],
  ["intro.defaultsTitle", "intro.defaultsDescription", "defaults"],
  ["intro.foldersTitle", "intro.foldersDescription", "folders"],
] as const satisfies readonly (readonly [TranslationKey, TranslationKey, keyof typeof introductionIllustrations])[];

export class IntroductionModal extends Modal {
  private step = 0;

  constructor(app: App, private readonly t: Translator, private readonly onFinish: () => void) {
    super(app);
  }

  override onOpen(): void {
    this.modalEl.addClass("classificator-introduction-modal");
    this.setTitle(this.t("intro.title"));
    this.renderStep();
  }

  override onClose(): void {
    this.contentEl.empty();
    this.onFinish();
  }

  private renderStep(): void {
    const { contentEl, t } = this;
    const step = introductionSteps[this.step];
    if (!step) return;

    contentEl.empty();
    const [title, description, illustration] = step;
    const heading = contentEl.createEl("h3", { text: t(title), attr: { tabindex: "-1" } });
    contentEl.createEl("p", { text: t(description) });
    const stage = contentEl.createDiv({
      cls: "classificator-intro-illustration",
      attr: { "aria-hidden": "true" },
    });
    introductionIllustrations[illustration](stage, t);

    const actions = contentEl.createDiv({ cls: "classificator-dialog-actions" });
    actions.createSpan({
      cls: "classificator-intro-progress",
      text: t("intro.progress", { current: this.step + 1, total: introductionSteps.length }),
    });
    if (this.step > 0) {
      actions.createEl("button", { text: t("actions.back") }).addEventListener("click", () => {
        this.step--;
        this.renderStep();
      });
    }
    const last = this.step === introductionSteps.length - 1;
    actions.createEl("button", { cls: "mod-cta", text: t(last ? "actions.done" : "actions.next") })
      .addEventListener("click", () => {
        if (last) this.close();
        else {
          this.step++;
          this.renderStep();
        }
      });
    heading.focus();
  }
}
