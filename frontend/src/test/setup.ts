import '@testing-library/jest-dom/vitest'

// Polyfill missing DOM APIs for jsdom — required by Radix UI primitives
// (Select, Dialog, etc.) which call hasPointerCapture / setPointerCapture on
// synthetic pointer events, and scrollIntoView on content mount.
// jsdom 29 does not implement these on HTMLElement.
if (typeof window !== 'undefined') {
  if (!window.Element.prototype.hasPointerCapture) {
    window.Element.prototype.hasPointerCapture = () => false
    window.Element.prototype.setPointerCapture = () => undefined
    window.Element.prototype.releasePointerCapture = () => undefined
  }
  if (!window.Element.prototype.scrollIntoView) {
    window.Element.prototype.scrollIntoView = () => undefined
  }
  // Polyfill ResizeObserver — used by Radix ScrollArea but absent in jsdom
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
}
