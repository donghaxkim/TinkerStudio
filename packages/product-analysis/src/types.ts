export type ProductAnalysisLink = {
  text: string;
  href: string;
};

export type ProductAnalysisInput = {
  label?: string;
  placeholder?: string;
  selectorHint?: string;
};

export type ProductAnalysis = {
  url: string;
  title: string;
  headings: string[];
  bodySnippets: string[];
  links: ProductAnalysisLink[];
  buttons: string[];
  inputs: ProductAnalysisInput[];
  brandHints: {
    colors: string[];
    fontFamilies: string[];
  };
  screenshotPath?: string;
};

export type AnalyzeWebsiteOptions = {
  outputDirectory?: string;
  screenshotFileName?: string;
  timeoutMs?: number;
  headless?: boolean;
};
