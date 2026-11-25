import { setIcon } from "obsidian";
import type { Translator } from "./i18n";
import { UNCLASSIFIED } from "./note-classification";

const noteClassifications = [UNCLASSIFIED, "public", "internal", "confidential"];
const exampleClassification = "internal";

function createPanel(stage: HTMLElement, title: string, icon: string): [HTMLElement, HTMLElement] {
  const panel = stage.createDiv({ cls: "classificator-intro-panel" });
  const header = panel.createDiv({ cls: "classificator-intro-panel-header" });
  setIcon(header.createSpan({ cls: "classificator-intro-icon" }), icon);
  header.createSpan({ cls: "classificator-intro-panel-title", text: title });
  return [panel, header];
}

function renderNote(stage: HTMLElement, t: Translator, showMenu: boolean): void {
  const [panel, header] = createPanel(stage, t("intro.exampleNote"), "file-text");
  const action = header.createDiv({ cls: "classificator-intro-note-action" });
  action.createSpan({
    cls: ["classificator-badge", "classificator-intro-badge"],
    text: exampleClassification,
    attr: { "data-color": "blue" },
  });

  const body = panel.createDiv({ cls: "classificator-intro-note-lines" });
  body.createSpan();
  body.createSpan();
  body.createSpan();

  if (showMenu) {
    const menu = action.createDiv({ cls: "classificator-intro-note-menu" });
    for (const value of noteClassifications) {
      const row = menu.createDiv({ cls: "classificator-intro-menu-row" });
      row.createSpan({ text: value });
      if (value === exampleClassification) {
        row.addClass("classificator-intro-menu-current");
        setIcon(row.createSpan({ cls: "classificator-intro-icon" }), "check");
      }
    }
  }
}

function renderSetting(panel: HTMLElement, name: string, value: string): void {
  const row = panel.createDiv({ cls: "classificator-intro-setting" });
  row.createSpan({ text: name });
  const field = row.createSpan({ cls: "classificator-intro-select" });
  field.createSpan({ text: value });
  setIcon(field.createSpan({ cls: "classificator-intro-icon" }), "chevrons-up-down");
}

export const introductionIllustrations = {
  welcome: (stage: HTMLElement, t: Translator) => renderNote(stage, t, false),
  picker: (stage: HTMLElement, t: Translator) => renderNote(stage, t, true),
  defaults(stage: HTMLElement, t: Translator): void {
    const [panel] = createPanel(stage, "Classificator", "settings");
    renderSetting(panel, t("settings.newNotes"), t("settings.automatic"));
    renderSetting(panel, t("settings.defaultValue"), exampleClassification);
  },
  folders(stage: HTMLElement, t: Translator): void {
    const [panel] = createPanel(stage, t("intro.exampleFolder"), "folder");
    renderSetting(panel, t("folder.default"), "confidential");
  },
};
