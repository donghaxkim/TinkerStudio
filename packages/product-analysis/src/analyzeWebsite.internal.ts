import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Browser, LaunchOptions, Page } from "playwright";
import type { AnalyzeWebsiteOptions, ProductAnalysis } from "./types.js";

const defaultTimeoutMs = 10_000;
const maxItems = 12;

export type BrowserLauncher = (options: LaunchOptions) => Promise<Pick<Browser, "newPage" | "close">>;

function assertHttpUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return;
    }
  } catch {
    // Fall through to a consistent product-analysis validation error.
  }

  throw new Error("Website URL must be an http or https URL");
}

function cleanText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function uniqueNonEmpty(values: string[]) {
  return [...new Set(values.map(cleanText).filter((value) => value.length > 0))];
}

function uniqueBy<T>(values: T[], keyFor: (value: T) => string) {
  const seen = new Set<string>();

  return values.filter((value) => {
    const key = keyFor(value);
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

type PageAnalysisData = {
  title: string;
  headings: string[];
  paragraphs: string[];
  links: { text: string; href: string }[];
  buttons: string[];
  inputs: { label?: string; placeholder?: string; selectorHint?: string }[];
  colors: string[];
  fontFamilies: string[];
};

// tsx injects a Node-only __name helper into serialized functions; keep this browser collector static.
const collectPageAnalysis = new Function(
  "limit",
  `
    const text = (value) => (value ?? "").replace(/\\s+/g, " ").trim();
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const selectorHint = (element) => {
      const testId = element.getAttribute("data-testid");
      if (testId) {
        return "[data-testid='" + testId + "']";
      }

      const id = element.getAttribute("id");
      return id ? "#" + CSS.escape(id) : undefined;
    };

    const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
      .filter(visible)
      .map((element) => text(element.textContent))
      .filter(Boolean)
      .slice(0, limit);
    const paragraphs = Array.from(document.querySelectorAll("p, li"))
      .filter(visible)
      .map((element) => text(element.textContent))
      .filter(Boolean)
      .slice(0, limit);
    const links = Array.from(document.querySelectorAll("a[href]"))
      .filter(visible)
      .map((element) => ({ text: text(element.textContent), href: element.href }))
      .filter((link) => link.text.length > 0 && link.href.length > 0)
      .slice(0, limit);
    const buttons = Array.from(document.querySelectorAll("button, [role='button']"))
      .filter(visible)
      .map((element) => text(element.textContent) || text(element.getAttribute("aria-label")))
      .filter(Boolean)
      .slice(0, limit);
    const inputs = Array.from(document.querySelectorAll("input, textarea, select"))
      .filter(visible)
      .map((input) => {
        const id = input.id;
        const label = id ? text(document.querySelector("label[for='" + CSS.escape(id) + "']")?.textContent) : "";

        return {
          label: label || text(input.getAttribute("aria-label")),
          placeholder: text(input.getAttribute("placeholder")),
          selectorHint: selectorHint(input),
        };
      })
      .slice(0, limit);
    const sampledElements = Array.from(document.querySelectorAll("body, main, section, header, button, input, h1, h2"))
      .filter(visible)
      .slice(0, 40);
    const colors = sampledElements.flatMap((element) => {
      const style = window.getComputedStyle(element);
      return [style.color, style.backgroundColor, style.borderColor];
    });
    const fontFamilies = sampledElements.map((element) => window.getComputedStyle(element).fontFamily);

    return {
      title: document.title,
      headings,
      paragraphs,
      links,
      buttons,
      inputs,
      colors,
      fontFamilies,
    };
  `,
) as (limit: number) => PageAnalysisData;

export async function analyzeWebsiteWithBrowserLauncher(
  url: string,
  options: AnalyzeWebsiteOptions,
  launchBrowser: BrowserLauncher,
): Promise<ProductAnalysis> {
  assertHttpUrl(url);

  function throwIfAborted() {
    if (options.signal?.aborted) {
      throw new DOMException("Website analysis cancelled.", "AbortError");
    }
  }

  throwIfAborted();

  const browser = await launchBrowser({ headless: options.headless ?? true });
  let page: Page | undefined;
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  let primaryError: unknown;

  const closeActiveBrowser = () => {
    void page?.close().catch(() => undefined);
    void browser.close().catch(() => undefined);
  };

  options.signal?.addEventListener("abort", closeActiveBrowser, { once: true });

  try {
    throwIfAborted();
    page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    throwIfAborted();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    throwIfAborted();
    if (options.waitForNetworkIdle) {
      await page.waitForLoadState("networkidle", { timeout: Math.min(timeoutMs, 5000) }).catch(() => undefined);
      throwIfAborted();
    }

    const data = await page.evaluate(collectPageAnalysis, maxItems);
    throwIfAborted();

    let screenshotPath: string | undefined;
    if (options.outputDirectory) {
      await mkdir(options.outputDirectory, { recursive: true });
      throwIfAborted();
      screenshotPath = join(options.outputDirectory, options.screenshotFileName ?? "product-analysis.png");
      await page.screenshot({ path: screenshotPath, fullPage: true });
      throwIfAborted();
    }

    const links = uniqueBy(
      data.links
        .map((link) => ({ text: truncate(cleanText(link.text), 120), href: link.href }))
        .filter((link) => link.text.length > 0 && link.href.length > 0),
      (link) => `${link.text}\n${link.href}`,
    ).slice(0, maxItems);
    const inputs = uniqueBy(
      data.inputs.map((input) => ({
        ...(cleanText(input.label) ? { label: truncate(cleanText(input.label), 120) } : {}),
        ...(cleanText(input.placeholder) ? { placeholder: truncate(cleanText(input.placeholder), 120) } : {}),
        ...(cleanText(input.selectorHint) ? { selectorHint: input.selectorHint } : {}),
      })),
      (input) => `${input.label ?? ""}\n${input.placeholder ?? ""}\n${input.selectorHint ?? ""}`,
    ).slice(0, maxItems);

    return {
      url: page.url(),
      title: cleanText(data.title),
      headings: uniqueNonEmpty(data.headings).map((value) => truncate(value, 160)),
      bodySnippets: uniqueNonEmpty(data.paragraphs).map((value) => truncate(value, 220)),
      links,
      buttons: uniqueNonEmpty(data.buttons).map((value) => truncate(value, 120)),
      inputs,
      brandHints: {
        colors: uniqueNonEmpty(data.colors).filter((value) => value !== "rgba(0, 0, 0, 0)").slice(0, maxItems),
        fontFamilies: uniqueNonEmpty(data.fontFamilies).slice(0, 6),
      },
      ...(screenshotPath ? { screenshotPath } : {}),
    };
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    options.signal?.removeEventListener("abort", closeActiveBrowser);
    await page?.close().catch(() => undefined);
    try {
      await browser.close();
    } catch (cleanupError) {
      if (primaryError === undefined && !options.signal?.aborted) {
        throw cleanupError;
      }
    }
    throwIfAborted();
  }
}
