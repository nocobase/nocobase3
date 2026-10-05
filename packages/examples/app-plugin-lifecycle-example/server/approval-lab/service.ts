import { text } from '../../shared/text.js';
import { randomUUID } from 'node:crypto';
import type {
  DatabaseConnection,
  DatabaseManager,
  RepositoryRecord,
} from '@nocobase/db';
import {
  SYSTEM_ACTOR,
  type JsonObject,
  type LifecycleRecord,
  type LifecycleRuntime,
  type RecordId,
} from '@nocobase/lifecycle';

import {
  APPROVAL_DEMOS,
  type LabOverview,
  type LabPerson,
  type LabRecord,
} from '../../shared/approval-lab.js';
import type { ApprovalTrail } from '../../shared/approval-trail.js';
import {
  draftValues,
  type ApprovalRequest,
} from '../approval-scenarios/approval/lifecycle.js';
import { approvalTrail } from '../approval-scenarios/approval/records.js';
import { PolicyRegistry } from '../approval-scenarios/approval/policy.js';
import { coordinationValues } from '../approval-scenarios/coordination.js';
import {
  OrgDirectory,
  type OrgSnapshot,
  type Delegation,
} from '../approval-scenarios/org.js';
import {
  PaymentDeclined,
  type ScenarioServices,
  type RecordAccess,
} from '../approval-scenarios/services.js';
import {
  approvalTodoSource,
  acknowledgementTodoSource,
  todosFor,
} from '../approval-scenarios/todo.js';
import { executeDuePayments } from '../approval-scenarios/payment.js';
import { expireDueGrants } from '../approval-scenarios/grant.js';
import { LIFECYCLE_EXAMPLE_COLLECTIONS } from '../scope.js';
import { ExampleError } from '../services/lifecycle-example.js';
import { LAB_LIFECYCLES, LAB_ORG, labPolicies } from './definitions.js';

function record(row: RepositoryRecord): LifecycleRecord {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      value instanceof Date ? value.toISOString() : value,
    ]),
  ) as LifecycleRecord;
}

