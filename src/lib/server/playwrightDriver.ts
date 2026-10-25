import type { Page } from "playwright";
import type { AgentAction, AgentTarget } from "@/lib/agent/types";
import type { BrowserDriver } from "./browserAgent";
import { ConfigError } from "./errors";

const MOCK_SITE_PATH = "/mock-social";
const VIEWPORT = { width: 1100, height: 780 };
const READY_TIMEOUT_MS = 20_000;
const MOUSE_STEPS = 28;
const AIM_PAUSE_MS = 280;
const TYPE_DELAY_MS = 55;
const SCROLL_PAUSE_MS = 650;
const SCROLL_FRACTION = 0.7;

/** Draws a purple dot that follows the mouse, so the agent's movements are visible on screen and in recordings. */
const CURSOR_SCRIPT = `
  window.addEventListener('DOMContentLoaded', () => {
    const dot = document.createElement('div');
    dot.style.cssText = 'position:fixed;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:#00897B;border:3px solid #fff;box-shadow:0 0 0 2px #2A0E3A,0 4px 12px rgba(0,0,0,.35);pointer-events:none;z-index:2147483647;transition:transform 60ms linear';
    document.documentElement.appendChild(dot);
    document.addEventListener('mousemove', (event) => { dot.style.transform = 'translate(' + event.clientX + 'px,' + event.clientY + 'px)'; }, true);
    document.addEventListener('mousedown', () => { dot.style.background = '#E63946'; }, true);
    document.addEventListener('mouseup', () => { dot.style.background = '#00897B'; }, true);
  });
`;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Builds a CSS selector for an agent id, escaping characters that would end the quoted value. */
export const agentSelector = (id: string) => `[data-agent-id="${id.replace(/["\\]/g, "\\$&")}"]:visible`;

async function loadPlaywright(): Promise<typeof import("playwright")> {
  try {
    return await import("playwright");
  } catch {
    throw new ConfigError("Playwright is not installed. Run `npm install`, then `npx playwright install chromium` once.");
  }
}

/** Glides the visible mouse to the middle of an element before the next action. */
async function aimAt(page: Page, selector: string) {
  const locator = page.locator(selector).first();
  await locator.scrollIntoViewIfNeeded({ timeout: 5000 });
  const box = await locator.boundingBox();
  if (!box) throw new Error("That control is not visible.");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: MOUSE_STEPS });
  await sleep(AIM_PAUSE_MS);
  return locator;
}

/** Opens a visible Chrome window on the mock social site and drives it with real clicks and keystrokes. */
export async function createPlaywrightDriver(baseUrl: string): Promise<BrowserDriver> {
  const { chromium } = await loadPlaywright();
  let browser;
  try {
    browser = await chromium.launch({ headless: false, args: ["--window-position=40,40", `--window-size=${VIEWPORT.width + 20},${VIEWPORT.height + 120}`] });
  } catch (error) {
    const detail = error instanceof Error ? error.message.split("\n")[0] : "unknown error";
    throw new ConfigError(`Could not open Chrome for the agent (${detail}). Run \`npx playwright install chromium\` once.`);
  }

  try {
    const context = await browser.newContext({ viewport: VIEWPORT });
    await context.addInitScript(CURSOR_SCRIPT);
    const page = await context.newPage();
    await page.goto(new URL(MOCK_SITE_PATH, baseUrl).toString(), { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => (window as unknown as { __irisReady?: boolean }).__irisReady === true, undefined, { timeout: READY_TIMEOUT_MS });

    return {
      observe: () => page.evaluate(() => (window as unknown as { __irisObserve: () => AgentTarget[] }).__irisObserve()),

      async perform(action: AgentAction) {
        switch (action.type) {
          case "click": {
            const locator = await aimAt(page, agentSelector(action.target));
            const label = (await locator.getAttribute("data-agent-label")) ?? action.target;
            await locator.click({ timeout: 5000 });
            return `Clicked "${label}".`;
          }
          case "type": {
            const locator = await aimAt(page, agentSelector(action.target));
            await locator.click({ timeout: 5000 });
            await locator.fill("");
            await locator.pressSequentially(action.text, { delay: TYPE_DELAY_MS });
            return `Typed "${action.text}".`;
          }
          case "scroll": {
            const container = page.locator("[data-agent-scroll]:visible").first();
            const box = await container.boundingBox();
            if (!box) throw new Error("There is nothing to scroll.");
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 });
            await page.mouse.wheel(0, box.height * SCROLL_FRACTION * (action.direction === "down" ? 1 : -1));
            await sleep(SCROLL_PAUSE_MS);
            return `Scrolled ${action.direction}.`;
          }
          case "done":
          case "fail":
            return action.type;
        }
      },

      close: () => browser.close(),
    };
  } catch (error) {
    await browser.close().catch(() => undefined);
    throw error;
  }
}
