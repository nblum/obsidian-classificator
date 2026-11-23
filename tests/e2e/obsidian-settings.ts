import { $, browser } from "@wdio/globals";

export async function openSettings(): Promise<string> {
  const mainWindow = await browser.getWindowHandle();
  const tab = $(".vertical-tab-nav-item=Classificator");
  await browser.executeObsidianCommand("app:open-settings");
  await browser.waitUntil(async () => {
    const popup = (await browser.getWindowHandles()).find((handle) => handle !== mainWindow);
    if (popup && await browser.getWindowHandle() !== popup) await browser.switchToWindow(popup);
    return tab.isDisplayed();
  });
  await tab.click();
  return mainWindow;
}

export async function closeSettings(mainWindow: string): Promise<void> {
  if (await browser.getWindowHandle() === mainWindow) {
    await browser.keys("Escape");
  } else {
    await browser.closeWindow();
    await browser.switchToWindow(mainWindow);
  }
}
