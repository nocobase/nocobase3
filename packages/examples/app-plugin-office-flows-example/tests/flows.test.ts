// Both processes end to end on SQLite, with the plugin's migration and seed
// applied. Effects run in process, so every assertion follows the action
// that caused it.
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import {
  createRepositoryLifecycleStore,
  LifecycleRuntime,
} from '@nocobase/lifecycle';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  emptyDataRequest,
  type DataRequestForm,
} from '../shared/data-request.js';
import { registerLifecycles } from '../server/lifecycles/index.js';
import { COLLECTIONS } from '../server/scope.js';
import { OfficeFlowsService } from '../server/services/office-flows.js';
import { OfficeStore, people, type Plain } from '../server/services/store.js';

const root = path.resolve(import.meta.dirname, '..');
let directory: string;
let database: DatabaseManager;
let service: OfficeFlowsService;
let store: OfficeStore;

beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'office-flows-'));
  database = createDatabaseManager({
    drivers: { sqlite },
    connections: {
      main: {
        dialect: 'sqlite',
        filename: path.join(directory, 'main.sqlite'),
      },
    },
  });
  const packageName = '@nocobase/app-plugin-office-flows-example';
  await database
    .createMigrator({
      directory: path.join(root, 'database/migrations'),
      packageName,
    })
    .latest();
  await database
    .createSeeder({ directory: path.join(root, 'database/seeds'), packageName })
    .run();
  const runtime = new LifecycleRuntime({
    store: createRepositoryLifecycleStore(database, {
      collections: {
        transitions: COLLECTIONS.transitions,
        effectRuns: COLLECTIONS.effectRuns,
      },
    }),
  });
  store = new OfficeStore(database);
  registerLifecycles(runtime, store);
  service = new OfficeFlowsService(database, runtime, store);
});

afterEach(async () => {
  await database.destroy();
  await rm(directory, { recursive: true, force: true });
});

function today(offset = 0): string {
  return new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
}

function requestForm(values: Partial<DataRequestForm>): DataRequestForm {
  return {
    ...emptyDataRequest(),
    subject: '客户画像数据',
    reason: '季度经营分析',
    volume: '50≤x<2万',
    scope: 'internal',
    consumers: ['内部合规风险审计'],
    frequency: 'once',
    deliveryDate: today(5),
    ...values,
  };
}

async function approveToAcceptance(id: string): Promise<void> {
  await service.fire('dataRequests', id, 'submit', {}, 'zhangwei');
  await service.fire('dataRequests', id, 'approve', {}, 'lina');
  await service.fire('dataRequests', id, 'approve', {}, 'wangqiang');
  await service.fire('dataRequests', id, 'approve', {}, 'zhaomin');
}

async function noticesOf(person: string): Promise<Plain[]> {
  return service.notices(person);
}

