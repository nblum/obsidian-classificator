import { cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import assets from "../tests/e2e/screenshot-assets.json" with { type: "json" };

const output = fileURLToPath(new URL("../e2e-results/screenshots/", import.meta.url));
const assetsDirectory = fileURLToPath(new URL("../assets/", import.meta.url));
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

async function readScreenshot(filename) {
  const png = await readFile(join(output, filename));
  if (png.length < 45 || !png.subarray(0, 8).equals(pngSignature) || png.toString("ascii", 12, 16) !== "IHDR"
    || !png.readUInt32BE(16) || !png.readUInt32BE(20) || png.subarray(-8, -4).toString("ascii") !== "IEND") {
    throw new Error(`Invalid or incomplete PNG capture: ${filename}`);
  }
  return png;
}

function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

async function writeGallery() {
  const gallery = assets.map(({ filename, description }) => {
    const text = escapeHtml(description);
    return `<figure><img src="${escapeHtml(filename)}" alt="${text}"><figcaption>${text}</figcaption></figure>`;
  }).join("\n");
  await writeFile(join(output, "index.html"), `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Classificator documentation screenshots</title>
<style>
  body { font: 16px/1.5 system-ui, sans-serif; max-width: 80rem; margin: 2rem auto; padding: 0 1rem; }
  figure { margin: 2rem 0; }
  img { display: block; max-width: 100%; border: 1px solid #ddd; }
  figcaption { margin-top: .5rem; }
</style>
<h1>Classificator documentation screenshots</h1>
${gallery}
</html>
`);
}

async function replaceScreenshots(images) {
  await mkdir(assetsDirectory, { recursive: true });
  const work = await mkdtemp(join(assetsDirectory, ".screenshots-"));
  const target = join(assetsDirectory, "screenshots");
  const replacement = join(work, "next");
  const backup = join(work, "previous");
  let backedUp = false;
  let keepBackup = false;

  try {
    await mkdir(replacement);
    try {
      await cp(target, replacement, { recursive: true });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    for (const { filename, png } of images) await writeFile(join(replacement, filename), png);
    try {
      await rename(target, backup);
      backedUp = true;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    try {
      await rename(replacement, target);
    } catch (error) {
      if (backedUp) {
        try {
          await rename(backup, target);
        } catch (rollbackError) {
          keepBackup = true;
          throw new AggregateError([error, rollbackError], `Could not restore screenshots. Backup: ${backup}`, { cause: rollbackError });
        }
      }
      throw error;
    }
  } finally {
    if (!keepBackup) await rm(work, { recursive: true, force: true });
  }
}

const images = await Promise.all(assets.map(async ({ filename }) => ({ filename, png: await readScreenshot(filename) })));
if (process.argv[2] === "--update") {
  await replaceScreenshots(images);
  console.log(`Updated ${images.length} documentation screenshots.`);
} else {
  await writeGallery();
  console.log(`Preview gallery: ${join(output, "index.html")}`);
}
