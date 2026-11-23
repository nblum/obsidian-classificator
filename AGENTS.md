# Classificator Agent Instructions

- Before working on the plugin, read the [shared plugin rules](CONTRIBUTING.md#shared-plugin-rules) through the local `.obsidian-plugin-rules` reference. Ask the user for the note's location if the reference is missing or the note is inaccessible.
- Read [README.md](README.md) for user-facing behavior and [CONTRIBUTING.md](CONTRIBUTING.md) for the project layout and validation commands.
- Read [implement-classificator](agent-skills/implement-classificator/SKILL.md) for plugin features, bug fixes, and UI changes. Read [release-classificator](agent-skills/release-classificator/SKILL.md) for release preparation and publishing.
- Write development documentation and agent instructions in English. Add user-facing text to all dictionaries in `locales/` with matching keys and placeholders. Keep plugin settings keys and existing classification values compatible with installed versions.
- Keep `main.js` generated and ignored. Record user-visible changes in [CHANGELOG.md](CHANGELOG.md) under `## [Unreleased]`.
