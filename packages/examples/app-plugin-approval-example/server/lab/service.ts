import { randomUUID } from 'node:crypto';

import {
  ApprovalError,
  ApprovalService,
  type AddMode,
  type Answered,
  type TaskRow,
} from '@nocobase/app-plugin-approval/server';
import type { DatabaseManager, RepositoryRecord } from '@nocobase/db';
import {
  SYSTEM_ACTOR,
  type JsonObject,
  type JsonValue,
  type Lifecycle,
  type LifecycleActor,
  type LifecycleRecord,
  type LifecycleRuntime,
  type LifecycleTypes,
} from '@nocobase/lifecycle';

import { demo, DEMOS, type DemoKey } from '../../shared/catalog.js';
import type { Created, LabSettings, PersonView } from '../../shared/types.js';
import { remindCoordinations } from '../scenarios/coordination.js';
import {
  consumeGrant,
  expireDueGrants,
  GRANTS,
  type Grant,
} from '../scenarios/grant.js';
import { NoticeAcknowledgements, NOTICES } from '../scenarios/notice.js';
import {
  expireOverdue,
  handlePaymentEvent,
  ORDERS,
} from '../scenarios/order.js';
import { OrgDirectory, type Delegation } from '../scenarios/org.js';
import { executeDuePayments } from '../scenarios/payment.js';
import {
  REIMBURSEMENTS,
  requestRejectedLinesAgain,
} from '../scenarios/reimbursement.js';
import {
  PaymentDeclined,
  type ExternalSystems,
  type Outbox,
  type ScenarioServices,
} from '../scenarios/services.js';
import {
  handleDeposit,
  SUPPLIERS,
  type SupplierParameters,
} from '../scenarios/supplier.js';
import { APPROVAL_EXAMPLE_COLLECTIONS } from '../scope.js';
import {
  LAB_APPROVALS,
  LAB_LIFECYCLES,
  LAB_ORG,
  lifecycleOf,
  newRecord,
  parametersOf,
} from './catalog.js';
import { ExampleError } from './errors.js';
import { databaseRecords, key, plain } from './records.js';

