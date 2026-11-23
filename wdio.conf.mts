import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { browser } from "@wdio/globals";
import type {} from "wdio-obsidian-service";

export function createObsidianConfig(
  specs: string[], vault: string, defaultVersion: string, timeout = 60_000,
): WebdriverIO.Config {
  return {
    runner: "local",
    autoXvfb: false,
    framework: "mocha",
    specs,
    maxInstances: 1,
    capabilities: [{
      browserName: "obsidian",
      "wdio:obsidianOptions": {
        appVersion: process.env.OBSIDIAN_VERSION ?? defaultVersion,
        installerVersion: "earliest",
        plugins: [{ path: ".", enabled: false }],
        vault,
        copy: true,
      },
      "goog:chromeOptions": { args: ["--window-size=1440,1000"] },
    }],
    services: ["obsidian"],
    reporters: ["spec"],
    cacheDir: resolve(".obsidian-cache"),
    outputDir: resolve("e2e-results"),
    logLevel: "warn",
    injectGlobals: false,
    waitforTimeout: 10_000,
    connectionRetryCount: 0,
    mochaOpts: { ui: "bdd", timeout },
    async afterTest(test, _context, { passed }) {
      if (passed) return;
      await mkdir("e2e-results", { recursive: true });
      await browser.saveScreenshot(resolve("e2e-results", `${test.title.replace(/[^a-z0-9]+/gi, "-")}.png`));
    },
  };
}

export const config = createObsidianConfig(["./tests/e2e/**/*.e2e.ts"], "tests/e2e/vault", "1.7.4");
