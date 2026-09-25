// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DEMO_PASSWORD } from '../database/seed-data/organization.js';
import {
  createTestApp,
  readSales,
  SALES_SETS,
  type TestApp,
} from './helpers.js';

const email = (name: string): string => `${name}@departments.example`;
const ACCOUNTS = [
  'grace',
  'leo',
  'nina',
  'chen',
  'eric',
  'mia',
  'sophia',
  'owen',
] as const;

/**
 * The seeded accounts against the authorization example's own sales and delivery lists. The company-wide
 * confidentiality restriction on the root department hides confidential project-4 and its quotes and orders.
 */
describe('the seeded demo accounts', () => {
  let test: TestApp;
  const cookies: Record<string, string> = {};

  beforeAll(async () => {
    test = await createTestApp();
    for (const name of ACCOUNTS)
      cookies[name] = await test.signIn(email(name), DEMO_PASSWORD);
  }, 60_000);

  afterAll(async () => {
    await test.close();
  });

  const read = (name: string, list?: 'projects' | 'quotes' | 'orders') =>
    readSales(test, cookies[name] ?? '', list);

  it('a North engineer sees North projects and orders, and none of the South ones', async () => {
    expect(await read('leo')).toEqual({
      status: 200,
      ids: ['project-1', 'project-2'],
    });
    expect(await read('leo', 'orders')).toEqual({
      status: 200,
      ids: ['order-1', 'order-2'],
    });
    // The engineer set reads every quote; the restriction still hides the confidential project's.
    const quotes = await read('leo', 'quotes');
    expect(quotes.ids).toContain('quote-3');
    expect(quotes.ids).not.toContain('quote-4');
  });

  it('a South engineer sees the South project and order only', async () => {
    expect(await read('eric')).toEqual({ status: 200, ids: ['project-3'] });
    expect(await read('eric', 'orders')).toEqual({
      status: 200,
      ids: ['order-3'],
    });
  });

  it('a sales assistant opens the pages through Sales Center, reads her North colleagues’ projects and her region’s orders', async () => {
    // North Sales' project viewer set: projects owned by North Sales members, and no South one.
    expect(await read('nina')).toEqual({
      status: 200,
      ids: ['project-1', 'project-2'],
    });
    expect(await read('nina', 'quotes')).toEqual({ status: 200, ids: [] });
    expect(await read('nina', 'orders')).toEqual({
      status: 200,
      ids: ['order-1', 'order-2'],
    });
  });

  it('Chen holds South sales access and delivery access at once', async () => {
    // Delivery's sharing rule shows him Sales Center's projects.
    expect(await read('chen')).toEqual({
      status: 200,
      ids: ['project-1', 'project-2', 'project-3'],
    });
    // Delivery's set, scoped to his South region by the sharing rule: he may deliver order-3.
    const response = await test.request(
      'GET',
      '/api/authorization-example/sales/orders',
      { cookie: cookies.chen ?? '' },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { items: { id: string; operations: { deliver: string } }[] };
    };
    expect(
      body.data.items.map((item) => [item.id, item.operations.deliver]),
    ).toEqual([['order-3', 'allowed']]);
    // Nina reads the same kind of list without the delivery set.
    const nina = await test.request(
      'GET',
      '/api/authorization-example/sales/orders',
      { cookie: cookies.nina ?? '' },
    );
    const ninaBody = (await nina.json()) as {
      data: { items: { operations: { deliver: string } }[] };
    };
    expect(
      ninaBody.data.items.every(
        (item) => item.operations.deliver !== 'allowed',
      ),
    ).toBe(true);
  });

  it('a delivery specialist without a region reads Sales Center projects through sharing and no orders yet', async () => {
    expect(await read('mia')).toEqual({
      status: 200,
      ids: ['project-1', 'project-2', 'project-3'],
    });
    expect((await read('mia', 'quotes')).status).toBe(403);
    expect(await read('mia', 'orders')).toEqual({ status: 200, ids: [] });

    // Giving Delivery a region is an organisation change the sync carries into the sales data scope.
    await test.organization.updateDepartment('delivery', { region: 'North' });
    try {
      expect(await read('mia', 'orders')).toEqual({
        status: 200,
        ids: ['order-1', 'order-2'],
      });
      // Chen's primary department still decides his region.
      expect(await read('chen', 'orders')).toEqual({
        status: 200,
        ids: ['order-3'],
      });
    } finally {
      await test.organization.updateDepartment('delivery', { region: null });
    }
  });

  it('the executive holds the manager role directly and reviews the projects shared with her office', async () => {
    expect(await read('grace')).toEqual({
      status: 200,
      ids: ['project-2', 'project-3'],
    });
    expect(await read('grace', 'orders')).toEqual({ status: 200, ids: [] });
  });

  it('keep a direct job role when the department grant is revoked', async () => {
    const assistant = await test.database
      .connection()
      .query.selectFrom('authorizationPermissionSetAssignments')
      .select('id')
      .where('permissionSetKey', '=', SALES_SETS.assistant)
      .where('subjectType', '=', 'org.department')
      .where('subjectId', '=', 'sales-center')
      .executeTakeFirstOrThrow();
    await test.authz.permissionSets.revoke(String(assistant.id));

    expect((await read('nina', 'quotes')).status).toBe(403);
    expect((await read('chen', 'quotes')).status).toBe(403);
    // North Sales' own project viewer set keeps Nina's projects page.
    expect((await read('nina')).status).toBe(200);
    // Chen keeps his delivery access, which comes from another department.
    expect((await read('chen', 'orders')).ids).toEqual(['order-3']);
    // The engineers hold their role directly.
    expect(await read('leo')).toEqual({
      status: 200,
      ids: ['project-1', 'project-2'],
    });
  });

  it('the Sales Center head sees every North and South project, quote and order', async () => {
    expect(await read('sophia')).toEqual({
      status: 200,
      ids: ['project-1', 'project-2', 'project-3'],
    });
    expect(await read('sophia', 'quotes')).toEqual({
      status: 200,
      ids: [
        'quote-1',
        'quote-2',
        'quote-3',
        'quote-5',
        'quote-6',
        'quote-7',
        'quote-history-1',
        'quote-history-2',
        'quote-history-3',
      ],
    });
    expect(await read('sophia', 'orders')).toEqual({
      status: 200,
      ids: ['order-1', 'order-2', 'order-3'],
    });
  });

  it('the North Sales head sees what North Sales people own and prepared', async () => {
    expect(await read('owen')).toEqual({
      status: 200,
      ids: ['project-1', 'project-2'],
    });
    // Quotes follow their preparer: quote-6 is a North engineer's draft for a South project.
    expect(await read('owen', 'quotes')).toEqual({
      status: 200,
      ids: [
        'quote-1',
        'quote-2',
        'quote-5',
        'quote-6',
        'quote-history-1',
        'quote-history-2',
      ],
    });
    expect(await read('owen', 'orders')).toEqual({
      status: 200,
      ids: ['order-1', 'order-2'],
    });
  });

  it('a transfer moves the owner’s records to the new department’s head', async () => {
    const assistant = await test.database
      .connection()
      .query.selectFrom('user')
      .select('id')
      .where('email', '=', 'sales_assistant@example.test')
      .executeTakeFirstOrThrow();
    const id = String(assistant.id);
    await test.organization.addMember({
      departmentId: 'south-sales',
      userId: id,
      primary: true,
    });
    await test.organization.removeMember('north-sales', id);
    try {
      // project-1 follows its owner out of North Sales; the Sales Center head still sees it below her.
      expect((await read('owen')).ids).toEqual(['project-2']);
      expect((await read('nina')).ids).toEqual(['project-2']);
      expect((await read('sophia')).ids).toContain('project-1');
    } finally {
      await test.organization.addMember({
        departmentId: 'north-sales',
        userId: id,
        primary: true,
      });
      await test.organization.removeMember('south-sales', id);
    }
    expect((await read('owen')).ids).toEqual(['project-1', 'project-2']);
  });

  it('the Delivery sharing rule is what shows Mia the sales projects', async () => {
    const assignment = await test.database
      .connection()
      .query.selectFrom('authorizationSharingRuleAssignments')
      .selectAll()
      .where('sharingRuleId', '=', 'departments-example-sales-projects')
      .where('subjectId', '=', 'delivery')
      .executeTakeFirstOrThrow();
    await test.database
      .connection()
      .query.deleteFrom('authorizationSharingRuleAssignments')
      .where('id', '=', String(assignment.id))
      .execute();
    try {
      // The action stays; only the widened records go.
      expect(await read('mia')).toEqual({ status: 200, ids: [] });
    } finally {
      await test.database
        .connection()
        .query.insertInto('authorizationSharingRuleAssignments')
        .values(assignment)
        .execute();
    }
    expect((await read('mia')).ids).toEqual([
      'project-1',
      'project-2',
      'project-3',
    ]);
  });
});
