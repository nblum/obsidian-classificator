import { MarkdownView, setTooltip } from "obsidian";
import type Classificator from "./main";

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
      if (this.plugin.settings.showExplorerBadge && leaf.view.getViewType() === "file-explorer") {
        roots.add(leaf.view.containerEl);
      }
      if (this.plugin.settings.showNoteBadge && leaf.view instanceof MarkdownView && leaf.view.file) {
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
    const dot = this.plugin.settings.explorerBadgeStyle === "dot";
    for (const row of root.querySelectorAll<HTMLElement>(EXPLORER_TITLE)) {
      const path = row.dataset.path;
      const file = path ? this.plugin.app.vault.getFileByPath(path) : null;
      const value = file ? this.plugin.getClassification(file) : undefined;
      const existing = row.querySelector<HTMLElement>(`:scope > .${BADGE}--explorer`);
      if (!value) {
        existing?.remove();
        continue;
      }

      const badge = existing ?? row.createSpan({ cls: [BADGE, `${BADGE}--explorer`] });
      badge.toggleClass(DOT, dot);
      if (dot) {
        badge.setAttribute("role", "img");
        badge.setAttribute("aria-label", value);
      } else {
        badge.removeAttribute("role");
        badge.removeAttribute("aria-label");
      }
      this.updateBadge(badge, value);
    }
  }

  private renderHeader(view: MarkdownView): void {
    let badge = this.headers.get(view);
    if (!badge?.isConnected) {
      badge = view.addAction("tag", this.plugin.translate("badge.change"), () => {
        if (view.file) void this.plugin.selectForFile(view.file);
      });
      badge.addClass(BADGE, `${BADGE}--header`);
      badge.setAttribute("role", "button");
      badge.setAttribute("tabindex", "0");
      badge.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          badge?.click();
        }
      });
      this.headers.set(view, badge);
    }
    const value = view.file ? this.plugin.getClassification(view.file) : undefined;
    this.updateBadge(badge, value, this.plugin.translate("badge.classify"));
  }

  private updateBadge(badge: HTMLElement, value: string | undefined, emptyLabel = ""): void {
    const label = value ?? emptyLabel;
    const text = badge.hasClass(DOT) ? "" : label;
    const color = this.plugin.settings.classifications.find((entry) => entry.value === value)?.color ?? "gray";
    if (badge.textContent !== text) badge.setText(text);
    badge.dataset.color = color;
    if (badge.hasClass(`${BADGE}--header`)) {
      const t = this.plugin.translate;
      const actionLabel = value ? t("badge.changeValue", { value }) : t("note.classify");
      if (badge.getAttribute("aria-label") !== actionLabel) {
        badge.setAttribute("aria-label", actionLabel);
        setTooltip(badge, actionLabel);
      }
    } else {
      badge.title = label;
    }
  }
}
