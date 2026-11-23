import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, isAbsolute, join } from "node:path";

const env = { ...process.env };
const options = process.argv.slice(2);
let config = "./wdio.conf.mts";
if (options[0] === "--screenshots") {
  options.shift();
  config = "./wdio.screenshots.conf.mts";
}
let executable = process.execPath;
let args = ["node_modules/@wdio/cli/bin/wdio.js", "run", config, ...options];

if (process.platform === "linux" && env.E2E_HEADED !== "1") {
  // Allow a local installation of the X11 tools without changing the system PATH.
  const tools = env.E2E_X11_TOOLS;
  if (tools) env.PATH = [tools, env.PATH].filter(Boolean).join(delimiter);
  for (const tool of ["xvfb-run", "Xvfb", "openbox", "xauth"]) {
    if (spawnSync("which", [tool], { env, stdio: "ignore" }).status !== 0) {
      console.error(`Missing ${tool}. Install xvfb, openbox and xauth, or set E2E_HEADED=1 to use a desktop session.`);
      process.exit(1);
    }
  }
  executable = "xvfb-run";
  args = [
    "--auto-servernum", "--server-args=-screen 0 1440x1000x24 -nolisten tcp",
    "sh", "-c", 'openbox --sm-disable & wm=$!; trap \'kill "$wm" 2>/dev/null || true\' EXIT; "$@"',
    "obsidian-tests", process.execPath, ...args,
  ];
}

// The test instance can bind the same CLI socket as the user's Obsidian session.
const runtimeDirectory = process.platform === "linux" ? mkdtempSync(join(tmpdir(), "classificator-obsidian-")) : undefined;
if (runtimeDirectory) {
  if (env.E2E_HEADED === "1" && env.XDG_RUNTIME_DIR && env.WAYLAND_DISPLAY && !isAbsolute(env.WAYLAND_DISPLAY)) {
    env.WAYLAND_DISPLAY = join(env.XDG_RUNTIME_DIR, env.WAYLAND_DISPLAY);
  }
  env.XDG_RUNTIME_DIR = runtimeDirectory;
}

try {
  const result = spawnSync(executable, args, { env, stdio: "inherit" });
  if (result.error) console.error(result.error.message);
  process.exitCode = result.status ?? 1;
} finally {
  if (runtimeDirectory) rmSync(runtimeDirectory, { recursive: true, force: true });
}
