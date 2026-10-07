// @vitest-environment node
// The lab against a real database: both migrations, every scenario's
// lifecycle and approval on the Repository store, and the main path of each
// business walked through the service the routes call — records, runs,
// tasks, effects and simulated providers on the selected test database.
import { describeMigration } from '@nocobase/app-testing/server';
import type { JsonObject, LifecycleRecord } from '@nocobase/lifecycle';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import packageMetadata from '../package.json' with { type: 'json' };
import { DEMOS } from '../shared/catalog.js';
import type { Created } from '../shared/types.js';
import { LAB_LIFECYCLES } from '../server/lab/catalog.js';
import type { ApprovalCenter } from '../server/lab/center.js';
import { key } from '../server/lab/records.js';
import { ApprovalExampleService } from '../server/lab/service.js';
import { APPROVAL_EXAMPLE_COLLECTIONS } from '../server/scope.js';
import {
  createTestLab,
  EXAMPLE_MIGRATIONS,
  APPROVAL_MIGRATIONS,
  type TestLab,
} from './support/lab.js';

let test: TestLab;
let lab: ApprovalExampleService;
let center: ApprovalCenter;

function drain(): Promise<void> {
  return test.drain();
}

async function record(lifecycle: string, id: string): Promise<LifecycleRecord> {
  return (await lab.runtime.view(lifecycle, key(id), { id: 'admin' })).record;
}

async function create(
  demoKey: string,
  form: JsonObject,
  actor = 'zhang',
): Promise<Created> {
  return lab.create(demoKey, form, actor);
}

async function start(
  demoKey: string,
  form: JsonObject,
  actor = 'zhang',
): Promise<Created> {
  const created = await create(demoKey, form, actor);
  const item = DEMOS.find((each) => each.key === demoKey);
  if (item?.start)
    await lab.runtime.fire(created.lifecycle, key(created.id), item.start, {
      actor: { id: actor },
    });
  await drain();
  return created;
}

/** `person` answers their task on the record through the service the routes call. */
async function answer(
  lifecycle: string,
  id: string,
  person: string,
  body: JsonObject = { answer: 'approve' },
): Promise<void> {
  const [mine] = await lab.approvals.actionsFor(lifecycle, id, {
    id: person,
  });
  if (!mine) throw new Error(`${person} has nothing to answer on ${id}.`);
  const action = mine.actions.includes('claim') ? 'claim' : 'respond';
  if (action === 'claim')
    await lab.taskAction(mine.task.id, 'claim', {}, person);
  await lab.taskAction(mine.task.id, 'respond', body, person);
  await drain();
}

async function status(lifecycle: string, id: string): Promise<string> {
  return String((await record(lifecycle, id)).status);
}

beforeEach(async () => {
  test = await createTestLab();
  lab = test.lab;
  center = test.center;
});

afterEach(() => test.destroy());

describeMigration('202610060001_approval_example_create_collections', {
  sources: [
    {
      directory: APPROVAL_MIGRATIONS,
      packageName: '@nocobase/app-plugin-approval',
    },
    { directory: EXAMPLE_MIGRATIONS, packageName: packageMetadata.name },
  ],
  up: async ({ connection, expectCollection }) => {
    for (const name of [
      ...new Set(LAB_LIFECYCLES.map((l) => l.collection)),
      ...Object.values(APPROVAL_EXAMPLE_COLLECTIONS),
    ])
      await expectCollection(name).toExist();
    await expectCollection(
      APPROVAL_EXAMPLE_COLLECTIONS.transitions,
    ).toHaveField('requestKey', { nullable: false });
    await expectCollection(
      APPROVAL_EXAMPLE_COLLECTIONS.transitions,
    ).toHaveIndex(['lifecycle', 'recordId', 'requestKey'], { unique: true });
    const log = connection.repository(APPROVAL_EXAMPLE_COLLECTIONS.transitions);
    const values = (
      version: number,
      requestId: string | null,
      requestKey: string,
    ) => ({
      lifecycle: 'test',
      recordId: '1',
      transition: 'next',
      from: null,
      to: 'ready',
      actorId: 'admin',
      input: {},
      at: new Date().toISOString(),
      version,
      requestId,
      requestKey,
    });
    await log.createOne({ values: values(1, null, '$v:1') });
    await log.createOne({ values: values(2, null, '$v:2') });
    await log.createOne({ values: values(3, 'click', 'click') });
    await expect(
      log.createOne({ values: values(4, 'click', 'click') }),
    ).rejects.toThrow();
  },
  down: async ({ expectCollection }) => {
    for (const name of [
      ...new Set(LAB_LIFECYCLES.map((l) => l.collection)),
      ...Object.values(APPROVAL_EXAMPLE_COLLECTIONS),
    ])
      await expectCollection(name).not.toExist();
  },
});

