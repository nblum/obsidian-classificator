import { MarkdownView, setTooltip } from "obsidian";
import type Classificator from "./main";
import { getExplorerBadgeStyle } from "./settings";
import type { Color } from "./settings";

const EXPLORER_TITLE = ".nav-file-title[data-path]";
const BADGE = "classificator-badge";
const DOT = "classificator-badge--dot";

export class ClassificationBadges {
  private readonly explorers = new Map<HTMLElement, MutationObserver>();
  private readonly headers = new Map<MarkdownView, HTMLElement>();
  private frame: number | undefined;

  constructor(private readonly plugin: Classificator) {}

  refresh(): void {
    if (this.frame !== undefined) return;
    this.frame = window.requestAnimationFrame(() => {
      this.frame = undefined;
      this.render();
    });
  }

  dispose(): void {
    if (this.frame !== undefined) window.cancelAnimationFrame(this.frame);
    this.frame = undefined;
    for (const root of this.explorers.keys()) this.removeExplorer(root);
    for (const badge of this.headers.values()) badge.remove();
    this.headers.clear();
  }

  private render(): void {
    const { workspace } = this.plugin.app;
    const roots = new Set<HTMLElement>();
    const notes = new Set<MarkdownView>();

    workspace.iterateAllLeaves((leaf) => {
      if (leaf.view.getViewType() === "file-explorer") {
        roots.add(leaf.view.containerEl);
      }
      if (leaf.view instanceof MarkdownView && leaf.view.file) {
        notes.add(leaf.view);
      }
    });

    for (const root of this.explorers.keys()) {
      if (!roots.has(root)) this.removeExplorer(root);
    }
    for (const root of roots) {
      if (!this.explorers.has(root)) {
        const observer = new MutationObserver(() => this.refresh());
        observer.observe(root, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ["data-path"],
        });
        this.explorers.set(root, observer);
      }
      this.renderExplorer(root);
    }

    for (const [view, badge] of this.headers) {
      if (!notes.has(view)) {
        badge.remove();
        this.headers.delete(view);
      }
    }
    for (const view of notes) this.renderHeader(view);
  }

  private removeExplorer(root: HTMLElement): void {
    this.explorers.get(root)?.disconnect();
    this.explorers.delete(root);
    root.querySelectorAll(`.${BADGE}--explorer`).forEach((element) => element.remove());
  }

  private renderExplorer(root: HTMLElement): void {
    const { settings } = this.plugin;
    for (const row of root.querySelectorAll<HTMLElement>(EXPLORER_TITLE)) {
      const path = row.dataset.path;
      const file = path ? this.plugin.app.vault.getFileByPath(path) : null;
      const value = file ? this.plugin.getClassification(file) : undefined;
      const classification = settings.classifications.find((entry) => entry.value === value);
      const style = getExplorerBadgeStyle(settings, classification);
      const existing = row.querySelector<HTMLElement>(`:scope > .${BADGE}--explorer`);
      if (!value || style === "hidden") {
        existing?.remove();
        continue;
      }

      const badge = existing ?? row.createSpan({ cls: [BADGE, `${BADGE}--explorer`] });
      if (!existing) {
        this.enableMenuButton(badge);
        badge.addEventListener("click", (event) => {
          event.stopPropagation();
          const path = row.dataset.path;
          const file = path ? this.plugin.app.vault.getFileByPath(path) : null;
          if (file) this.plugin.showClassificationMenu(file, badge);
        });
      }
      badge.toggleClass(DOT, style === "dot");
      this.updateBadge(badge, value, style === "dot" ? "" : value, classification?.color);
    }
  }

  private renderHeader(view: MarkdownView): void {
    const { settings } = this.plugin;
    const value = view.file ? this.plugin.getClassification(view.file) : undefined;
    const classification = settings.classifications.find((entry) => entry.value === value);
    let badge = this.headers.get(view);
    if (!badge?.isConnected) {
      const action = view.addAction("tag", this.plugin.translate("badge.change"), () => {
        if (view.file) this.plugin.showClassificationMenu(view.file, action);
      });
      badge = action;
      badge.addClass(BADGE, `${BADGE}--header`);
      this.enableMenuButton(badge);
      this.headers.set(view, badge);
    }
    this.updateBadge(badge, value, value ?? this.plugin.translate("badge.classify"), classification?.color);
  }

  private enableMenuButton(badge: HTMLElement): void {
    badge.setAttribute("role", "button");
    badge.setAttribute("tabindex", "0");
    badge.setAttribute("aria-haspopup", "menu");
    badge.setAttribute("aria-expanded", "false");
    badge.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        event.stopPropagation();
        badge.click();
      }
    });
  }

  private updateBadge(badge: HTMLElement, value: string | undefined, text: string, color: Color = "gray"): void {
    if (badge.textContent !== text) badge.setText(text);
    badge.dataset.color = color;
    const t = this.plugin.translate;
    const actionLabel = value ? t("badge.changeValue", { value }) : t("note.classify");
    if (badge.getAttribute("aria-label") !== actionLabel) {
      badge.setAttribute("aria-label", actionLabel);
      setTooltip(badge, actionLabel);
    }
  }
}
