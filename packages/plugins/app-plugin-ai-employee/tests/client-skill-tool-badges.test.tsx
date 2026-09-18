// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SkillToolBadges } from '../client/components/skill-tool-badges.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('reserves counter space, responds to container resizing and disconnects on unmount', () => {
  let width = 130;
  let resize: (() => void) | undefined;
  const disconnect = vi.fn();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect = disconnect;
    },
  );
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      const measured = this.classList.contains('relative')
        ? width
        : this.textContent?.startsWith('+')
          ? 30
          : 60;
      return {
        width: measured,
        height: 20,
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: measured,
        bottom: 20,
        toJSON: () => ({}),
      };
    },
  );
  const tools = ['one', 'two', 'three'].map((name) => ({
    name,
    title: name,
    description: '',
    about: '',
    available: true,
  }));
  const view = render(<SkillToolBadges tools={tools} />);
  const labels = () =>
    Array.from(view.container.querySelectorAll('[data-slot="badge"]'))
      .filter((badge) => !badge.closest('[aria-hidden="true"]'))
      .map((badge) => badge.textContent);
  expect(labels()).toEqual(['one', '+2']);
  act(() => {
    width = 240;
    resize?.();
  });
  expect(labels()).toEqual(['one', 'three', 'two']);
  act(() => {
    width = 40;
    resize?.();
  });
  expect(labels()).toEqual(['+3']);
  view.rerender(<SkillToolBadges tools={tools.slice(0, 1)} />);
  expect(labels()).toEqual(['+1']);
  act(() => {
    width = 100;
    resize?.();
  });
  expect(labels()).toEqual(['one']);
  view.unmount();
  expect(disconnect).toHaveBeenCalled();
});
