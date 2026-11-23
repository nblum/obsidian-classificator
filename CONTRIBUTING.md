# Contributing to Classificator

## Shared plugin rules

Read the shared Obsidian plugin rules before working on the plugin. The `.obsidian-plugin-rules` file at the repository root contains the absolute path to the rules note on a single line. Git ignores the file. If the reference is missing or the note is inaccessible, ask the user where the note is stored and use that path to set up the local reference.

Add new rules that apply to Obsidian plugins generally to the shared note. Keep Classificator-specific guidance in this repository.

## Development

Use Node.js 24 (`nvm use`) and install the locked dependencies with `npm ci`.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Rebuild `main.js` on TypeScript changes with inline source maps. |
| `npm run lint` | Check repository JavaScript and TypeScript with ESLint. |
| `npm test` | Run the focused Node.js tests. |
| `npm run build` | Validate release metadata, type-check, and generate the production bundle. |
| `npm run test:e2e` | Build the plugin and exercise it in Obsidian with a temporary copy of the fixture vault. |

Run lint, tests, and the build before submitting a change. Run the Obsidian suite when editing classification behavior or the UI. For a manual check, install the three plugin files from the [README](README.md#installation) into a test vault and reload Obsidian after rebuilding.

On Linux, install `xvfb`, `openbox` and `xauth` to run the suite on a private display. Set `E2E_HEADED=1` for a visible Linux debugging run. The local default is Obsidian Desktop 1.7.4, the minimum supported version. Set `OBSIDIAN_VERSION=latest` to check the current public build. CI runs both. WDIO logs and any failure screenshots go to `e2e-results/`.

## Layout

- `src/` contains the TypeScript plugin, with lifecycle and classification writes in `main.ts` and separate modules for badges, settings, and the selection dialog.
- `manifest.json` and `styles.css` are shipped with the generated `main.js`. Keep `main.js` and local vault settings out of Git.
- `tests/` contains focused tests and Obsidian scenarios. Keep test data in the fixture vault under `tests/e2e/vault/`.
- `scripts/` and `.github/workflows/` contain the local tooling and hosted pipelines. Use [AGENTS.md](AGENTS.md) for the project skills.

## Documentation screenshots

Run `npm run screenshots` to produce a preview gallery at `e2e-results/screenshots/index.html`. Review the gallery, then use `npm run screenshots:update` to capture and validate the set before updating `assets/screenshots/`.

The separate capture suite uses Obsidian 1.15.1 by default, a temporary copy of the documentation vault, the light theme, and English. It uses the same Linux display requirements as the E2E suite. Set `OBSIDIAN_VERSION` to capture another version or `E2E_HEADED=1` to watch the capture. Register added images in `tests/e2e/screenshot-assets.json` and capture them in `tests/e2e/documentation.capture.ts`.

## Releases

Before each new release, read the current [shared plugin rules](#shared-plugin-rules) and review the full checklist against the release candidate. Resolve any unmet applicable pre-release requirements before publishing. Complete the checklist's post-release checks after publication.

1. Record user-visible changes under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md).
2. Run `npm run release:prepare -- <version>` for a version newer than the manifest. This updates `manifest.json`, `package.json`, `package-lock.json` and `versions.json`, and moves the release notes to the version heading. If the minimum Obsidian version changes, update the manifest, the new version's entry in `versions.json`, and the E2E baseline in `wdio.conf.mts` and CI. Preserve compatibility entries for prior releases.
3. Review and commit the version files. Push the release commit to `main` and wait for CI to pass. For the existing `0.2.0` metadata, the first release can start at this step after verifying that version's changelog entry.
4. Create an annotated tag on that commit and push the tag. The tag is the literal version, such as `0.2.0`, because Obsidian uses it to find the release. [Obsidian release documentation](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin)

```sh
git tag -a 0.2.0 -m "Classificator 0.2.0"
git push origin refs/tags/0.2.0
```

The tag workflow validates the tagged metadata and uses the matching changelog entry for the GitHub release. It builds and publishes `main.js`, `manifest.json` and `styles.css`. Public repositories also get build attestations. Download the three attached files after publishing, install them in a fresh vault, and check the introduction, settings, and classification of a new note.
