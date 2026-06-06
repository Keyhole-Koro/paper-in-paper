// jsdom lacks the layout-observer APIs the canvas uses (ResizeObserver via
// useRoomSize, IntersectionObserver in some paths). Provide inert stubs so
// components mount; tests assert rendered output, not observed sizes.
class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = NoopObserver as unknown as typeof ResizeObserver;
}
if (typeof globalThis.IntersectionObserver === 'undefined') {
  globalThis.IntersectionObserver = NoopObserver as unknown as typeof IntersectionObserver;
}