function object(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** The simulated providers an administrator can take down. */
export const SIMULATED_PROVIDERS: readonly string[] = [
  'pay',
  'checkCompany',
  'createSupplierAccount',
  'runOnboardingStep',
  'rollBackPreparation',
];

/** The task actions the routes accept, by the input each needs. */
export type TaskAction =
  | 'respond'
  | 'claim'
  | 'release'
  | 'transfer'
  | 'addSigner'
  | 'consult'
  | 'askMaterial'
  | 'returnTo'
  | 'revise'
  | 'assign'
  | 'reassign';

export const TASK_ACTIONS: readonly TaskAction[] = [
  'respond',
  'claim',
  'release',
  'transfer',
  'addSigner',
  'consult',
  'askMaterial',
  'returnTo',
  'revise',
  'assign',
  'reassign',
];

/** What an administrator can make the outside world do. */
export type SimulatedEvent = 'orderReady' | 'orderPayment' | 'supplierDeposit';

export const SIMULATED_EVENTS: readonly SimulatedEvent[] = [
  'orderReady',
  'orderPayment',
  'supplierDeposit',
];

/** Actions on a record that are neither a transition nor a task's. */
export type RecordAction =
  | 'read'
  | 'confirm'
  | 'comment'
  | 'useGrant'
  | 'askAgain'
  | 'appoint'
  | 'migrate';

export const RECORD_ACTIONS: readonly RecordAction[] = [
  'read',
  'confirm',
  'comment',
  'useGrant',
  'askAgain',
  'appoint',
  'migrate',
];

/**
 * The approval example on the application's database: every scenario's
 * lifecycle and approval on one runtime, the organization an administrator
 * can change, simulated external systems whose results are stored so a
 * retry or a restart repeats nothing, and the operations the pages call.
 * Reads for the pages are in `ApprovalCenter`.
 */
export class ApprovalExampleService {
  public readonly approvals: ApprovalService;
  public readonly notices: NoticeAcknowledgements;
  private settings: LabSettings = {};
  private org: OrgDirectory = new OrgDirectory(LAB_ORG);

  public constructor(
    public readonly database: DatabaseManager,
    public readonly runtime: LifecycleRuntime,
  ) {
    const services = (handle: unknown): ScenarioServices =>
      this.services(handle);
    this.approvals = new ApprovalService(runtime, LAB_APPROVALS, services);
    this.notices = new NoticeAcknowledgements(runtime);
    const lifecycles: Lifecycle<LifecycleTypes>[] = [
      ...LAB_LIFECYCLES,
      ...LAB_APPROVALS.map(
        (approval) =>
          approval.lifecycle as unknown as Lifecycle<LifecycleTypes>,
      ),
    ];
    for (const lifecycle of lifecycles) {
      const parameters = parametersOf(lifecycle.name, () => this.settings);
      runtime.register(lifecycle, {
        services: services as never,
        ...(parameters ? { parameters: parameters } : {}),
      });
    }
  }

  /** Restores the administrator's settings saved before a restart. */
  public async start(): Promise<void> {
    const stored = await this.database
      .repository(APPROVAL_EXAMPLE_COLLECTIONS.settings)
      .findOne({ filter: { key: 'settings' } });
    this.apply(object(stored?.value) ? stored.value : {});
  }

  /**
   * What the scenarios are registered with. Inside a transition `handle` is
   * its connection, and related rows are read and written through it;
   * messages and simulated calls are written through the database, because
   * they happen after the commit.
   */
  public services(handle?: unknown, outbox?: Outbox): ScenarioServices {
    return {
      org: this.org,
      records: databaseRecords(
        handle === undefined
          ? this.database
          : (handle as Parameters<typeof databaseRecords>[0]),
      ),
      lifecycles: this.runtime,
      outbox: outbox ?? {
        send: (to, subject, messageKey) => this.send(to, subject, messageKey),
      },
      external: this.external(),
      approvals: this.approvals,
    };
  }

  /** The organization as it is configured now. */
  public directory(): OrgDirectory {
    return this.org;
  }

  public currentSettings(): LabSettings {
    return this.settings;
  }

  /** The persona the page acts as: someone of the organization who still can. */
  public actor(value: unknown): string {
    if (typeof value !== 'string' || !this.org.isActive(value))
      throw new ExampleError(
        'INVALID',
        'actor',
        'Choose an active example identity.',
      );
    return value;
  }

  public people(): PersonView[] {
    const roles = Object.keys({
      ...LAB_ORG.roles,
      ...(this.settings.roles ?? {}),
    });
    return LAB_ORG.people.map((id) => ({
      id,
      active: this.org.isActive(id),
      manager: this.org.managerOf(id) ?? null,
      roles: roles.filter((role) => this.org.hasRole(id, role)),
    }));
  }

  private isAdmin(actor: string): boolean {
    return this.org.hasRole(actor, 'approvalAdmin');
  }

  private requireAdmin(actor: string): void {
    if (!this.isAdmin(actor))
      throw new ExampleError(
        'FORBIDDEN',
        'adminOnly',
        'Only the approval administrator does this.',
      );
  }

  // ------------------------------------------------------------ settings

  public async saveSettings(values: JsonObject, actor: string): Promise<void> {
    this.requireAdmin(actor);
    const settings = this.validate(values);
    const repository = this.database.repository(
      APPROVAL_EXAMPLE_COLLECTIONS.settings,
    );
    const stored = { value: settings as unknown as JsonObject };
    const { updatedCount } = await repository.updateMany({
      filter: { key: 'settings' },
      values: stored,
    });
    if (!updatedCount)
      await repository.createOne({ values: { key: 'settings', ...stored } });
    this.apply(settings);
  }

  private validate(values: JsonObject): LabSettings {
    const people = LAB_ORG.people;
    const fail = (message: string): never => {
      throw new ExampleError('INVALID', 'settings', message);
    };
    const settings: {
      -readonly [K in keyof LabSettings]: LabSettings[K];
    } = {};
    if (values.managers !== undefined) {
      if (!object(values.managers)) fail('Managers must be an object.');
      const managers = values.managers as JsonObject;
      for (const [id, manager] of Object.entries(managers))
        if (
          !people.includes(id) ||
          typeof manager !== 'string' ||
          !people.includes(manager) ||
          manager === id
        )
          fail('Managers must name distinct example identities.');
      for (const id of people) {
        const seen = new Set<string>();
        let current: string | undefined = id;
        while (current !== undefined) {
          if (seen.has(current))
            fail('The manager hierarchy must not contain a cycle.');
          seen.add(current);
          const next: JsonValue | undefined =
            managers[current] ?? LAB_ORG.managers?.[current];
          current = typeof next === 'string' ? next : undefined;
        }
      }
      settings.managers = managers as Record<string, string>;
    }
    if (values.roles !== undefined) {
      if (!object(values.roles)) fail('Roles must be an object.');
      for (const [role, holders] of Object.entries(values.roles as JsonObject))
        if (
          !Object.hasOwn(LAB_ORG.roles ?? {}, role) ||
          !Array.isArray(holders) ||
          holders.some(
            (id) => typeof id !== 'string' || !people.includes(id),
          ) ||
          (role === 'approvalAdmin' && !holders.includes('admin'))
        )
          fail(
            'Roles must name example identities and keep admin as an approval administrator.',
          );
      settings.roles = values.roles as Record<string, string[]>;
    }
    if (values.inactive !== undefined) {
      if (
        !Array.isArray(values.inactive) ||
        values.inactive.some(
          (id) =>
            typeof id !== 'string' || !people.includes(id) || id === 'admin',
        )
      )
        fail('Inactive identities must be example people; keep admin active.');
      settings.inactive = values.inactive as string[];
    }
    if (values.delegations !== undefined) {
      if (
        !Array.isArray(values.delegations) ||
        values.delegations.some(
          (item) =>
            !object(item) ||
            typeof item.from !== 'string' ||
            typeof item.to !== 'string' ||
            !people.includes(item.from) ||
            !people.includes(item.to) ||
            item.from === item.to ||
            typeof item.start !== 'string' ||
            typeof item.end !== 'string' ||
            Number.isNaN(Date.parse(item.start)) ||
            Number.isNaN(Date.parse(item.end)) ||
            item.start >= item.end ||
            !Array.isArray(item.kinds) ||
            item.kinds.some((kind) => typeof kind !== 'string'),
        )
      )
        fail('Delegations need valid identities, dates and request kinds.');
      settings.delegations = (values.delegations as JsonObject[]).map(
        (item) => ({
          from: text(item.from),
          to: text(item.to),
          start: new Date(text(item.start)).toISOString(),
          end: new Date(text(item.end)).toISOString(),
          kinds: (item.kinds as string[]).filter(Boolean),
          coversExisting: item.coversExisting === true,
        }),
      );
    }
    if (values.ruleVersion !== undefined) {
      if (values.ruleVersion !== 1 && values.ruleVersion !== 2)
        fail('The leave rules have versions 1 and 2.');
      settings.ruleVersion = values.ruleVersion as number;
    }
    if (values.failOperation !== undefined) {
      if (
        typeof values.failOperation !== 'string' ||
        !['', ...SIMULATED_PROVIDERS].includes(values.failOperation)
      )
        fail('Choose a supported simulated provider.');
      settings.failOperation = values.failOperation as string;
    }
    for (const flag of ['declinePayment', 'highRisk'] as const)
      if (values[flag] !== undefined) {
        if (typeof values[flag] !== 'boolean') fail(`"${flag}" is on or off.`);
        settings[flag] = values[flag] as boolean;
      }
    return settings;
  }

  private apply(settings: LabSettings): void {
    const org = new OrgDirectory({
      ...LAB_ORG,
      managers: { ...LAB_ORG.managers, ...(settings.managers ?? {}) },
      roles: { ...LAB_ORG.roles, ...(settings.roles ?? {}) },
    });
    for (const id of settings.inactive ?? []) org.deactivate(id);
    for (const delegation of settings.delegations ?? [])
      org.delegate({
        ...delegation,
        createdAt: delegation.start,
      } satisfies Delegation);
    this.settings = settings;
    this.org = org;
  }

  // ------------------------------------------------- the outside world

  private async once(
    collection: string,
    messageKey: string,
    values: RepositoryRecord,
  ): Promise<RepositoryRecord> {
    const repository = this.database.repository(collection);
    const existing = await repository.findOne({ filter: { key: messageKey } });
    if (existing) return existing;
    try {
      return (
        await repository.createOne({ values: { ...values, key: messageKey } })
      ).record;
    } catch (error) {
      // Another delivery of the same key won the unique index.
      const concurrent = await repository.findOne({
        filter: { key: messageKey },
      });
      if (concurrent) return concurrent;
      throw error;
    }
  }

  private async send(
    recipientId: string,
    subject: string,
    messageKey: string,
  ): Promise<void> {
    await this.once(APPROVAL_EXAMPLE_COLLECTIONS.messages, messageKey, {
      recipientId,
      subject,
      createdAt: new Date().toISOString(),
    });
  }

  private async operation(
    operationKey: string,
    kind: string,
    input: JsonObject,
    result: JsonObject,
  ): Promise<JsonObject> {
    const existing = await this.database
      .repository(APPROVAL_EXAMPLE_COLLECTIONS.operations)
      .findOne({ filter: { key: `${kind}:${operationKey}` } });
    if (object(existing?.result)) return existing.result;
    if (this.settings.failOperation === kind) {
      if (kind === 'pay' && this.settings.declinePayment === true)
        throw new PaymentDeclined(
          'The demo payment provider declined this payment.',
        );
      throw new Error(
        `The demo ${kind} provider is unavailable. Clear the simulated outage and retry.`,
      );
    }
    const saved = await this.once(
      APPROVAL_EXAMPLE_COLLECTIONS.operations,
      `${kind}:${operationKey}`,
      { kind, input, result, createdAt: new Date().toISOString() },
    );
    return saved.result as JsonObject;
  }

  private external(): ExternalSystems {
    return {
      pay: async (operationKey, payee, amountCents) => {
        const saved = await this.operation(
          operationKey,
          'pay',
          { payee, amountCents },
          { reference: `DEMO-PAY-${operationKey}` },
        );
        return { reference: text(saved.reference) };
      },
      findPayment: async (operationKey) => {
        const saved = await this.database
          .repository(APPROVAL_EXAMPLE_COLLECTIONS.operations)
          .findOne({ filter: { key: `pay:${operationKey}` } });
        return object(saved?.result)
          ? { reference: text(saved.result.reference) }
          : undefined;
      },
      checkCompany: async (registrationNo) => {
        const risk = this.settings.highRisk === true ? 'high' : 'low';
        await this.operation(
          `${registrationNo}:${randomUUID()}`,
          'checkCompany',
          { registrationNo },
          { risk },
        );
        return { risk };
      },
      createSupplierAccount: async (operationKey, name) => {
        const saved = await this.operation(
          operationKey,
          'createSupplierAccount',
          { name },
          { account: `DEMO-ACC-${operationKey}` },
        );
        return { account: text(saved.account) };
      },
      runOnboardingStep: async (operationKey, step) => {
        await this.operation(
          `${operationKey}:${step}`,
          'runOnboardingStep',
          { step },
          { done: step },
        );
        return { done: step };
      },
      rollBackPreparation: async (operationKey, item) => {
        await this.operation(
          `${operationKey}:${item}`,
          'rollBackPreparation',
          { item },
          { done: item },
        );
      },
    };
  }

  // ------------------------------------------------------------ requests

  /**
   * Creates a request from a demo's form as a draft; the page sends it on
   * its way through the demo's start transition, so a refusal is shown as
   * the lifecycle gives it.
   */
  public async create(
    key: string,
    form: JsonObject,
    actor: string,
    sample = false,
  ): Promise<Created> {
    const item = demo(key);
    if (!item)
      throw new ExampleError('INVALID', 'demo', 'Choose a kind of request.');
    let applicantId = actor;
    if (item.proxy && typeof form.applicantId === 'string') {
      applicantId = this.actor(form.applicantId);
      if (applicantId !== actor && !this.org.canProxyFor(actor, applicantId))
        throw new ExampleError(
          'FORBIDDEN',
          'proxy',
          `${actor} may not request this for ${applicantId}.`,
        );
    }
    const { values } = newRecord(item.key, form, actor, applicantId);
    const created = await this.runtime.create(
      item.lifecycle,
      sample
        ? { ...values, details: { ...(values.details as JsonObject), sample } }
        : values,
      { actor: { id: actor } },
    );
    return {
      lifecycle: item.lifecycle,
      id: String(created.record.id),
      status: String(created.record.status),
    };
  }

  /** Creates one draft of every demo that has none yet; loading again keeps them. */
  public async loadSamples(actor: string): Promise<number> {
    if (actor !== 'zhang' && !this.isAdmin(actor))
      throw new ExampleError(
        'FORBIDDEN',
        'samples',
        'Load the samples as zhang or as the administrator.',
      );
    let created = 0;
    for (const item of DEMOS) {
      const lifecycle = lifecycleOf(item.lifecycle);
      if (!lifecycle) continue;
      const rows = await databaseRecords(this.database).list(
        lifecycle.collection,
        (row) =>
          object(row.details) &&
          row.details.demo === item.key &&
          row.details.sample === true,
      );
      if (rows.length) continue;
      await this.create(item.key, item.sample(), 'zhang', true);
      created += 1;
    }
    return created;
  }

  // ----------------------------------------------------------- the clock

  /**
   * Everything that happens when time passes: the lifecycle's triggers,
   * reminders and escalations of idle tasks, scheduled payments, expired
   * grants and orders, notice and coordination reminders. The jobs
   * schedule runs the triggers itself and passes `triggers: false`.
   */
  public async sweep(triggers = true): Promise<number> {
    const now = new Date();
    const services = this.services();
    let moved = triggers ? await this.runtime.runTriggers() : 0;
    moved += await this.approvals.sweep();
    moved += (await executeDuePayments(this.runtime, services, now)).executed
      .length;
    const grants = (await databaseRecords(this.database).list(
      lifecycleOf(GRANTS)?.collection ?? GRANTS,
      (row) => row.status === 'active',
    )) as Grant[];
    moved += (await expireDueGrants(this.runtime, grants, now)).length;
    moved += await expireOverdue(this.runtime);
    moved += await this.notices.remind(services);
    // Reminders are written inside a transaction there: keep them for after
    // it, since SQLite gives a transaction the only connection.
    const later: [string, string, string][] = [];
    moved += await remindCoordinations(
      this.runtime,
      this.services(undefined, {
        send: (to, subject, messageKey) => {
          later.push([to, subject, messageKey]);
        },
      }),
    );
    for (const [to, subject, messageKey] of later)
      await this.send(to, subject, messageKey);
    return moved;
  }

  // ------------------------------------------------- simulated events

  /** An event the outside world would send, simulated by the administrator. */
  public async simulate(
    event: string,
    id: string,
    body: JsonObject,
    actor: string,
  ): Promise<JsonObject> {
    this.requireAdmin(actor);
    switch (event as SimulatedEvent) {
      case 'orderReady':
        await this.runtime.fire(ORDERS, key(id), 'markReady', {
          actor: SYSTEM_ACTOR,
          input: { demoOperator: actor },
        });
        return { outcome: 'applied' };
      case 'orderPayment':
        return (await handlePaymentEvent(this.runtime, {
          id: text(body.eventId) || randomUUID(),
          type: 'payment.succeeded',
          orderId: key(id),
          paymentRef: text(body.paymentRef) || `DEMO-ORDER-PAY-${id}`,
          occurredAt: new Date().toISOString(),
        })) as unknown as JsonObject;
      case 'supplierDeposit': {
        const { depositCents } = this.runtime.parameters(
          SUPPLIERS,
        ) as SupplierParameters;
        return await handleDeposit(this.runtime, {
          id: text(body.eventId) || randomUUID(),
          supplierId: key(id),
          depositRef: text(body.depositRef) || `DEMO-DEPOSIT-${id}`,
          amountCents: depositCents,
        });
      }
      default:
        throw new ExampleError(
          'INVALID',
          'event',
          'Choose a supported demo event.',
        );
    }
  }

  // --------------------------------------------------------------- tasks

  /** One of the approval layer's operations on a task, as the person acting. */
  public async taskAction(
    taskId: string,
    action: string,
    body: JsonObject,
    actor: string,
  ): Promise<JsonObject> {
    return JSON.parse(
      JSON.stringify(await this.runTask(taskId, action, body, actor)),
    ) as JsonObject;
  }

  private runTask(
    taskId: string,
    action: string,
    body: JsonObject,
    actor: string,
  ): Promise<TaskRow | JsonObject | Answered> {
    const who: LifecycleActor = { id: actor };
    const person = (field: string): string => {
      const value = this.actor(body[field]);
      return value;
    };
    const reason = text(body.reason);
    switch (action as TaskAction) {
      case 'respond':
        return this.approvals.respond({
          taskId,
          actor: who,
          answer: text(body.answer),
          ...(text(body.comment) ? { comment: text(body.comment) } : {}),
          ...(object(body.data) ? { data: body.data } : {}),
          ...(text(body.contentHash)
            ? { contentHash: text(body.contentHash) }
            : {}),
          ...(text(body.requestId) ? { requestId: text(body.requestId) } : {}),
        });
      case 'claim':
        return this.approvals.claim({ taskId, actor: who });
      case 'release':
        return this.approvals.release({ taskId, actor: who });
      case 'transfer':
        return this.approvals.transfer({
          taskId,
          actor: who,
          to: person('to'),
          reason,
        });
      case 'reassign':
        return this.approvals.transfer({
          taskId,
          actor: who,
          to: person('to'),
          reason,
          via: 'reassign',
          override: body.override === true,
        });
      case 'assign':
        return this.approvals.assign({ taskId, actor: who, to: person('to') });
      case 'addSigner': {
        const mode = text(body.mode);
        if (!['before', 'after', 'alongside'].includes(mode))
          throw new ExampleError(
            'INVALID',
            'mode',
            'Add the signer before, after or alongside you.',
          );
        return this.approvals.addSigner({
          taskId,
          actor: who,
          person: person('person'),
          mode: mode as AddMode,
        });
      }
      case 'consult':
        return this.approvals.consult({
          taskId,
          actor: who,
          person: person('person'),
          question: text(body.question),
        });
      case 'askMaterial':
        return this.approvals.askMaterial({
          taskId,
          actor: who,
          request: text(body.request),
        });
      case 'returnTo':
        return this.approvals.returnTo({
          taskId,
          actor: who,
          to: text(body.to),
          reason,
          ...(body.resume === true ? { resume: true } : {}),
        });
      case 'revise':
        if (!object(body.values))
          throw new ExampleError(
            'INVALID',
            'values',
            'Give the changed content.',
          );
        return this.approvals.revise({
          taskId,
          actor: who,
          values: body.values,
          reason,
        });
      default:
        throw new ExampleError('INVALID', 'action', 'Unknown task action.');
    }
  }

  // ------------------------------------------------------------- records

  /** What a person does on a record besides its transitions and its tasks. */
  public async recordAction(
    lifecycle: string,
    id: string,
    action: string,
    body: JsonObject,
    actor: string,
  ): Promise<JsonObject> {
    const who: LifecycleActor = { id: actor };
    const answer = (value: unknown): JsonObject =>
      JSON.parse(JSON.stringify(value ?? null)) as JsonObject;
    switch (action as RecordAction) {
      case 'read':
      case 'confirm':
      case 'comment': {
        if (lifecycle !== NOTICES) break;
        if (action === 'read') return answer(await this.notices.read(id, who));
        if (action === 'confirm')
          return answer(
            await this.notices.confirm(
              id,
              who,
              text(body.comment) || undefined,
            ),
          );
        await this.notices.comment(id, who, text(body.comment));
        return {};
      }
      case 'useGrant': {
        if (lifecycle !== GRANTS) break;
        const grant = (await this.runtime.view(GRANTS, key(id), who)).record;
        const amount = body.amountCents;
        return answer(
          await consumeGrant(this.runtime, {
            grantId: key(id),
            actor: who,
            amountCents: typeof amount === 'number' ? amount : Number.NaN,
            usageKey: text(body.usageKey) || randomUUID(),
            subjectId: String(grant.subjectId),
            subjectRevision: Number(grant.subjectRevision),
          }),
        );
      }
      case 'askAgain': {
        if (lifecycle !== REIMBURSEMENTS) break;
        const created = await requestRejectedLinesAgain(
          this.runtime,
          key(id),
          actor,
        );
        return { lifecycle: REIMBURSEMENTS, id: String(created) };
      }
      case 'appoint':
        return answer(
          await this.approvals.appoint({
            approval: text(body.approval),
            lifecycle,
            recordId: key(id),
            to: this.actor(body.to),
            actor: who,
            reason: text(body.reason),
          }),
        );
      case 'migrate': {
        const version = body.version;
        return answer(
          await this.approvals.migrate({
            approval: text(body.approval),
            lifecycle,
            recordId: key(id),
            version: typeof version === 'number' ? version : Number.NaN,
            actor: who,
            reason: text(body.reason),
          }),
        );
      }
    }
    throw new ApprovalError(
      'NOT_ALLOWED',
      `"${action}" does not apply to this record.`,
    );
  }

  /** The demos a person can start, for the create route's check. */
  public demos(): readonly DemoKey[] {
    return DEMOS.map((item) => item.key);
  }

  /** Rows of a collection as plain values, for read models. */
  public async rows(collection: string): Promise<LifecycleRecord[]> {
    return (
      await this.database.repository(collection).findMany({
        sort: (sort) => sort.field('id').asc(),
        limit: 10_000,
      })
    ).map(plain);
  }
}
