const lastLogByKey = new Map<string, string>();

export function debugLog(event: string, payload: Record<string, unknown>) {
  if (typeof window === 'undefined') {
    return;
  }

  if (event.endsWith('-move')) {
    if ((window as typeof window & { __PAPER_DEBUG_VERBOSE?: boolean }).__PAPER_DEBUG_VERBOSE !== true) {
      return;
    }

    const key = `${event}:${String(payload.paperId ?? 'unknown')}`;
    const next = JSON.stringify(payload);
    if (lastLogByKey.get(key) === next) {
      return;
    }
    lastLogByKey.set(key, next);
  }

  console.log(`[paper-debug] ${event}`, payload);
}