function object(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Keep submitted form data separate from fields owned by the lifecycle. */
function formValues(defaults: JsonObject, values: JsonObject): JsonObject {
  const result: JsonObject = {};
  for (const [field, fallback] of Object.entries(defaults)) {
    const value = values[field] === undefined ? fallback : values[field];
    if (fallback === null) {
      result[field] = null;
      continue;
    }
    if (Array.isArray(fallback)) {
      if (!Array.isArray(value))
        throw new ExampleError('INVALID', 'form', `"${field}" must be a list.`);
      const sample = fallback[0];
      result[field] = value.map((item) => {
        if (object(sample)) {
          if (!object(item))
            throw new ExampleError(
              'INVALID',
              'form',
              `"${field}" needs object items.`,
            );
          return formValues(sample, item);
        }
        if (sample !== undefined && typeof item !== typeof sample)
          throw new ExampleError(
            'INVALID',
            'form',
            `"${field}" has an invalid item.`,
          );
        return item;
      });
    } else if (object(fallback)) {
      if (!object(value))
        throw new ExampleError(
          'INVALID',
          'form',
          `"${field}" must be an object.`,
        );
      result[field] = { ...value, ...formValues(fallback, value) };
    } else {
      if (
        typeof value !== typeof fallback ||
        (typeof value === 'number' && (!Number.isFinite(value) || value < 0))
      )
        throw new ExampleError(
          'INVALID',
          'form',
          `"${field}" has an invalid value.`,
        );
      result[field] = value;
    }
  }
  return result;
}

export class ApprovalLabService {
  private settings: JsonObject = {};
  private org: OrgDirectory = new OrgDirectory(LAB_ORG);
  private policies: PolicyRegistry = new PolicyRegistry(labPolicies());

  public constructor(
    public readonly database: DatabaseManager,
    public readonly runtime: LifecycleRuntime,
  ) {
    for (const lifecycle of LAB_LIFECYCLES)
      runtime.register(lifecycle, {
        services: (transaction: unknown) =>
          this.services(transaction as DatabaseConnection | undefined),
        ...(lifecycle.name === 'reimbursements'
          ? {
              parameters: () => ({
                routing: 'byCategory',
                categoryRoles: { travel: 'finance', hotel: 'facilities' },
              }),
            }
          : {}),
      });
  }

  public async start(): Promise<void> {
    const stored = await this.database
      .repository('scenarioDemoSettings')
      .findOne({ filter: { key: 'settings' } });
    this.applySettings(object(stored?.value) ? stored.value : {});
  }

  /** The scenario services outside any transition, for read models. */
  public scenario(): ScenarioServices {
    return this.services();
  }

  /** The organization as currently configured, delegations included. */
  public directory(): OrgDirectory {
    return this.org;
  }

  public policyRegistry(): PolicyRegistry {
    return this.policies;
  }

  /** A staged approval request's stages, to-dos and handling log. */
  public trail(record: LifecycleRecord): Promise<ApprovalTrail> {
    const request = record as ApprovalRequest;
    return approvalTrail(this.services().records, {
      id: request.id,
      round: Number(request.round ?? 0),
      currentStageId:
        typeof request.currentStageId === 'string'
          ? request.currentStageId
          : null,
    });
  }

  public actor(value: unknown): string {
    if (typeof value !== 'string' || !this.org.isActive(value))
      throw new ExampleError(
        'INVALID',
        'actor',
        'Choose an active example identity.',
      );
    return value;
  }

  private services(connection?: DatabaseConnection): ScenarioServices {
    const repository = (collection: string) =>
      connection
        ? connection.repository(collection)
        : this.database.repository(collection);
    const records: RecordAccess = {
      get: async (collection, id) => {
        const row = await repository(collection).findOne({
          filter: { id: text(id) },
        });
        return row ? record(row) : undefined;
      },
      // Demo data is intentionally small. A production todo source uses indexed queries.
      list: async (collection, where) =>
        (await repository(collection).findMany({ limit: 10000 }))
          .map(record)
          .filter(where),
      find: async (collection, match) =>
        (
          await repository(collection).findMany({
            filter: match,
            sort: (sort) => sort.field('id').asc(),
          })
        ).map(record),
      insert: async (collection, values) =>
        record(
          (
            await repository(collection).createOne({
              values: values as RepositoryRecord,
            })
          ).record,
        ),
      update: async (collection, id, values) => {
        await repository(collection).updateMany({
          filter: { id: text(id) },
          values: values as RepositoryRecord,
        });
      },
    };
    return {
      org: this.org,
      policies: this.policies,
      records,
      lifecycles: this.runtime,
      outbox: {
        send: async (recipientId, subject, key) => {
          await this.once('scenarioMessages', key, {
            recipientId,
            subject,
            createdAt: new Date().toISOString(),
          });
        },
      },
      external: {
        pay: async (key, payee, amountCents) => {
          const saved = await this.operation(
            key,
            'pay',
            { payee, amountCents },
            { reference: `DEMO-PAY-${key}` },
          );
          return { reference: text(saved.reference) };
        },
        findPayment: async (key) => {
          const saved = await this.database
            .repository('scenarioExternalOperations')
            .findOne({ filter: { key: `pay:${key}` } });
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
        createSupplierAccount: async (key, name) => {
          const saved = await this.operation(
            key,
            'createSupplierAccount',
            { name },
            { account: `DEMO-ACC-${key}` },
          );
          return { account: text(saved.account) };
        },
        runOnboardingStep: async (key, step) => {
          await this.operation(
            `${key}:${step}`,
            'runOnboardingStep',
            { step },
            { done: step },
          );
          return { done: step };
        },
        rollBackPreparation: async (key, item) => {
          await this.operation(
            `${key}:${item}`,
            'rollBackPreparation',
            { item },
            { done: item },
          );
        },
      },
    };
  }

  private async once(
    collection: string,
    key: string,
    values: RepositoryRecord,
  ): Promise<RepositoryRecord> {
    const repository = this.database.repository(collection);
    const existing = await repository.findOne({ filter: { key } });
    if (existing) return existing;
    try {
      return (await repository.createOne({ values: { ...values, key } }))
        .record;
    } catch (error) {
      const concurrent = await repository.findOne({ filter: { key } });
      if (concurrent) return concurrent;
      throw error;
    }
  }

  private async operation(
    key: string,
    kind: string,
    input: JsonObject,
    result: JsonObject,
  ): Promise<JsonObject> {
    const existing = await this.database
      .repository('scenarioExternalOperations')
      .findOne({ filter: { key: `${kind}:${key}` } });
    if (object(existing?.result)) return existing.result;
    if (this.settings.failOperation === kind) {
      if (kind === 'pay' && this.settings.declinePayment === true)
        throw new PaymentDeclined(
          'The demo payment provider declined this payment.',
        );
      throw new Error(
        `The demo ${kind} provider is unavailable. Disable the simulated outage and retry.`,
      );
    }
    const saved = await this.once(
      'scenarioExternalOperations',
      `${kind}:${key}`,
      { kind, input, result, createdAt: new Date().toISOString() },
    );
    return saved.result as JsonObject;
  }

  public async create(
    key: string,
    values: JsonObject,
    actor: string,
    id: string = randomUUID(),
  ): Promise<LabRecord> {
    const demo = APPROVAL_DEMOS.find((item) => item.key === key);
    if (!demo)
      throw new ExampleError(
        'INVALID',
        'scenario',
        'Choose an approval scenario.',
      );
    const applicantId =
      typeof values.applicantId === 'string'
        ? this.actor(values.applicantId)
        : actor;
    const title =
      typeof values.title === 'string' && values.title.trim()
        ? values.title.trim()
        : demo.title;
    const merged = formValues(demo.values, values);
    let initial: Record<string, unknown>;
    if (demo.lifecycle === 'approvalRequests') {
      if (!object(merged.content))
        throw new ExampleError(
          'INVALID',
          'content',
          'The request content must be an object.',
        );
      initial = draftValues({
        kind: key,
        title,
        applicantId,
        createdBy: actor,
        content: merged.content,
        ...(typeof values.subjectKey === 'string'
          ? { subjectKey: values.subjectKey }
          : {}),
      });
    } else if (demo.lifecycle === 'coordinations') {
      if (!object(merged.content))
        throw new ExampleError(
          'INVALID',
          'content',
          'The request content must be an object.',
        );
      initial = coordinationValues({
        kind: key,
        title,
        applicantId,
        content: merged.content,
      });
    } else {
      if (applicantId !== actor)
        throw new ExampleError(
          'FORBIDDEN',
          'proxy',
          'Create this request as its applicant.',
        );
      const lifecycle = LAB_LIFECYCLES.find(
        (item) => item.name === demo.lifecycle,
      );
      if (!lifecycle)
        throw new ExampleError('INVALID', 'scenario', 'Unknown lifecycle.');
      // Whitelist form fields: a caller cannot inject state, approval results, or effect references.
      initial = Object.fromEntries(
        Object.keys(demo.values).map((field) => [field, merged[field]]),
      );
      if (
        demo.lifecycle === 'authorizationRequests' &&
        initial.supersedes === ''
      )
        initial.supersedes = null;
      Object.assign(
        initial,
        { title },
        demo.lifecycle === 'orders'
          ? { customerId: actor }
          : demo.lifecycle === 'notices'
            ? { title, publisherId: actor }
            : { title, applicantId },
      );
    }
    const created = await this.runtime.create(
      demo.lifecycle,
      { ...initial, id },
      { actor: { id: actor } },
    );
    return this.summary(demo.lifecycle, created.record);
  }

  public async loadSamples(actor: string): Promise<number> {
    if (actor !== 'zhang' && actor !== 'admin')
      throw new ExampleError(
        'FORBIDDEN',
        'samples',
        'Load samples as zhang or admin.',
      );
    let count = 0;
    for (const demo of APPROVAL_DEMOS) {
      const id = `sample:${demo.key}`;
      const lifecycle = LAB_LIFECYCLES.find(
        (item) => item.name === demo.lifecycle,
      );
      if (!lifecycle) continue;
      if (
        await this.database
          .repository(lifecycle.collection)
          .findOne({ filter: { id } })
      )
        continue;
      try {
        await this.create(demo.key, {}, 'zhang', id);
        count += 1;
      } catch (error) {
        if (
          !(await this.database
            .repository(lifecycle.collection)
            .findOne({ filter: { id } }))
        )
          throw error;
      }
    }
    return count;
  }

  private summary(lifecycle: string, row: LifecycleRecord): LabRecord {
    return {
      lifecycle,
      id: text(row.id),
      title: text(
        row.title ??
          row.name ??
          row.subjectId ??
          `${lifecycle} #${text(row.id)}`,
      ),
      status: text(row.status),
      applicantId: text(
        row.applicantId ??
          row.customerId ??
          row.publisherId ??
          row.holderId ??
          row.recipientId ??
          '',
      ),
    };
  }

  public async overview(actor: string): Promise<LabOverview> {
    const services = this.services();
    const records: LabRecord[] = [];
    for (const lifecycle of LAB_LIFECYCLES)
      for (const row of await services.records.list(
        lifecycle.collection,
        () => true,
      ))
        records.push(this.summary(lifecycle.name, row));
    const todos = [];
    for (const box of ['toDo', 'done', 'mine', 'copiedToMe'] as const)
      todos.push(
        ...(await todosFor(
          [approvalTodoSource, acknowledgementTodoSource],
          services,
          this.runtime,
          { person: actor, box },
          new Date(),
        )),
      );
    // Other business lifecycles contribute through their own guards.
    for (const item of records.filter(
      (item) =>
        !['approvalRequests', 'acknowledgements'].includes(item.lifecycle),
    )) {
      const actions = await this.runtime.available(item.lifecycle, item.id, {
        id: actor,
      });
      if (actions.some((action) => action.allowed))
        todos.push({
          lifecycle: item.lifecycle,
          recordId: item.id,
          title: item.title,
          detail: item.status,
          action: actions.find((action) => action.allowed)?.name ?? null,
          box: 'toDo' as const,
          version: 0,
          since: '',
        });
      if (item.applicantId === actor)
        todos.push({
          lifecycle: item.lifecycle,
          recordId: item.id,
          title: item.title,
          detail: item.status,
          action: null,
          box: 'mine' as const,
          version: 0,
          since: '',
        });
    }
    const byId = new Map(
      records.map((item) => [`${item.lifecycle}:${item.id}`, item]),
    );
    const done = new Set(
      todos
        .filter((item) => item.box === 'done')
        .map((item) => `${item.lifecycle}:${item.recordId}`),
    );
    const entries = await this.database
      .repository(LIFECYCLE_EXAMPLE_COLLECTIONS.transitions)
      .findMany({ filter: { actorId: actor }, limit: 10000 });
    for (const entry of entries) {
      if (
        ['$create', 'submit', 'start', 'publish', 'editDraft'].includes(
          text(entry.transition),
        )
      )
        continue;
      const key = `${text(entry.lifecycle)}:${text(entry.recordId)}`;
      const item = byId.get(key);
      if (!item || done.has(key)) continue;
      done.add(key);
      todos.push({
        lifecycle: item.lifecycle,
        recordId: item.id,
        title: item.title,
        detail: item.status,
        action: null,
        box: 'done' as const,
        version: 0,
        since: '',
      });
    }
    return {
      people: this.overviewPeople(),
      records: records.reverse(),
      todos,
      messages: (
        await this.database.repository('scenarioMessages').findMany({
          filter: { recipientId: actor },
          sort: (sort) => sort.field('id').desc(),
          limit: 100,
        })
      ).map(record),
      operations: (
        await this.database
          .repository('scenarioExternalOperations')
          .findMany({ sort: (sort) => sort.field('id').desc(), limit: 100 })
      ).map(record),
      settings: this.settings,
    };
  }

  /** The active example identities with their current manager and roles. */
  public overviewPeople(): LabPerson[] {
    const snapshot = this.snapshot();
    return snapshot.people
      .filter((id) => this.org.isActive(id))
      .map((id) => ({
        id,
        manager: this.org.managerOf(id) ?? null,
        roles: Object.keys(snapshot.roles ?? {}).filter((role) =>
          this.org.hasRole(id, role),
        ),
      }));
  }

  public async saveSettings(values: JsonObject, actor: string): Promise<void> {
    if (!this.org.hasRole(actor, 'approvalAdmin'))
      throw new ExampleError(
        'FORBIDDEN',
        'adminOnly',
        'Only the demo approval administrator can configure the lab.',
      );
    // Validate before publishing to either the database or the runtime.
    this.validateSettings(values);
    const repository = this.database.repository('scenarioDemoSettings');
    const existing = await repository.findOne({ filter: { key: 'settings' } });
    if (existing)
      await repository.updateMany({
        filter: { key: 'settings' },
        values: { value: values },
      });
    else
      await repository.createOne({
        values: { key: 'settings', value: values },
      });
    this.applySettings(values);
  }

  private validateSettings(values: JsonObject): void {
    if (
      values.roles !== undefined &&
      (!object(values.roles) ||
        Object.entries(values.roles).some(
          ([role, holders]) =>
            !Object.hasOwn(LAB_ORG.roles ?? {}, role) ||
            !Array.isArray(holders) ||
            holders.some(
              (id) => typeof id !== 'string' || !LAB_ORG.people.includes(id),
            ) ||
            (role === 'approvalAdmin' && !holders.includes('admin')),
        ))
    )
      throw new ExampleError(
        'INVALID',
        'settings',
        'Roles must contain example identities and keep admin as an approval administrator.',
      );
    if (
      values.failOperation !== undefined &&
      (typeof values.failOperation !== 'string' ||
        ![
          '',
          'pay',
          'checkCompany',
          'createSupplierAccount',
          'runOnboardingStep',
          'rollBackPreparation',
        ].includes(values.failOperation))
    )
      throw new ExampleError(
        'INVALID',
        'settings',
        'Choose a supported simulated provider.',
      );
    if (
      values.managers !== undefined &&
      (!object(values.managers) ||
        Object.entries(values.managers).some(
          ([id, manager]) =>
            !LAB_ORG.people.includes(id) ||
            typeof manager !== 'string' ||
            !LAB_ORG.people.includes(manager) ||
            manager === id,
        ))
    )
      throw new ExampleError(
        'INVALID',
        'settings',
        'Managers must name distinct example identities.',
      );
    if (object(values.managers))
      for (const id of LAB_ORG.people) {
        const visited = new Set<string>();
        let current: string | undefined = id;
        while (current !== undefined) {
          if (visited.has(current))
            throw new ExampleError(
              'INVALID',
              'settings',
              'The manager hierarchy must not contain a cycle.',
            );
          visited.add(current);
          current =
            text(
              values.managers[current] ?? LAB_ORG.managers?.[current] ?? '',
            ) || undefined;
        }
      }
    if (
      values.inactive !== undefined &&
      (!Array.isArray(values.inactive) ||
        values.inactive.some(
          (id) =>
            typeof id !== 'string' ||
            !LAB_ORG.people.includes(id) ||
            id === 'admin',
        ))
    )
      throw new ExampleError(
        'INVALID',
        'settings',
        'Inactive identities must be demo people; keep admin active.',
      );
    if (values.versions !== undefined && !object(values.versions))
      throw new ExampleError(
        'INVALID',
        'settings',
        'Policy versions must be an object.',
      );
    const registry = new PolicyRegistry(labPolicies());
    for (const [kind, version] of Object.entries(
      object(values.versions) ? values.versions : {},
    )) {
      if (
        typeof version !== 'string' ||
        !registry.has(kind) ||
        !(version in registry.get(kind).versions)
      )
        throw new ExampleError(
          'INVALID',
          'settings',
          'Choose an existing policy version.',
        );
    }
    if (
      values.delegations !== undefined &&
      (!Array.isArray(values.delegations) ||
        values.delegations.some(
          (item) =>
            !object(item) ||
            typeof item.from !== 'string' ||
            typeof item.to !== 'string' ||
            !LAB_ORG.people.includes(item.from) ||
            !LAB_ORG.people.includes(item.to) ||
            item.from === item.to ||
            typeof item.start !== 'string' ||
            typeof item.end !== 'string' ||
            !Number.isFinite(Date.parse(item.start)) ||
            !Number.isFinite(Date.parse(item.end)) ||
            item.start >= item.end ||
            !Array.isArray(item.kinds) ||
            item.kinds.some((kind) => typeof kind !== 'string'),
        ))
    )
      throw new ExampleError(
        'INVALID',
        'settings',
        'Delegations need valid identities, dates and request kinds.',
      );
  }

  private snapshot(): OrgSnapshot {
    return {
      ...LAB_ORG,
      roles: {
        ...LAB_ORG.roles,
        ...(object(this.settings.roles)
          ? (this.settings.roles as Record<string, string[]>)
          : {}),
      },
      managers: {
        ...LAB_ORG.managers,
        ...(object(this.settings.managers)
          ? (this.settings.managers as Record<string, string>)
          : {}),
      },
    };
  }

  private applySettings(values: JsonObject): void {
    this.settings = values;
    this.org = new OrgDirectory(this.snapshot());
    for (const id of Array.isArray(values.inactive) ? values.inactive : [])
      if (typeof id === 'string') this.org.deactivate(id);
    for (const item of Array.isArray(values.delegations)
      ? values.delegations
      : [])
      if (object(item))
        this.org.delegate({
          ...item,
          createdAt: text(item.createdAt ?? new Date().toISOString()),
          coversExisting: item.coversExisting === true,
        } as unknown as Delegation);
    this.policies = new PolicyRegistry(labPolicies());
    for (const [kind, version] of Object.entries(
      object(values.versions) ? values.versions : {},
    ))
      this.policies.publish(kind, text(version));
  }

  public async sweep(runLifecycleTriggers: boolean = true): Promise<number> {
    const services = this.services();
    const due = await executeDuePayments(this.runtime, services, new Date());
    const expired = await expireDueGrants(this.runtime, services, new Date());
    return (
      (runLifecycleTriggers ? await this.runtime.runTriggers() : 0) +
      due.executed.length +
      expired.expired.length
    );
  }

  /** Explicit test event simulator; the caller is still a signed-in demo administrator. */
  public async simulate(
    name: string,
    id: RecordId,
    transition: string,
    input: JsonObject,
    version: number,
    actor: string,
  ): Promise<void> {
    if (!this.org.hasRole(actor, 'approvalAdmin'))
      throw new ExampleError(
        'FORBIDDEN',
        'adminOnly',
        'Only the demo administrator may simulate external events.',
      );
    const permitted: Record<string, readonly string[]> = {
      orders: ['markReady', 'paymentSucceeded', 'refundSucceeded'],
      supplierOnboardings: ['depositReceived'],
      approvalRequests: ['escalate', 'unclaimStale'],
    };
    if (!permitted[name]?.includes(transition))
      throw new ExampleError(
        'FORBIDDEN',
        'event',
        'Choose a supported demo event.',
      );
    await this.runtime.fire(name, id, transition, {
      actor: SYSTEM_ACTOR,
      input: { ...input, demoOperator: actor },
      expect: { version },
    });
  }
}
