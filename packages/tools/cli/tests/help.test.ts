import { describe, expect, it } from 'vitest';
import { isTopicIndexCommand } from '../src/help/runtime-help.ts';

const topics = [
  { name: 'app' },
  { name: 'app:create' },
  { name: 'hub' },
  { name: 'hub:start' },
];

describe('isTopicIndexCommand', () => {
  it('recognises a command that only stands for a topic', () => {
    expect(isTopicIndexCommand('app', topics)).toBe(true);
    expect(isTopicIndexCommand('hub', topics)).toBe(true);
  });

  it('leaves real commands alone', () => {
    expect(isTopicIndexCommand('app:create', topics)).toBe(false);
    expect(isTopicIndexCommand('hub:start', topics)).toBe(false);
  });

  it('does not treat a shared name prefix as a topic', () => {
    expect(isTopicIndexCommand('ap', topics)).toBe(false);
  });

  it('ignores an empty id', () => {
    expect(isTopicIndexCommand('', topics)).toBe(false);
  });
});