describe('data usage request', () => {
  it('refuses to submit an incomplete form and changes nothing', async () => {
    const created = await service.createDataRequest(
      requestForm({ consumers: ['内部管理及分析'] }),
      'zhangwei',
    );
    await expect(
      service.fire(
        'dataRequests',
        String(created.id),
        'submit',
        {},
        'zhangwei',
      ),
    ).rejects.toMatchObject({
      code: 'INVALID_INPUT',
      message: expect.stringContaining('授权人员范围'),
    });
    const detail = await service.dataRequestDetail(
      String(created.id),
      'zhangwei',
    );
    expect((detail.record as Plain).status).toBe('draft');
  });

  it('goes through three managers and creates the one-time extraction task', async () => {
    const created = await service.createDataRequest(
      requestForm({}),
      'zhangwei',
    );
    const id = String(created.id);
    await service.fire('dataRequests', id, 'submit', {}, 'zhangwei');
    await expect(
      service.fire('dataRequests', id, 'approve', {}, 'wangqiang'),
    ).rejects.toMatchObject({
      code: 'GUARD_REJECTED',
    });
    await service.fire('dataRequests', id, 'approve', {}, 'lina');
    await service.fire('dataRequests', id, 'approve', {}, 'wangqiang');
    await service.fire('dataRequests', id, 'approve', {}, 'zhaomin');
    const detail = await service.dataRequestDetail(id, 'chenjing');
    expect((detail.record as Plain).status).toBe('accepting');
    expect(detail.extractions).toMatchObject([
      { origin: 'once', status: 'pending' },
    ]);
  });

  it('cannot return to the applicant once a task exists, nor finish while one is open', async () => {
    const created = await service.createDataRequest(
      requestForm({}),
      'zhangwei',
    );
    const id = String(created.id);
    await approveToAcceptance(id);
    const available = (await (
      await service.dataRequestDetail(id, 'chenjing')
    ).available) as {
      name: string;
      allowed: boolean;
    }[];
    expect(
      available.find((item) => item.name === 'acceptanceReturn')?.allowed,
    ).toBe(false);
    expect(available.find((item) => item.name === 'complete')?.allowed).toBe(
      false,
    );
    expect(available.find((item) => item.name === 'exit')?.allowed).toBe(true);

    const [task] = (await service.dataRequestDetail(id, 'chenjing'))
      .extractions as Plain[];
    const taskId = String(task!.id);
    await expect(
      service.fire('extractions', taskId, 'submit', {}, 'liuyang'),
    ).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    await service.updateExtraction(
      taskId,
      {
        category: '一次性清单数据抽取',
        complexity: '简单',
        agreedDeliveryAt: today(6),
        sourceSystem: '核心系统',
        needsDownload: true,
        feedbackNote: '已抽取',
        managerId: 'chenjing',
        confirmerId: 'zhangwei',
      },
      'liuyang',
    );
    await service.fire('extractions', taskId, 'submit', {}, 'liuyang');
    await service.fire('dataRequests', id, 'complete', {}, 'chenjing');
    expect(
      ((await service.dataRequestDetail(id, 'chenjing')).record as Plain)
        .status,
    ).toBe('completed');
  });

  it('creates the due tasks of a periodic request once, however often it sweeps', async () => {
    const created = await service.createDataRequest(
      requestForm({
        frequency: 'daily',
        deliveryDate: '',
        firstUseDate: today(),
        lastDeliveryDate: today(30),
      }),
      'zhangwei',
    );
    const id = String(created.id);
    await approveToAcceptance(id);
    const first = await service.runSchedule(today(10));
    expect(first).toBeGreaterThan(0);
    expect(await service.runSchedule(today(10))).toBe(0);
    const detail = await service.dataRequestDetail(id, 'chenjing');
    expect(detail.extractions).toHaveLength(first);
    // Every task falls on a day the schedule says is due.
    const due = (detail.schedule as { due: string[] }).due;
    for (const task of detail.extractions as Plain[])
      expect(due).toContain(task.scheduledDate);
  });
});

