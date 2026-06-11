export function usableSelector(selector: string | undefined) {
  const trimmed = selector?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}

type LocatorTarget = { kind: "selector"; selector: string } | { kind: "text"; text: string };

export function locatorTarget(step: { selector?: string; text?: string }): LocatorTarget {
  const selector = usableSelector(step.selector);
  return selector === undefined ? { kind: "text", text: step.text ?? "" } : { kind: "selector", selector };
}

export function checkpointTarget(checkpoint: { selector?: string; text?: string }): LocatorTarget {
  const selector = checkpoint.selector?.trim();
  return selector ? { kind: "selector", selector } : { kind: "text", text: checkpoint.text ?? "" };
}

function withoutWww(hostname: string) {
  return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
}

export function isAllowedCaptureUrl(candidateUrl: string, targetUrl: string) {
  let candidate: URL;
  let target: URL;

  try {
    candidate = new URL(candidateUrl);
    target = new URL(targetUrl);
  } catch {
    return false;
  }

  return (
    candidate.protocol === target.protocol &&
    candidate.port === target.port &&
    withoutWww(candidate.hostname) === withoutWww(target.hostname)
  );
}

type DocumentElementMetrics = {
  scrollWidth: number;
  clientWidth: number;
  offsetWidth: number;
  scrollHeight: number;
  clientHeight: number;
  offsetHeight: number;
};

export function fullPageDocumentDimensions() {
  const browserDocument = (globalThis as unknown as {
    document: { documentElement: DocumentElementMetrics; body: DocumentElementMetrics | null };
  }).document;
  const documentElement = browserDocument.documentElement;
  const body = browserDocument.body;

  return {
    width: Math.max(
      documentElement.scrollWidth,
      documentElement.clientWidth,
      documentElement.offsetWidth,
      body?.scrollWidth ?? 0,
      body?.clientWidth ?? 0,
      body?.offsetWidth ?? 0,
    ),
    height: Math.max(
      documentElement.scrollHeight,
      documentElement.clientHeight,
      documentElement.offsetHeight,
      body?.scrollHeight ?? 0,
      body?.clientHeight ?? 0,
      body?.offsetHeight ?? 0,
    ),
  };
}
