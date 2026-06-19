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
  signal?: AbortSignal;
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

export type AnalyzeRepoFetch = (
  repoUrl: string,
  checkoutDirectory: string,
  options: { signal?: AbortSignal },
) => Promise<AnalyzeRepoFetchResult>;

export type AnalyzeRepoOpencodeRun = (prompt: string, options: { cwd: string; signal?: AbortSignal }) => Promise<string>;

export type AnalyzeRepoOptions = {
  checkoutDirectory: string;
  signal?: AbortSignal;
  fetchRepo?: AnalyzeRepoFetch;
  runOpencode?: AnalyzeRepoOpencodeRun;
};

export type NarrativeWorkflowCandidate = {
  name: string;
  whyItMatters: string;
  routeHints: string[];
  visibleEvidence: string[];
  storyboardUse: "hook" | "main-demo" | "proof" | "cta";
};

export type NarrativeExploration = {
  productSummary: string;
  bestDemoAngle: string;
  userProblem: string;
  promisedOutcome: string;
  workflowCandidates: NarrativeWorkflowCandidate[];
  strongestCopy: string[];
  avoidNarratives: string[];
  explorationNotes: string[];
};

export type NarrativeStagehandObserveInput = {
  instruction: string;
  drawOverlay?: boolean;
  iframes?: boolean;
};

export type NarrativeStagehandExtractInput<T> = {
  instruction: string;
  schema: unknown;
  domSettleTimeoutMs?: number;
  iframes?: boolean;
};

export type NarrativeStagehandPage = {
  goto: (url: string, options?: { waitUntil?: "domcontentloaded" | "load" | "networkidle"; timeout?: number }) => Promise<unknown>;
};

export type NarrativeStagehandClient = {
  init: () => Promise<void>;
  close: () => Promise<void>;
  page?: NarrativeStagehandPage;
  context?: { pages: () => NarrativeStagehandPage[] };
  observe: (instruction: string, options?: { page?: NarrativeStagehandPage; timeout?: number }) => Promise<unknown>;
  extract: <T>(
    instruction: string,
    schema: unknown,
    options?: { page?: NarrativeStagehandPage; timeout?: number },
  ) => Promise<T>;
};

export type CreateNarrativeStagehand = () => NarrativeStagehandClient;

export type ExploreNarrativeWebsiteOptions = {
  enabled?: boolean;
  prompt?: string;
  productAnalysis?: ProductAnalysis;
  repoAnalysis?: RepoAnalysis;
  timeoutMs?: number;
  signal?: AbortSignal;
  createStagehand?: CreateNarrativeStagehand;
};
