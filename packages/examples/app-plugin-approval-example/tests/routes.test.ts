// @vitest-environment node
// The HTTP boundary, against the real service on SQLite: a signed-in user is
// required, every request names an active persona, refusals keep their
// codes, and a request goes from a form to a decision through the routes.
import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';
import { createAppPaths } from '@nocobase/app-server/config';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Overview, RecordDetail } from '../shared/types.js';
import { apiRoutes } from '../server/routes/index.js';
import { approvalExampleServiceToken } from '../server/tokens.js';
import { createTestLab, type TestLab } from './support/lab.js';

const allow = {
  required: () => async (context, next) => {
    context.set('auth', { user: { id: 'user-1' } });
    await next();
  },
} as unknown as Auth;
const deny = {
  required: () => (context) => context.json({ code: 'UNAUTHORIZED' }, 401),
} as unknown as Auth;

let test: TestLab;

beforeEach(async () => {
  test = await createTestLab();
});

afterEach(() => test.destroy());

function router(authentication: Auth = allow) {
  const container = new ServiceContainer();
  container.instance(authenticationToken, authentication);
  container.instance(approvalExampleServiceToken, test.lab);
  const app: AppPluginApplication = {
    appName: 'main',
    publicBasePath: '',
    config: {} as never,
    paths: createAppPaths({ rootDir: '/missing' }),
    router: new Hono(),
    container,
  };
  return apiRoutes.createRouter(app);
}

function post(path: string, body: unknown = {}): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('approval example routes', () => {
  it('requires a signed-in user and an active persona', async () => {
    expect(
      (
        await (
          await router(deny)
        ).request('/approval-example/overview?actAs=zhang')
      ).status,
    ).toBe(401);
    const routes = await router();
    expect((await routes.request('/approval-example/overview')).status).toBe(
      400,
    );
    expect(
      (await routes.request('/approval-example/overview?actAs=nobody')).status,
    ).toBe(400);
  });

  it('takes a request from its form to its decision', async () => {
    const routes = await router();
    const preview = await routes.request(
      post('/approval-example/preview/leave?actAs=zhang', {
        days: 2,
        reason: 'Family',
      }),
    );
    expect(await preview.json()).toMatchObject({
      mode: 'stages',
      steps: [
        { key: 'manager', people: ['li'] },
        { included: false },
        { included: false },
      ],
    });
    const created = (await (
      await routes.request(
        post('/approval-example/requests/leave?actAs=zhang', {
          days: 2,
          reason: 'Family',
        }),
      )
    ).json()) as { lifecycle: string; id: string };
    expect(created).toMatchObject({
      lifecycle: 'scenarioLeaves',
      status: 'draft',
    });
    // Starting it is the lifecycle's own route.
    const fired = await routes.request(
      post(
        `/approval-example/lifecycles/scenarioLeaves/${created.id}/fire?actAs=zhang`,
        { transition: 'submit', input: {} },
      ),
    );
    expect(fired.status).toBe(200);
    const overview = (await (
      await routes.request('/approval-example/overview?actAs=li')
    ).json()) as Overview;
    const [item] = overview.inbox.filter((each) => each.box === 'toDo');
    expect(item).toMatchObject({ recordId: created.id, action: 'respond' });
    const detail = (await (
      await routes.request(
        `/approval-example/records/scenarioLeaves/${created.id}?actAs=li`,
      )
    ).json()) as RecordDetail;
    expect(detail.actions[0]?.actions).toContain('respond');
    // Someone else's task is refused with the approval layer's code.
    const refused = await routes.request(
      post(`/approval-example/tasks/${item.taskId}/respond?actAs=wang`, {
        answer: 'approve',
      }),
    );
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ code: 'NOT_ASSIGNEE' });
    const answered = await routes.request(
      post(`/approval-example/tasks/${item.taskId}/respond?actAs=li`, {
        answer: 'approve',
      }),
    );
    expect(answered.status).toBe(200);
    expect(
      (
        (await (
          await routes.request(
            `/approval-example/records/scenarioLeaves/${created.id}?actAs=zhang`,
          )
        ).json()) as RecordDetail
      ).state,
    ).toBe('approved');
  });

  it('refuses a transition only the approval fires, and an unknown action', async () => {
    const routes = await router();
    const created = await test.lab.create(
      'leave',
      { days: 2, reason: 'x' },
      'zhang',
    );
    await test.lab.runtime.fire(
      'scenarioLeaves',
      Number(created.id),
      'submit',
      {
        actor: { id: 'zhang' },
      },
    );
    const approve = await routes.request(
      post(
        `/approval-example/lifecycles/scenarioLeaves/${created.id}/fire?actAs=li`,
        { transition: 'approve', input: {} },
      ),
    );
    expect(await approve.json()).toMatchObject({ code: 'NOT_MANUAL' });
    expect(
      (
        await routes.request(
          post('/approval-example/tasks/1/vote?actAs=li', {}),
        )
      ).status,
    ).toBe(404);
  });

  it('keeps the administration to the administrator', async () => {
    const routes = await router();
    const put = (actAs: string) =>
      routes.request(
        new Request(
          `http://localhost/approval-example/settings?actAs=${actAs}`,
          {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ruleVersion: 2 }),
          },
        ),
      );
    expect((await put('zhang')).status).toBe(403);
    expect((await put('admin')).status).toBe(204);
    expect(
      (
        await routes.request(
          post('/approval-example/events/orderReady/1?actAs=zhang'),
        )
      ).status,
    ).toBe(403);
    expect(
      (await routes.request(post('/approval-example/samples?actAs=admin')))
        .status,
    ).toBe(200);
  });
});
