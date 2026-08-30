import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  I18nProvider,
  NamespaceScope,
  withNamespace,
} from '../../src/client/index.js';
import { APP_NS, I18nRuntime } from '../../src/core/index.js';

const APP = '@acme/app';
const PLUGIN = '@acme/plugin';

async function createRuntime(): Promise<I18nRuntime> {
  const runtime = new I18nRuntime({
    defaultLocale: 'en-US',
    locales: ['en-US', 'zh-CN'],
    applicationNamespace: APP,
  });
  runtime.registerApplicationNamespace(APP, {
    'en-US': () =>
      Promise.resolve({ default: { save: 'Save', title: 'App title' } }),
    'zh-CN': () =>
      Promise.resolve({ default: { save: '保存', title: '应用标题' } }),
  });
  runtime.registerNamespace(PLUGIN, {
    'en-US': () => Promise.resolve({ default: { title: 'Plugin title' } }),
    'zh-CN': () => Promise.resolve({ default: { title: '插件标题' } }),
  });
  await runtime.init('en-US');
  return runtime;
}

/** Reads whatever namespace is in scope, the way a plugin page does. */
function ScopedTitle(): ReactElement {
  const { t } = useTranslation();
  return <span data-testid='title'>{t('title')}</span>;
}

function ScopedSave(): ReactElement {
  const { t } = useTranslation();
  return <span data-testid='save'>{t('save')}</span>;
}

let runtime: I18nRuntime;

beforeEach(async () => {
  runtime = await createRuntime();
});

describe('NamespaceScope', () => {
  it('makes the scoped namespace the default for a bare useTranslation', () => {
    render(
      <I18nProvider runtime={runtime}>
        <NamespaceScope ns={PLUGIN}>
          <ScopedTitle />
        </NamespaceScope>
      </I18nProvider>,
    );

    expect(screen.getByTestId('title')).toHaveTextContent('Plugin title');
  });

  it('falls back to the application namespace for a key the plugin lacks', () => {
    render(
      <I18nProvider runtime={runtime}>
        <NamespaceScope ns={PLUGIN}>
          <ScopedSave />
        </NamespaceScope>
      </I18nProvider>,
    );

    // The plugin never defines 'save'; the chain reaches the application.
    expect(screen.getByTestId('save')).toHaveTextContent('Save');
  });

  it('scopes by render tree, so a nested scope wins', () => {
    render(
      <I18nProvider runtime={runtime}>
        <NamespaceScope ns={APP}>
          <NamespaceScope ns={PLUGIN}>
            <ScopedTitle />
          </NamespaceScope>
        </NamespaceScope>
      </I18nProvider>,
    );

    expect(screen.getByTestId('title')).toHaveTextContent('Plugin title');
  });

  it('gives a plugin component rendered outside its scope the surrounding namespace', () => {
    render(
      <I18nProvider runtime={runtime}>
        <NamespaceScope ns={APP}>
          <ScopedTitle />
        </NamespaceScope>
      </I18nProvider>,
    );

    // This is the documented trap: the scope follows the tree, not code ownership.
    expect(screen.getByTestId('title')).toHaveTextContent('App title');
  });

  it('resolves APP_NS to the application namespace', () => {
    render(
      <I18nProvider runtime={runtime}>
        <NamespaceScope ns={APP_NS}>
          <ScopedTitle />
        </NamespaceScope>
      </I18nProvider>,
    );

    expect(screen.getByTestId('title')).toHaveTextContent('App title');
  });
});

describe('withNamespace', () => {
  it('binds a component to its namespace wherever it is rendered', () => {
    const Bound = withNamespace(PLUGIN, ScopedTitle);

    render(
      <I18nProvider runtime={runtime}>
        <NamespaceScope ns={APP}>
          <Bound />
        </NamespaceScope>
      </I18nProvider>,
    );

    // This is the fix for the trap above.
    expect(screen.getByTestId('title')).toHaveTextContent('Plugin title');
  });
});
