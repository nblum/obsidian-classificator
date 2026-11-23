---
name: release-classificator
description: Prepare, validate, or publish a Classificator Obsidian release using synchronized version files and the GitHub tag workflow.
---

# Release Classificator

Read the [shared plugin rules](../../CONTRIBUTING.md#shared-plugin-rules) through `.obsidian-plugin-rules` at the repository root. Ask the user for the note's location if the reference is missing or the note is inaccessible. For each new release, review the full checklist during preparation and confirm all applicable pre-release requirements are met before publishing.

Read the release section in [CONTRIBUTING.md](../../CONTRIBUTING.md). Check the requested version, current manifest, changelog, and Git status first.

- For a newer version, use `npm run release:prepare -- <version>` to update the metadata and move the Unreleased notes together. If the manifest already has the requested version, validate the existing metadata and changelog section directly.
- Verify the exact `x.y.z` tag with `node scripts/release-metadata.mjs notes <version>` and run the documented checks. Confirm that `main` contains the intended release commit and CI passed before pushing a tag.
- Push a tag only when the user requests publication. The tag triggers the GitHub release. Verify the release workflow and confirm that all three assets are attached.
