import {
  ClientApplication,
  useApiClient,
  useService,
  useToaster,
} from '@nocobase/app-client';
import { defineClientPlugin } from '@nocobase/app-client/plugins';
import { useTranslation } from '@nocobase/i18n/client';
import {
  createServiceToken,
  ServiceProvider,
} from '@nocobase/service-provider';
// The shared React setup installs these matchers at run time; importing them here types them for `pnpm typecheck`.
import '@testing-library/jest-dom/vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { useEffect, useState, type ReactElement } from 'react';
import { useLocation } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { answerApi, renderWithApp } from '../../src/client/index.js';

interface Greeter {
  greet(name: string): string;
}

const greeterToken = createServiceToken<Greeter>('@example/plugin/greeter');

class GreeterProvider extends ServiceProvider<ClientApplication> {
  public readonly name: string = '@example/plugin/greeter';

  public override register(): void {
    this.app.container.instance(greeterToken, {
      greet: (name) => `Hello, ${name}`,
    });
  }
}

const examplePlugin = defineClientPlugin({
  packageName: '@example/plugin',
  serviceProviders: [GreeterProvider],
  locales: {
    'en-US': () => Promise.resolve({ title: 'Orders', saved: 'Saved' }),
  },
});

/** Loads `orders` through the API client, as a plugin page does. */
function OrdersPage(): ReactElement {
  const api = useApiClient();
  const { t } = useTranslation();
  const toaster = useToaster();
  const location = useLocation();
  const [names, setNames] = useState<readonly string[]>([]);
  useEffect(() => {
    void api
      .request<{ data: { name: string }[] }>({ path: 'orders' })
      .then((body) => setNames(body.data.map((order) => order.name)));
  }, [api]);
  return (
    <main>
      <h1>{t('title')}</h1>
      <p>{location.pathname}</p>
      <ul>
        {names.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
      <button
        type='button'
        onClick={() => toaster.show({ type: 'success', title: t('saved') })}
      >
        Save
      </button>
    </main>
  );
}

function GreetingPage(): ReactElement {
  return <p>{useService(greeterToken).greet('Ada')}</p>;
}

describe('renderWithApp', () => {
  it('renders a page in a client application, with its translations, router, API client and toaster', async () => {
    const fetch = vi.fn((request: Request) =>
      Response.json({ data: [{ name: `${request.method} ${request.url}` }] }),
    );

    const view = await renderWithApp(<OrdersPage />, {
      plugins: [examplePlugin()],
      namespace: '@example/plugin',
      route: '/orders',
      fetch,
    });

    expect(screen.getByRole('heading', { name: 'Orders' })).toBeInTheDocument();
    expect(screen.getByText('/orders')).toBeInTheDocument();
    expect(
      await screen.findByText('GET http://localhost/api/orders'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      screen.getByText('Saved').closest('[data-toast-type]'),
    ).toHaveAttribute('data-toast-type', 'success');
    expect(view.toasts()).toMatchObject([{ type: 'success', title: 'Saved' }]);
    expect(view.app).toBeInstanceOf(ClientApplication);
  });

  it('runs the services the plugins register', async () => {
    await renderWithApp(<GreetingPage />, { plugins: [examplePlugin()] });

    expect(screen.getByText('Hello, Ada')).toBeInTheDocument();
  });

  it('takes a stand-in for a service in place of the plugin that provides it', async () => {
    await renderWithApp(<GreetingPage />, {
      services: (app) =>
        app.container.instance(greeterToken, {
          greet: (name) => `Stand-in greets ${name}`,
        }),
    });

    expect(screen.getByText('Stand-in greets Ada')).toBeInTheDocument();
  });

  it('sends requests to a server in process, under its base path, with the session cookie', async () => {
    const requests: { url: string; cookie: string | null }[] = [];
    const server = {
      publicBasePath: '/main',
      fetch: (request: Request): Response => {
        requests.push({
          url: request.url,
          cookie: request.headers.get('cookie'),
        });
        return Response.json({ data: [{ name: 'From the server' }] });
      },
    };

    await renderWithApp(<OrdersPage />, {
      plugins: [examplePlugin()],
      namespace: '@example/plugin',
      server,
      cookie: 'session=abc',
    });

    expect(await screen.findByText('From the server')).toBeInTheDocument();
    expect(requests).toEqual([
      { url: 'http://localhost/main/api/orders', cookie: 'session=abc' },
    ]);
  });

  it('fails a request nothing answers instead of sending it anywhere', async () => {
    const errors: unknown[] = [];
    function Probe(): ReactElement {
      const api = useApiClient();
      useEffect(() => {
        api.request({ path: 'orders' }).catch((error: unknown) => {
          errors.push(error);
        });
      }, [api]);
      return <p>Probe</p>;
    }

    await renderWithApp(<Probe />);

    await waitFor(() => expect(errors).toHaveLength(1));
    expect(String(errors[0])).toContain(
      'Nothing answers GET http://localhost/api/orders',
    );
  });

  it('answers the API from calls rather than responses, and fails a call whose handler throws', async () => {
    const api = vi.fn((call: { path: string }) => {
      if (call.path === 'orders') return { data: [{ name: 'Answered' }] };
      throw new Error('No such route');
    });
    const errors: unknown[] = [];
    function Probe(): ReactElement {
      const client = useApiClient();
      useEffect(() => {
        void client
          .request({
            path: 'orders/export',
            method: 'POST',
            query: { format: 'csv', ids: [1, 2] },
            json: { all: true },
          })
          .catch((error: unknown) => {
            errors.push(error);
          });
      }, [client]);
      return <OrdersPage />;
    }

    await renderWithApp(<Probe />, {
      plugins: [examplePlugin()],
      namespace: '@example/plugin',
      fetch: answerApi(api),
    });

    expect(await screen.findByText('Answered')).toBeInTheDocument();
    await waitFor(() => expect(errors).toHaveLength(1));
    expect(String(errors[0])).toContain('No such route');
    expect(api).toHaveBeenCalledWith({
      method: 'POST',
      path: 'orders/export',
      query: { format: 'csv', ids: ['1', '2'] },
      json: { all: true },
    });
    expect(api).toHaveBeenCalledWith({ method: 'GET', path: 'orders' });
  });
});
