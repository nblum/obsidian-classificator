import { FileView, setIcon, setTooltip } from "obsidian";
import type { TFile } from "obsidian";
import { FOLDER_META_FILENAME } from "./folder-metadata";
import type Classificator from "./main";
import { getExplorerBadgeStyle } from "./settings";
import type { Color } from "./settings";

const EXPLORER_TITLE = ".nav-file-title[data-path]";
const EXPLORER_TOOLBAR = ".nav-header .nav-buttons-container";
const BADGE = "classificator-badge";
const DOT = "classificator-badge--dot";
const EXPLORER_BADGE = `${BADGE}--explorer`;
const EXPLORER_BADGED_ROW = "classificator-explorer-row-with-badge";
const EXPLORER_TOGGLE = "classificator-explorer-toggle";

export class ClassificationBadges {
  private readonly explorers = new Map<HTMLElement, MutationObserver>();
  private readonly headers = new Map<FileView, HTMLElement>();
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
    const fileViews = new Map<FileView, TFile>();

    workspace.iterateAllLeaves((leaf) => {
      if (leaf.view.getViewType() === "file-explorer") {
        roots.add(leaf.view.containerEl);
      }
      if (leaf.view instanceof FileView && leaf.view.file) {
        fileViews.set(leaf.view, leaf.view.file);
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
      if (!fileViews.has(view)) {
        badge.remove();
        this.headers.delete(view);
      }
    }
    for (const [view, file] of fileViews) this.renderHeader(view, file);
  }

  private removeExplorer(root: HTMLElement): void {
    this.explorers.get(root)?.disconnect();
    this.explorers.delete(root);
    this.clearExplorerBadges(root);
    root.querySelectorAll(`.${EXPLORER_TOGGLE}`).forEach((toggle) => toggle.remove());
  }

  private clearExplorerBadges(root: HTMLElement): void {
    root.querySelectorAll(`.${EXPLORER_BADGE}`).forEach((badge) => badge.remove());
    root.querySelectorAll(`.${EXPLORER_BADGED_ROW}`).forEach((row) => row.removeClass(EXPLORER_BADGED_ROW));
  }

  private renderExplorer(root: HTMLElement): void {
    const { settings } = this.plugin;
    this.renderExplorerToggle(root, settings.showExplorerClassifications);
    if (!settings.showExplorerClassifications) {
      this.clearExplorerBadges(root);
      return;
    }

    for (const row of root.querySelectorAll<HTMLElement>(EXPLORER_TITLE)) {
      const path = row.dataset.path;
      const file = path ? this.plugin.app.vault.getFileByPath(path) : null;
      const value = file ? this.plugin.getClassification(file) : undefined;
      const classification = settings.classifications.find((entry) => entry.value === value);
      const style = getExplorerBadgeStyle(settings, classification);
      const interactive = file?.name !== FOLDER_META_FILENAME;
      let existing = row.querySelector<HTMLElement>(`:scope > .${EXPLORER_BADGE}`);
      if (existing && existing.hasAttribute("aria-haspopup") !== interactive) {
        existing.remove();
        existing = null;
      }
      const showBadge = !!value && style !== "hidden";
      row.classList.toggle(EXPLORER_BADGED_ROW, showBadge);
      if (!showBadge) {
        existing?.remove();
        continue;
      }

      const badge = existing ?? row.createSpan({ cls: [BADGE, EXPLORER_BADGE] });
      if (!existing && interactive) {
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

  private renderExplorerToggle(root: HTMLElement, visible: boolean): void {
    const toolbar = root.querySelector<HTMLElement>(EXPLORER_TOOLBAR);
    if (!toolbar) return;

    let button = toolbar.querySelector<HTMLButtonElement>(`:scope > .${EXPLORER_TOGGLE}`);
    if (!button) {
      button = toolbar.createEl("button", {
        cls: ["clickable-icon", "nav-action-button", EXPLORER_TOGGLE], attr: { type: "button" },
      });
      setIcon(button, "tag");
      button.addEventListener("click", () => this.plugin.toggleExplorerClassifications());
    }
    button.setAttribute("aria-pressed", String(visible));
    const label = this.plugin.translate("badge.toggleExplorer");
    if (button.getAttribute("aria-label") !== label) {
      button.setAttribute("aria-label", label);
      setTooltip(button, label);
    }
  }

  private renderHeader(view: FileView, file: TFile): void {
    const { settings } = this.plugin;
    const value = this.plugin.getClassification(file);
    const classification = settings.classifications.find((entry) => entry.value === value);
    const interactive = file.name !== FOLDER_META_FILENAME;
    let badge = this.headers.get(view);
    if (badge && badge.hasAttribute("aria-haspopup") !== interactive) {
      badge.remove();
      this.headers.delete(view);
      badge = undefined;
    }
    if (!badge?.isConnected) {
      if (interactive) {
        const action = view.addAction("tag", this.plugin.translate("badge.change"), () => {
          if (view.file) this.plugin.showClassificationMenu(view.file, action);
        });
        badge = action;
        this.enableMenuButton(badge);
      } else {
        badge = view.containerEl.querySelector<HTMLElement>(".view-actions")?.createSpan({ cls: "view-action" });
        if (!badge) return;
      }
      badge.addClass(BADGE, `${BADGE}--header`);
      this.headers.set(view, badge);
    }
    this.updateBadge(badge, value, value ?? this.plugin.translate("badge.classify"), classification?.color, file.extension === "md");
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

  private updateBadge(badge: HTMLElement, value: string | undefined, text: string, color: Color = "gray", isNote = true): void {
    if (badge.textContent !== text) badge.setText(text);
    badge.dataset.color = color;
    const t = this.plugin.translate;
    const actionLabel = badge.hasAttribute("aria-haspopup")
      ? (value ? t("badge.changeValue", { value }) : t(isNote ? "note.classify" : "attachment.classify"))
      : value ?? "";
    if (badge.getAttribute("aria-label") !== actionLabel) {
      badge.setAttribute("aria-label", actionLabel);
      setTooltip(badge, actionLabel);
    }
  }
}
