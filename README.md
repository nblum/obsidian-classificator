# Classificator

Classificator helps you label Markdown notes by classification and see those labels at a glance in Obsidian’s file explorer and note header. The default values are `unclassified`, `public`, `internal`, and `confidential`.

Classificator’s role is limited to saving and displaying the label. It saves the value as a regular Obsidian property named `classification` in the note’s YAML frontmatter. Scripts and other plugins can read it and decide how to use it. For example, Langdock Sync uses the property to determine which notes are eligible for synchronization. [Langdock Sync documentation](https://github.com/nblum/obsidian-langdock-sync#freigabe-und-abgleich)

![Classification badges in the file explorer and note header](assets/screenshots/classification.png)

## Installation

Classificator requires Obsidian Desktop 1.7.4 or later. Copy `manifest.json`, `main.js`, and `styles.css` from a GitHub release or a local build to `.obsidian/plugins/classificator/` in your vault. Then enable **Classificator** under **Settings → Community plugins**. [GitHub releases](https://github.com/nblum/obsidian-classificator/releases)

## Introduction and plugin information

On first launch, Classificator walks you through classifying notes, choosing defaults, and setting folder rules. **Show introduction** and **About Classificator** are available in settings and in the command palette.

The top of the settings tab shows the plugin version, author, and links to documentation, the repository, and feedback. Classificator shows the save status when you change a setting. [Settings](assets/screenshots/settings.png) · [Introduction](assets/screenshots/introduction.png) · [About Classificator](assets/screenshots/about.png)

## Language

Classificator follows Obsidian’s language by default. Under **Settings → Classificator → Language**, you can choose German, English, French, Italian, Spanish, Dutch, Brazilian or European Portuguese, or Simplified Chinese. Classificator uses English for other Obsidian languages.

## Classify notes

Under **Settings → Classificator → New notes**, choose what happens when you create an empty Markdown note.

| Mode | Behavior |
| --- | --- |
| **Apply default value** | Sets the chosen classification. The default is `unclassified`. |
| **Ask when creating a note** | Opens the classification picker. Choose **Skip** to leave the property unset. |
| **Classify manually only** | Lets you classify the note when needed. |

The new-note modes apply to empty Markdown files and skip `_meta.md`. If you create a note with content or from a template, you can classify it manually afterward.

Use the note header badge, **Classify note** in the file context menu, or **Classify active note** in the command palette. Obsidian saves the chosen value at the top of the file.

```yaml
---
classification: internal
---
```

To give several notes the same classification, select them in the file explorer, right-click one of them, and choose **Classify selected notes**. The action applies to selected Markdown notes and skips folders, attachments, and `_meta.md`.

## Folder rules

Right-click a folder in the file explorer and choose **Classificator: Folder rules** to set its default classification. Classificator saves the rule in the folder’s `_meta.md`. You can also edit that file directly.

```yaml
---
classification: confidential
---
```

In **Apply default value** mode, a folder’s `classification` takes precedence over the global default for new empty notes created directly in that folder. Choose a value configured in Classificator.

Choose **Global** in the folder dialog to remove `classification` from `_meta.md` and use the global default.

**Apply to unclassified notes** is checked by default. When you save, Markdown notes in the folder and its subfolders receive the chosen value if their classification is missing, empty, or set to `unclassified`. **Apply to all children** starts unchecked and takes priority when both boxes are checked. Clear both boxes to save just the folder rule.

![Folder rules dialog with a default classification and checkboxes for existing notes](assets/screenshots/folder-rules.png)

## Appearance and classifications

In Classificator settings, you can toggle the file explorer and note header badges independently. For the file explorer, choose **Text badge** or **Color dot**. The color dot’s tooltip shows the classification.

Under **Classifications**, you can add custom values, change colors, and remove values from the picker. Notes retain any values they already contain.

## Development and testing

Development requires Node.js 24. The build generates `main.js` in the project directory for manual installation.

```sh
npm ci
npm run build
```

```sh
npm test
npm run test:e2e
```

`npm test` checks release metadata and translations. The end-to-end tests use a temporary vault to verify classification, folder rules, preservation of note content and properties, settings, and help dialogs. See the contributor guide for Linux prerequisites and documentation screenshots. [CONTRIBUTING.md](CONTRIBUTING.md)
