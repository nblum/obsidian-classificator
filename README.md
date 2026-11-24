# Classificator

Classificator helps you label Markdown notes and attachments in Obsidian’s file explorer and in the header of an open file. The default values are `unclassified`, `public`, `internal`, and `confidential`.

Classificator’s role is limited to saving and displaying the label. It saves a note’s classification as the `classification` property in its YAML frontmatter. Scripts and other plugins can read it and decide how to use it. For example, Langdock Sync uses the property to determine which notes are eligible for synchronization. [Langdock Sync documentation](https://github.com/nblum/obsidian-langdock-sync#freigabe-und-abgleich)

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

Click a badge in the note header or file explorer, then click a classification to apply it immediately. You can also use **Classify note** in the file context menu or **Classify active note** in the command palette. Obsidian saves the chosen value at the top of the file.

```yaml
---
classification: internal
---
```

To give several notes the same classification, select them in the file explorer, right-click one of them, and choose **Classify selected notes**. Select a value and open **Preview changes**. Expand each group to see which files will get a new value, be overwritten, or be skipped. The batch runs when you choose **Apply changes**. It skips folders, `_meta.md`, and files whose path or classification changed after the preview.

## Classify attachments

Open an attachment in Obsidian and click **Classify** or the current classification in its header to choose a value. You can also right-click the attachment in the file explorer and choose **Classify attachment**, or click its existing badge there. To classify multiple attachments or a mix of notes and attachments, use **Classify selected files**. To display DOCX and other file types that Obsidian cannot open by default, enable **Settings → Files and links → Show all file types**.

Classificator saves the attachment’s classification in the YAML frontmatter of `_meta.md` in the same folder. The `attachment-classifications` mapping uses full filenames, including the extension. The attachment stays unchanged. Edit the mapping in Source mode to adjust values directly.

```yaml
---
classification: internal
attachment-classifications:
  Offer.pdf: confidential
  Team photo.jpg: public
---
```

The top-level `classification` is the folder’s default for new notes. In Classificator, `_meta.md` itself always counts as `unclassified`. Integrations reading YAML directly should skip `_meta.md` when reading individual note classifications.

Classificator updates the attachment entry when it sees an Obsidian rename or move and removes it when it sees a deletion. A move to another folder stores the entry in the destination’s `_meta.md`. Folder defaults and the new-note modes apply to Markdown notes.

## Classification overview

Open **Classificator: Classification overview** from the command palette to find notes with missing or empty classifications, notes explicitly set to `unclassified`, and notes with unknown values. Unknown values include classifications removed from settings and properties stored in a format other than text. Filter by status and folder, including that folder’s subfolders. Select a result to open the note.

## Folder rules

Right-click a folder in the file explorer and choose **Classificator: Folder rules** to set its default classification. Classificator saves the rule in the folder’s `_meta.md`. You can also edit that file directly.

```yaml
---
classification: confidential
---
```

In **Apply default value** mode, a folder’s `classification` takes precedence over the global default for new empty notes. Enable **Inherit folder rules** in Classificator settings to let folders without a rule use the nearest ancestor’s rule, including a rule at the vault root. The folder dialog shows the inherited value and its source. Classificator uses the global default when no applicable folder provides a rule. If the applicable rule contains an unconfigured value, automatic classification skips the note until the rule is corrected.

To remove a folder’s own rule, choose the **Global** or **Inherited from** option and select **Save rule**. This updates the default for future notes.

To update existing notes, choose the scope and which notes to update, then select **Preview changes**. By default it considers notes directly in the folder with a missing, empty, or `unclassified` value. You can include subfolders or switch to all notes. For a recursive batch, the selected value applies throughout the scope, including subfolders with their own rule. **Apply changes** updates the notes. Use **Save rule** separately to persist the selected default.

![Folder rules dialog with a default classification, scope and preview for existing notes](assets/screenshots/folder-rules.png)

## Appearance and classifications

Use the tag icon next to the file explorer’s new note and new folder buttons to toggle all explorer badges and dots. Classificator remembers this choice for the vault and restores your configured styles when you turn the display back on.

Under **Settings → Classificator → Classifications**, choose **Text badge**, **Color dot**, or **Hidden** for each classification in the file explorer. Badges and dots appear at the right edge of each file row. Hover over a dot to see the classification. The file header always shows a text badge.

Existing classifications start with the previous global file explorer settings. You can also add custom values, change colors, and remove values from the picker. Notes retain any values they already contain.

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