describe('incoming document', () => {
  async function dispatching(): Promise<string> {
    const created = await service.createIncoming(
      {
        title: '关于加强数据安全管理的通知',
        code: 'SW-2026-0101',
        sender: '监管机构',
        senderRef: '监管〔2026〕12号',
        summary: '要求各部门开展数据安全自查。',
        officeOpinion: '财务部统筹，工会、信息技术部协办。',
        distributionType: 'review',
      },
      'zhoujie',
    );
    const id = String(created.id);
    await service.fireIncoming(id, 'submit', {}, 'zhoujie');
    await service.fireIncoming(id, 'approve', {}, 'wuhua');
    await service.fireIncoming(id, 'approve', {}, 'zhengkai');
    return id;
  }

  const allPeople = {
    includeClerks: true,
    includeHeads: true,
    includeLeaders: true,
  };

  it('reminds a person in several departments once, also after re-approval', async () => {
    const id = await dispatching();
    await service.addRow(
      'incoming',
      id,
      { departmentName: '财务部', ...allPeople },
      'zhoujie',
    );
    await service.addRow(
      'incoming',
      id,
      { departmentName: '工会', ...allPeople },
      'zhoujie',
    );
    await service.fireIncoming(id, 'dispatchClerks', {}, 'zhoujie');

    const detail = await service.incomingDetail(id, 'zhoujie');
    const [level] = detail.processing as { tasks: Plain[] }[];
    expect(level!.tasks.map((task) => task.departmentName)).toEqual([
      '财务部',
      '工会',
    ]);
    // 何明 heads both departments.
    expect(await noticesOf('heming')).toHaveLength(1);

    await service.fireIncoming(id, 'reapprove', {}, 'zhoujie');
    await service.fireIncoming(id, 'approve', {}, 'wuhua');
    await service.fireIncoming(id, 'approve', {}, 'zhengkai');
    await service.addRow(
      'incoming',
      id,
      { departmentName: '信息技术部', ...allPeople },
      'zhoujie',
    );
    await service.fireIncoming(id, 'dispatchClerks', {}, 'zhoujie');
    // 马慧 leads 财务部 and 信息技术部; the second dispatch does not remind her again.
    expect(await noticesOf('mahui')).toHaveLength(1);
    expect(await noticesOf('huangtao')).toHaveLength(1);
    const traces = (await service.incomingDetail(id, 'zhoujie'))
      .traces as Plain[];
    expect(traces.at(-1)?.detail).toMatchObject({ skipped: ['mahui'] });
  });

  it('forwards to management from configuration and by hand, reminding each member once', async () => {
    const id = await dispatching();
    const groups = (await service.config()).managementGroups as Plain[];
    for (const group of groups)
      await service.addManagement(id, { groupId: Number(group.id) }, 'zhoujie');
    await service.addManagement(
      id,
      { groupName: '临时群组', members: ['caobin'] },
      'zhoujie',
    );
    await service.fireIncoming(id, 'forwardManagement', {}, 'zhoujie');
    // 叶青 is in both configured groups, 曹斌 in one of them and the manual row.
    expect(await noticesOf('yeqing')).toHaveLength(1);
    expect(await noticesOf('caobin')).toHaveLength(1);
    expect(await noticesOf('jiangli')).toHaveLength(1);
  });

  it('runs a clerk task through countersign, execution team and executor', async () => {
    const id = await dispatching();
    await service.addRow(
      'incoming',
      id,
      { departmentName: '财务部', ...allPeople },
      'zhoujie',
    );
    await service.fireIncoming(id, 'dispatchClerks', {}, 'zhoujie');
    const [clerk] = await service.myTasks('gaoyan');
    const clerkId = String(clerk!.id);

    // Both of 财务部's clerks countersign before it moves on.
    await service.fireTask(
      'clerk',
      clerkId,
      'sign',
      { decision: 'C' },
      'gaoyan',
    );
    expect(
      ((await service.taskDetail('clerk', clerkId, 'gaoyan')).record as Plain)
        .status,
    ).toBe('signing');
    await service.fireTask(
      'clerk',
      clerkId,
      'sign',
      { decision: 'C' },
      'linfeng',
    );
    expect(
      ((await service.taskDetail('clerk', clerkId, 'gaoyan')).record as Plain)
        .status,
    ).toBe('reviewing');

    // An execution team below this task, and an assisting department beside it.
    await service.addRow(
      'clerk',
      clerkId,
      { departmentName: '工会', ...allPeople },
      'gaoyan',
    );
    await service.fireTask('clerk', clerkId, 'dispatchTeams', {}, 'gaoyan');
    await service.addRow(
      'clerk',
      clerkId,
      {
        departmentName: '风险管理部',
        includeClerks: true,
        includeHeads: false,
        includeLeaders: false,
        assistOther: true,
      },
      'gaoyan',
    );
    const incoming = await service.incomingDetail(id, 'zhoujie');
    const clerkLevel = (incoming.processing as { tasks: Plain[] }[])[0]!;
    expect(clerkLevel.tasks.map((task) => task.departmentName)).toEqual([
      '财务部',
      '风险管理部',
    ]);
    // The root records both of 财务部's distributions.
    expect((incoming.traces as Plain[]).map((trace) => trace.action)).toEqual(
      expect.arrayContaining(['财务部派发执行团队', '财务部派发其他部门协助']),
    );

    const [team] = await service.myTasks('luoxin');
    const teamId = String(team!.id);
    expect(team!.kind).toBe('team');
    await service.addRow(
      'team',
      teamId,
      { departmentName: '董事会办公室', ...allPeople },
      'luoxin',
    );
    await service.fireTask('team', teamId, 'dispatchExecutors', {}, 'luoxin');
    const [executor] = await service.myTasks('tangjun');
    expect(executor!.kind).toBe('executor');

    const executorView = await service.taskDetail(
      'executor',
      String(executor!.id),
      'tangjun',
    );
    expect(
      (executorView.processing as { title: string }[]).map(
        (level) => level.title,
      ),
    ).toEqual(['执行人列表', '执行团队列表', '办事人员列表']);
    await service.updateTask(
      'executor',
      String(executor!.id),
      { redHeadFeedback: false, feedback: '已按要求自查' },
      'tangjun',
    );
    await service.fireTask(
      'executor',
      String(executor!.id),
      'submitFeedback',
      {},
      'tangjun',
    );
    const done = await service.taskDetail(
      'executor',
      String(executor!.id),
      'tangjun',
    );
    expect((done.record as Plain).status).toBe('done');
    // The executor's feedback stays out of the root's traces.
    const rootTraces = (await service.incomingDetail(id, 'zhoujie'))
      .traces as Plain[];
    expect(rootTraces.some((trace) => trace.action === '派发执行人')).toBe(
      false,
    );
    expect(people((done.record as Plain).assignees)).toEqual(['tangjun']);
  });

  it('ends a clerk task on an objection and tells the office', async () => {
    const id = await dispatching();
    await service.addRow(
      'incoming',
      id,
      { departmentName: '工会', ...allPeople },
      'zhoujie',
    );
    await service.fireIncoming(id, 'dispatchClerks', {}, 'zhoujie');
    const [clerk] = await service.myTasks('luoxin');
    await service.fireTask(
      'clerk',
      String(clerk!.id),
      'sign',
      { decision: 'B' },
      'luoxin',
    );
    expect(
      (
        (await service.taskDetail('clerk', String(clerk!.id), 'luoxin'))
          .record as Plain
      ).status,
    ).toBe('objected');
    expect(
      (await noticesOf('zhoujie')).map((notice) => notice.message),
    ).toEqual([expect.stringContaining('有异议')]);
  });
});

