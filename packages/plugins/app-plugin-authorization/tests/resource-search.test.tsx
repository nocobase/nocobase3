// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { expect, it, vi } from 'vitest';
import locales from '../client/locales/index.js';
import { PermissionSetEditor } from '../client/pages/permission-sets/editor.js';

vi.mock('../client/runtime.js', () => ({
  getAuthorizationClient: () => ({ listPermissionSets: async () => [] }),
}));

it('finds resources by translated label, original label and identifier', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const runtime = new I18nRuntime({
    applicationNamespace: 'app',
    defaultLocale: 'en-US',
    locales: ['en-US', 'zh-CN'],
  });
  runtime.registerApplicationNamespace('app', {
    'en-US': async () => ({ default: {} }),
  });
  runtime.registerNamespace('@nocobase/app-plugin-authorization', locales);
  await runtime.init('zh-CN');
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const options = {
    plugins: [],
    resourceTypes: [
      {
        value: 'page',
        label: 'Pages',
        resources: [
          {
            value: 'home-id',
            label: '首页',
            searchText: 'Home',
            actions: [{ value: 'access', label: 'Access' }],
          },
        ],
        actions: [{ value: 'access', label: 'Access' }],
      },
    ],
    subjectTypes: [],
    collections: [],
    recordAccessPolicies: [],
  };
  try {
    await act(() =>
      root.render(
        <I18nProvider runtime={runtime}>
          <PermissionSetEditor
            options={options}
            embedded
            draft={{
              originalKey: 'test',
              key: 'test',
              title: 'Test',
              grants: [],
            }}
            busy={false}
            onChange={() => {}}
            onSave={() => {}}
            onClose={() => {}}
          />
        </I18nProvider>,
      ),
    );
    const input = container.querySelector<HTMLInputElement>(
      'input[placeholder="搜索资源"]',
    )!;
    expect(input).not.toBeNull();
    for (const query of ['首页', 'Home', 'home-id']) {
      await act(() => {
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value',
        )!.set!.call(input, query);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      expect(container.textContent).toContain('首页');
    }
  } finally {
    await act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
