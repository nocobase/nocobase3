import { JSDOM } from 'jsdom';

// Keep Node's URL/Request/Response for the real server while rendering in a DOM.
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost',
  pretendToBeVisual: true,
});
for (const key of [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'Element',
  'Node',
  'Document',
  'DocumentFragment',
  'MutationObserver',
  'HTMLInputElement',
  'HTMLButtonElement',
  'HTMLFormElement',
  'Event',
  'MouseEvent',
  'KeyboardEvent',
  'FocusEvent',
  'FormData',
  'getComputedStyle',
  'localStorage',
  'requestAnimationFrame',
  'cancelAnimationFrame',
]) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: Reflect.get(dom.window, key),
  });
}
