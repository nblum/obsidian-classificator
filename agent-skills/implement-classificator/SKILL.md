---
name: implement-classificator
description: Implement or fix Classificator plugin behavior, including note classification, Obsidian commands, settings, and file explorer or note header badges.
---

# Implement Classificator

Read the [shared plugin rules](../../CONTRIBUTING.md#shared-plugin-rules) through `.obsidian-plugin-rules` at the repository root. Ask the user for the note's location if the reference is missing or the note is inaccessible. Add any new general plugin rules to the shared note.

Read [README.md](../../README.md) and [CONTRIBUTING.md](../../CONTRIBUTING.md). Trace the behavior through the entry point in `src/main.ts` and the affected module in `src/`.

- Persist classifications in the `classification` YAML property through Obsidian's `processFrontMatter`. Preserve unrelated properties and note content. Automatic classification applies to new empty Markdown notes, excludes `_meta.md`, and respects an existing property even if Obsidian's metadata cache is stale.
- When adjusting badge rendering, check both the file explorer and note header, including disabled badges and plugin unload. Keep class names scoped to the plugin and preserve keyboard access to the header action.
- Use a focused test for a behavior change. For frontmatter writes or UI interactions, exercise the normal Obsidian entry point in `tests/e2e/` using the fixture vault. Run the validation commands from CONTRIBUTING.md and record user-visible changes in the changelog.
