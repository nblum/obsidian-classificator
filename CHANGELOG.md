# Changelog

## [Unreleased]

### Added

- Add a welcome page and illustrate each step of the introduction.

### Changed

- Use color dots as the default file explorer style.

### Fixed

- Refresh file explorer badges when Obsidian finishes resolving metadata so that existing classifications appear without opening a file.

## [0.5.1] - 2026-11-24

### Changed

- Place **Save default** beside the folder default. Keep the dialog open with the chosen scope so you can review and apply changes to existing notes afterward.

## [0.5.0] - 2026-11-24

### Added

- Preview which notes will get a new classification, be overwritten, or be skipped before applying a batch.
- Open the classification overview to find notes with missing, unclassified, or unknown values and filter by folder and status.
- Optionally inherit the nearest parent folder’s classification rule and see its source in the folder dialog.
- Toggle classification badges and dots from the file explorer toolbar. The vault remembers the display setting.
- Classify attachments from the file explorer and store their labels in the folder’s `_meta.md` alongside its existing properties.
- Set or change the classification of an open attachment from its header.

### Changed

- Save folder defaults separately from updates to existing notes. Choose whether a batch includes subfolders.
- Treat `_meta.md` as unclassified in the file explorer and note header, and reserve its `classification` property for the folder default.
- Right-align classification badges and dots for Markdown notes and attachments in the file explorer.

## [0.4.0] - 2026-11-23

### Changed

- Change a note’s classification in two clicks from its header or file explorer badge.
- Choose a text badge, outlined color dot, or hidden appearance for each classification in the file explorer. The note header always shows a text badge.

## [0.3.0] - 2026-11-23

### Added

- Set one classification for multiple selected notes from the file explorer context menu.
- Use two checkboxes to apply a folder classification to existing notes in the folder and its subfolders. The checkbox for unclassified notes is selected by default.
- Find Classificator options in Obsidian's settings search on Obsidian 1.13 and later.

### Changed

- Use Obsidian's standard heading in the Classificator settings tab.
- Provide the README in English and explain how scripts and other plugins can use the `classification` property.

## [0.2.0]

### Added

- Classify empty Markdown notes on creation with a default value, a prompt, or manual selection.
- Display configurable classification badges in the file explorer and the note header.
- Change a note's classification from the header badge, the file context menu, or the command palette.
- Set a folder's default classification from its context menu or in `_meta.md`.
- Translate the interface, command, and notices into nine languages. Follow the Obsidian language by default and allow a manual override.
- Add a first-run introduction and an About dialog with plugin details and links. Open either from settings or the command palette.
- Show color-coded progress, success, and errors when saving settings.
- Add a separate documentation screenshot suite and preview gallery.
- Support Obsidian Desktop 1.7.4 or later.
