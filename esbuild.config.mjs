import { build, context } from "esbuild";

const watch = process.argv.includes("--watch");
const options = {
  entryPoints: ["src/main.ts"],
  bundle: true,
  format: "cjs",
  platform: "browser",
  target: "es2022",
  external: ["obsidian"],
  outfile: "main.js",
  sourcemap: watch ? "inline" : false,
  minify: !watch,
  logLevel: "info",
};

if (watch) {
  await (await context(options)).watch();
} else {
  await build(options);
}