describe('samples', () => {
  it('creates one draft of every demo once, as zhang', async () => {
    expect(await lab.loadSamples('zhang')).toBe(DEMOS.length);
    expect(await lab.loadSamples('admin')).toBe(0);
    await expect(lab.loadSamples('li')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    const { records } = await center.overview('zhang');
    expect(new Set(records.map((summary) => summary.demo)).size).toBe(
      DEMOS.length,
    );
  });
});

describe('approvals walked through on the selected test database', () => {
  it('leave: the manager approves, the record moves once, and the registration effect follows', async () => {
    const leave = await start('leave', {
      days: 2,
      reason: 'Family',
      leaveType: 'annual',
    });
    expect(await status(leave.lifecycle, leave.id)).toBe('approving');
    const inbox = (await center.overview('li')).inbox.filter(
      (item) => item.box === 'toDo',
    );
    expect(inbox).toMatchObject([
      { lifecycle: 'scenarioLeaves', recordId: leave.id, action: 'respond' },
    ]);
    await answer(leave.lifecycle, leave.id, 'li');
    expect(await status(leave.lifecycle, leave.id)).toBe('registered');
    const detail = await center.detail(leave.lifecycle, leave.id, 'zhang');
    expect(detail.runs).toMatchObject([
      {
        run: { status: 'approved' },
        stages: [
          { key: 'manager', state: 'done' },
          { state: 'skipped' },
          { state: 'skipped' },
        ],
      },
    ]);
    expect((await center.overview('zhang')).messages.length).toBeGreaterThan(0);
  });

  it('a longer leave goes through the department manager and HR, as the preview said', async () => {
    const preview = await center.preview(
      'leave',
      { days: 5, reason: 'Trip' },
      'zhang',
    );
    expect(
      preview.steps.map((step) => [step.key, step.included, step.people]),
    ).toEqual([
      ['manager', true, ['li']],
      ['deptManager', true, ['wang']],
      ['hr', true, ['hr']],
    ]);
    const leave = await start('leave', { days: 5, reason: 'Trip' });
    for (const person of ['li', 'wang', 'hr'])
      await answer(leave.lifecycle, leave.id, person);
    expect(await status(leave.lifecycle, leave.id)).toBe('registered');
  });

  it('contract: manager, a countersignature of legal and finance, then a procurement pool', async () => {
    const contract = await start('contract', {
      title: 'Acme supply',
      amount: 60_000,
    });
    await answer(contract.lifecycle, contract.id, 'li');
    for (const person of ['legalA', 'legalB', 'legalC', 'finA', 'finB', 'finC'])
      await answer(contract.lifecycle, contract.id, person);
    expect(
      (await center.detail(contract.lifecycle, contract.id, 'buyerA')).actions,
    ).toMatchObject([{ task: { stage: 'procurement' } }]);
    await answer(contract.lifecycle, contract.id, 'buyerA');
    expect(await status(contract.lifecycle, contract.id)).toBe('approved');
  });

  it('a purchase coordinates department reviews as child records and completes with them', async () => {
    const purchase = await start('purchase', {
      items: [
        { category: 'server', name: 'Rack', amount: 30_000 },
        { category: 'software', name: 'EDR', amount: 8_000 },
      ],
    });
    const detail = await center.detail(
      purchase.lifecycle,
      purchase.id,
      'zhang',
    );
    expect(detail.branches.map((branch) => branch.key)).toEqual([
      'it',
      'security',
    ]);
    for (const branch of detail.branches) {
      const reviewer = branch.key === 'it' ? 'itA' : 'secA';
      await answer(branch.childLifecycle, branch.childId, reviewer);
    }
    expect(await status(purchase.lifecycle, purchase.id)).toBe('completed');
    const summaries = (await center.overview('zhang')).records;
    expect(
      summaries.filter(
        (summary) =>
          summary.parent?.id === purchase.id && summary.business === 'purchase',
      ),
    ).toHaveLength(2);
  });

  it('onboarding runs its work items as effects to completion', async () => {
    const onboarding = await start('onboarding', {
      employee: 'Nora',
      remote: false,
    });
    expect(await status(onboarding.lifecycle, onboarding.id)).toBe('completed');
  });

  it('reimbursement: each line decided by its team, then paid', async () => {
    const sheet = await start(
      'reimbursement',
      DEMOS.find((each) => each.key === 'reimbursement')!.sample(),
    );
    await answer(sheet.lifecycle, sheet.id, 'finA', {
      answer: 'approve',
      data: { approvedCents: 70_000 },
    });
    await answer(sheet.lifecycle, sheet.id, 'facA');
    expect(await record(sheet.lifecycle, sheet.id)).toMatchObject({
      status: 'paid',
      approvedTotalCents: 130_000,
    });
  });

  it('notice: becomes effective once every recipient confirms', async () => {
    const notice = await start('notice', {
      title: 'Policy',
      mode: 'confirmAll',
      recipientIds: ['li', 'wang'],
    });
    expect(await status(notice.lifecycle, notice.id)).toBe('collecting');
    expect(
      (await center.overview('li')).inbox.filter(
        (item) => item.box === 'toDo' && item.action === 'confirm',
      ),
    ).toHaveLength(1);
    await lab.recordAction(notice.lifecycle, notice.id, 'confirm', {}, 'li');
    await lab.recordAction(
      notice.lifecycle,
      notice.id,
      'confirm',
      { comment: 'Noted' },
      'wang',
    );
    expect(await status(notice.lifecycle, notice.id)).toBe('effective');
  });

  it('payment: approved, then executed in installments by the treasurer', async () => {
    const payment = await start('payment', {
      title: 'Licence',
      payeeId: 'supplier',
      amountCents: 100_000,
      budgetCode: 'general',
      executionMode: 'scheduled',
      installments: 2,
    });
    await answer(payment.lifecycle, payment.id, 'finA');
    expect(await status(payment.lifecycle, payment.id)).toBe('approved');
    const toDo = (await center.overview('finB')).inbox.filter(
      (item) => item.box === 'toDo' && item.recordId === payment.id,
    );
    expect(toDo.map((item) => item.action)).toEqual(['schedule', 'execute']);
    await lab.runtime.fire(payment.lifecycle, key(payment.id), 'execute', {
      actor: { id: 'finB' },
    });
    await drain();
    expect(await record(payment.lifecycle, payment.id)).toMatchObject({
      status: 'executed',
      installmentsPaid: 2,
      paidCents: 100_000,
    });
  });

  it('grant: an approved request issues a grant its holder uses', async () => {
    const request = await start(
      'grantRequest',
      DEMOS.find((each) => each.key === 'grantRequest')!.sample(),
    );
    await answer(request.lifecycle, request.id, 'li');
    const detail = await center.detail(request.lifecycle, request.id, 'zhang');
    const [grant] = detail.extras.grants as { id: string; status: string }[];
    expect(grant.status).toBe('active');
    await lab.recordAction(
      'scenarioGrants',
      grant.id,
      'useGrant',
      { amountCents: 40_000, usageKey: 'po-1' },
      'zhang',
    );
    expect(
      (await center.detail('scenarioGrants', grant.id, 'zhang')).extras.balance,
    ).toMatchObject({ usedCents: 40_000, uses: 1 });
  });

  it('supplier: legal approval, a registry check and account creation, all through effects', async () => {
    const supplier = await start('supplier', {
      name: 'Acme',
      registrationNo: 'ACME-1',
    });
    await answer(supplier.lifecycle, supplier.id, 'legalA');
    expect(await record(supplier.lifecycle, supplier.id)).toMatchObject({
      status: 'active',
      riskLevel: 'low',
    });
  });

  it('order: the administrator simulates the provider, and the shipment follows', async () => {
    const order = await create('order', { amountCents: 20_000 });
    await expect(
      lab.simulate('orderReady', order.id, {}, 'zhang'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await lab.simulate('orderReady', order.id, {}, 'admin');
    await lab.simulate('orderPayment', order.id, {}, 'admin');
    await drain();
    expect(await status(order.lifecycle, order.id)).toBe('fulfilled');
  });

  it('trip: an assistant files it for zhang, and the manager decides', async () => {
    const trip = await create(
      'trip',
      { applicantId: 'zhang', city: 'Shanghai' },
      'assistant',
    );
    await lab.runtime.fire(trip.lifecycle, key(trip.id), 'submit', {
      actor: { id: 'assistant' },
    });
    await answer(trip.lifecycle, trip.id, 'li');
    expect(await record(trip.lifecycle, trip.id)).toMatchObject({
      status: 'approved',
      applicantId: 'zhang',
      submittedBy: 'assistant',
    });
  });

  it('a refused submission leaves no run and no task behind', async () => {
    const first = await start('matter', { subjectKey: 'contract-7:budget' });
    const second = await create('matter', { subjectKey: 'contract-7:budget' });
    await expect(
      lab.runtime.fire(second.lifecycle, key(second.id), 'submit', {
        actor: { id: 'zhang' },
      }),
    ).rejects.toMatchObject({ code: 'GUARD_REJECTED' });
    expect(await status(first.lifecycle, first.id)).toBe('approving');
    expect(await lab.approvals.runsFor(second.lifecycle, second.id)).toEqual(
      [],
    );
  });
});

describe('administration', () => {
  it('only the administrator changes the organization, and the change decides who is asked next', async () => {
    await expect(
      lab.saveSettings({ managers: { zhang: 'zhao' } }, 'zhang'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      lab.saveSettings({ managers: { zhang: 'zhang' } }, 'admin'),
    ).rejects.toMatchObject({ code: 'INVALID' });
    await lab.saveSettings(
      { managers: { zhang: 'zhao' }, ruleVersion: 2 },
      'admin',
    );
    const preview = await center.preview('ruledLeave', { days: 2 }, 'zhang');
    expect(preview.steps.map((step) => [step.key, step.people])).toEqual([
      ['manager', ['zhao']],
      ['deptManager', ['wang']],
      ['hr', ['hr']],
    ]);
    // The settings survive a restart.
    const again = new ApprovalExampleService(test.database, test.runtime());
    await again.start();
    expect(again.currentSettings()).toMatchObject({ ruleVersion: 2 });
  });

  it('the administrator reassigns a task, and the sweep runs the clock', async () => {
    const leave = await start('leave', { days: 2, reason: 'Family' });
    const detail = await center.detail(leave.lifecycle, leave.id, 'admin');
    const reassign = detail.admin.find(
      (action) => action.action === 'reassign',
    );
    expect(reassign).toMatchObject({ assigneeId: 'li' });
    await lab.taskAction(
      reassign!.taskId!,
      'reassign',
      { to: 'wang', reason: 'Li is away' },
      'admin',
    );
    await answer(leave.lifecycle, leave.id, 'wang');
    expect(await status(leave.lifecycle, leave.id)).toBe('registered');
    await expect(lab.sweep()).resolves.toBeGreaterThanOrEqual(0);
  });
});
