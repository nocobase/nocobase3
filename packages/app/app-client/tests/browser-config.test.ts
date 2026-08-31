import { describe, expect, it } from 'vitest';

import { readAppClientRuntimeConfig } from '../src/runtime/browser-config.js';

describe('browser runtime config', () => {
  it('reads the versioned JSON data block', () => {
    document.body.innerHTML = `
      <script id="nocobase-runtime-config" type="application/json">
        {"version":1,"config":{"app":{"title":"NocoBase"}}}
      </script>
    `;

    expect(readAppClientRuntimeConfig()).toEqual({
      app: { title: 'NocoBase' },
    });
  });

  it('returns an empty config when the host does not provide a data block', () => {
    document.body.innerHTML = '';
    expect(readAppClientRuntimeConfig()).toEqual({});
  });

  it('rejects malformed and unsupported payloads', () => {
    document.body.innerHTML = `
      <script id="nocobase-runtime-config" type="application/json">invalid</script>
    `;
    expect(() => readAppClientRuntimeConfig()).toThrow('invalid JSON');

    document.body.innerHTML = `
      <script id="nocobase-runtime-config" type="application/json">
        {"version":2,"config":{}}
      </script>
    `;
    expect(() => readAppClientRuntimeConfig()).toThrow('must use version 1');
  });
});
