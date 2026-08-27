import { useGo } from '@refinedev/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  AppClientRoot,
  defineAppClient,
  normalizeAppClientBasename,
  useAppClient,
} from '../src/index.js';
import { createAppClient } from '@nocobase/app-sdk';

function RouterConsumer(): ReactElement {
  const go = useGo();
  return <button onClick={() => go({ to: '/configured' })}>Navigate</button>;
}

function ClientConsumer(): ReactElement {
  const client = useAppClient();
  return <span>{client.realtime ? 'realtime' : 'missing'}</span>;
}

describe('app client', () => {
  it('normalizes router basenames', () => {
    expect(normalizeAppClientBasename(undefined)).toBeUndefined();
    expect(normalizeAppClientBasename('/')).toBeUndefined();
    expect(normalizeAppClientBasename('/portal/')).toBe('/portal');
  });

  it('preserves the explicit application configuration', () => {
    const config = defineAppClient({
      basename: '/portal/',
      routes: 'Application content',
    });

    expect(config).toMatchObject({
      basename: '/portal/',
      routes: 'Application content',
    });
  });

  it('uses a configured Refine router provider instead of the default', () => {
    const go = vi.fn();

    render(
      <AppClientRoot
        config={{
          refine: {
            routerProvider: {
              go: () => go,
            },
          },
          routes: <RouterConsumer />,
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Navigate' }));

    expect(go).toHaveBeenCalledExactlyOnceWith({ to: '/configured' });
  });

  it('uses configured Refine children instead of the default routes', () => {
    render(
      <AppClientRoot
        config={{
          refine: {
            children: 'Configured Refine content',
            routerProvider: {},
          },
          routes: 'Default application routes',
        }}
      />,
    );

    expect(screen.getByText('Configured Refine content')).toBeInTheDocument();
    expect(
      screen.queryByText('Default application routes'),
    ).not.toBeInTheDocument();
  });

  it('provides the configured app client to plugin providers', () => {
    const client = createAppClient({ fetch: vi.fn() });

    render(
      <AppClientRoot
        config={{
          client,
          refine: { routerProvider: {} },
          routes: <ClientConsumer />,
        }}
      />,
    );

    expect(screen.getByText('realtime')).toBeInTheDocument();
  });
});