describe('office store under retries and races', () => {
  it('hands out a different number to each concurrent caller', async () => {
    const numbers = await Promise.all(
      Array.from({ length: 5 }, () => store.nextNumber('TEST')),
    );
    expect(new Set(numbers).size).toBe(5);
    expect(numbers.map((number) => number.slice(-4)).sort()).toEqual([
      '0001',
      '0002',
      '0003',
      '0004',
      '0005',
    ]);
  });

  it('writes a keyed trace once however often it is retried', async () => {
    const trace = {
      key: 'incoming:42',
      docKind: 'incoming',
      docId: 1,
      actorId: 'registrar',
      action: '派发办事人员',
      detail: {},
    };
    await store.trace(trace);
    await store.trace(trace);
    await store.trace({ ...trace, key: undefined });
    expect(
      await database
        .repository(COLLECTIONS.traces)
        .count({ filter: { docKind: 'incoming', docId: 1 } }),
    ).toBe(2);
  });

  it('reports a row an earlier attempt dispatched instead of skipping it', async () => {
    const row = await database.repository(COLLECTIONS.assignments).createOne({
      values: {
        rootId: 1,
        parentKind: 'incoming',
        parentId: 1,
        level: 1,
        departmentName: '财务部',
        assignees: ['clerk-a'],
        createdBy: 'registrar',
        createdAt: new Date().toISOString(),
      },
    });
    const id = Number(row.record.id);
    const first = await store.dispatch(1, [id]);
    // The attempt stopped after dispatching, before the reminders and the
    // trace; the retry must still report the task so they are sent.
    const retry = await store.dispatch(1, [id]);
    expect(retry.created).toEqual(first.created);
    expect(retry.notified).toEqual([]);
    expect(retry.skipped).toEqual(['clerk-a']);
    expect(await database.repository(COLLECTIONS.clerkTasks).count({})).toBe(1);
  });
});
