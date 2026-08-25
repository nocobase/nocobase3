import { describe, expect, it } from 'vitest';

import { Button, Input, Label, Loading } from '../src/index.js';

describe('@nocobase/ui public API', () => {
  it('provides a default implementation for every stable primitive', () => {
    expect(Button).toBeTypeOf('function');
    expect(Input).toBeTypeOf('function');
    expect(Label).toBeTypeOf('function');
    expect(Loading).toBeTypeOf('function');
  });
});
