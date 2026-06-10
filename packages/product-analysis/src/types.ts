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
  waitForNetworkIdle?: boolean;
};

export type RepoAnalysisSourceHint = {
  path: string;
  reason: string;
};

export type RepoAnalysis = {
  repoUrl: string;
  commit?: string;
  productName?: string;
  summary: string;
  features: string[];
  likelyRoutes: string[];
  demoIdeas: string[];
  importantTerms: string[];
  setupNotes: string[];
  sourceHints: RepoAnalysisSourceHint[];
};

export type AnalyzeRepoFetchResult = {
  commit?: string;
};

export type AnalyzeRepoFetch = (repoUrl: string, checkoutDirectory: string) => Promise<AnalyzeRepoFetchResult>;

export type AnalyzeRepoOptions = {
  checkoutDirectory: string;
  fetchRepo?: AnalyzeRepoFetch;
  maxFiles?: number;
  maxTotalBytes?: number;
  maxFileBytes?: number;
};
