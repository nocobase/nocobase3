// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { isAgentAnnotationsEnabled } from '../../scripts/agent-annotations.ts';

describe('Agent Annotations configuration', () => {
  it.each([undefined, '', '   ', 'true', '1', 'yes', 'on', 'unexpected'])(
    'enables Agent Annotations for %j',
    (value) => {
      expect(isAgentAnnotationsEnabled(value)).toBe(true);
    },
  );

  it.each(['false', '0', 'no', 'off', ' FALSE ', 'Off'])(
    'disables Agent Annotations for %j',
    (value) => {
      expect(isAgentAnnotationsEnabled(value)).toBe(false);
    },
  );
});
