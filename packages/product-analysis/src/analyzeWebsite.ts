import { chromium } from "playwright";
import type { AnalyzeWebsiteOptions, ProductAnalysis } from "./types.js";
import { analyzeWebsiteWithBrowserLauncher } from "./analyzeWebsite.internal.js";

export async function analyzeWebsite(url: string, options: AnalyzeWebsiteOptions = {}): Promise<ProductAnalysis> {
  return analyzeWebsiteWithBrowserLauncher(url, options, (launchOptions) => chromium.launch(launchOptions));
}
