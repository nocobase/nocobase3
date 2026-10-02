import {
  defineEffect,
  defineLifecycle,
  LifecycleError,
  type EffectDefinition,
  type Lifecycle,
  type LifecycleRecord,
  type TransitionContext,
} from '@nocobase/lifecycle';

import {
  validateDataRequest,
  type DataRequestForm,
} from '../../shared/data-request.js';
import { DATA_REQUEST_ROLES } from '../../shared/people.js';
import { nextWorkday } from '../calendar.js';
import { COLLECTIONS } from '../scope.js';
import { idOf, people, type OfficeStore } from '../services/store.js';
import { text } from '../../shared/text.js';

export type DataRequestState =
  | 'draft'
  | 'level1Review'
  | 'level2Review'
  | 'level3Review'
  | 'accepting'
  | 'completed'
  | 'exited';

export interface DataRequest extends LifecycleRecord {
  readonly number: string;
  readonly applicantId: string;
  readonly subject: string;
  readonly frequency: string;
  readonly deliveryDate: string | null;
  readonly approverId: string | null;
  readonly acceptedAt: string | null;
  readonly status: DataRequestState;
}

export interface OfficeServices {
  readonly store: OfficeStore;
}

export interface DataRequestTypes {
  record: DataRequest;
  state: DataRequestState;
  services: OfficeServices;
}

type Context = TransitionContext<DataRequestTypes>;

const NEXT_APPROVER: Partial<Record<DataRequestState, string>> = {
  level1Review: DATA_REQUEST_ROLES.level2,
  level2Review: DATA_REQUEST_ROLES.level3,
  level3Review: DATA_REQUEST_ROLES.acceptor,
};

/** The stored record read back as the form it was filled in from. */
export function formOf(record: Record<string, unknown>): DataRequestForm {
  const str = (value: unknown): string =>
    typeof value === 'string' ? value : '';
  const number = (value: unknown): number | null =>
    value === null || value === undefined ? null : Number(value);
  const flag = (value: unknown): boolean | null =>
    value === null || value === undefined ? null : Boolean(value);
  return {
    subject: str(record.subject),
    reason: str(record.reason),
    volume: str(record.volume),
    frequency: str(record.frequency) as DataRequestForm['frequency'],
    deliveryDate: str(record.deliveryDate),
    firstUseDate: str(record.firstUseDate),
    lastDeliveryDate: str(record.lastDeliveryDate),
    quarterDay: number(record.quarterDay),
    monthDay: number(record.monthDay),
    weekDay: number(record.weekDay),
    frequencyNote: str(record.frequencyNote),
    scope: str(record.scope) as DataRequestForm['scope'],
    consumers: people(record.consumers),
    fileShieldAccepted: flag(record.fileShieldAccepted),
    fileShieldScope: str(record.fileShieldScope),
    fileShieldCopy: flag(record.fileShieldCopy),
    fileShieldValidUntil: str(record.fileShieldValidUntil),
    ndaFiles: people(record.ndaFiles),
    securityFiles: people(record.securityFiles),
  };
}

function isApprover({ record, actor }: Context): boolean {
  return actor.id === record.approverId;
}

function isAcceptor({ record, actor }: Context): boolean {
  return (
    record.status === 'accepting' && actor.id === DATA_REQUEST_ROLES.acceptor
  );
}

function reasonRequired(input: Record<string, unknown>): string | null {
  return typeof input.reason === 'string' && input.reason.trim()
    ? null
    : 'Give a reason.';
}

/**
 * A one-time request gets its single extraction task as soon as it reaches
 * acceptance, dated on its delivery date or the next workday after it.
 */
export const createOneTimeExtraction: EffectDefinition<DataRequestTypes> =
  defineEffect<DataRequestTypes>({
    name: 'dataRequests.createOneTimeExtraction',
    retry: { attempts: 3, backoffMs: 1_000 },
    async run({ record, services }) {
      if (record.frequency !== 'once' || !record.deliveryDate)
        return { skipped: true };
      const calendar = await services.store.calendar();
      const created = await services.store.createExtraction({
        requestId: idOf(record.id),
        periodKey: 'once',
        origin: 'once',
        scheduledDate: nextWorkday(record.deliveryDate, calendar),
        topic: `${record.subject}（一次性）`,
        requirement: '',
        executorIds: DATA_REQUEST_ROLES.executors,
      });
      return { created: created?.number ?? null };
    },
  });

/**
 * A data usage request: three levels of managers, then acceptance, where the
 * extraction tasks are created and followed. Acceptance cannot return the
 * request once any task exists, and cannot finish while one is open.
 */
export const dataRequestLifecycle: Lifecycle<DataRequestTypes> =
  defineLifecycle<DataRequestTypes>({
    name: 'dataRequests',
    collection: COLLECTIONS.dataRequests,
    initial: 'draft',
    states: [
      'draft',
      'level1Review',
      'level2Review',
      'level3Review',
      'accepting',
      { name: 'completed', final: true },
      { name: 'exited', final: true },
    ],
    transitions: {
      submit: {
        title: '提交',
        from: 'draft',
        to: 'level1Review',
        guard: ({ record, actor }) => actor.id === record.applicantId,
        set: ({ record }) => {
          const errors = validateDataRequest(formOf(record));
          if (Object.keys(errors).length)
            throw new LifecycleError(
              'INVALID_INPUT',
              Object.values(errors).join('；'),
            );
          return { approverId: DATA_REQUEST_ROLES.level1, returnReason: null };
        },
      },
      approve: {
        title: '同意',
        from: ['level1Review', 'level2Review', 'level3Review'],
        to: ['level2Review', 'level3Review', 'accepting'],
        route: ({ record }) =>
          record.status === 'level1Review'
            ? 'level2Review'
            : record.status === 'level2Review'
              ? 'level3Review'
              : 'accepting',
        guard: isApprover,
        set: ({ record, now }) => ({
          approverId: NEXT_APPROVER[record.status] ?? null,
          ...(record.status === 'level3Review' && !record.acceptedAt
            ? { acceptedAt: now.toISOString() }
            : {}),
        }),
      },
      returnToApplicant: {
        title: '退回申请人',
        from: ['level1Review', 'level2Review', 'level3Review'],
        to: 'draft',
        guard: isApprover,
        validate: reasonRequired,
        set: ({ input }) => ({
          approverId: null,
          returnReason: text(input.reason),
        }),
      },
      acceptanceReturn: {
        title: '返回申请人',
        from: 'accepting',
        to: 'draft',
        // Not once any extraction task exists, running or finished.
        guard: async (context) =>
          isAcceptor(context) &&
          (await context.services.store.countExtractions(context.record.id, [
            'pending',
            'completed',
          ])) === 0,
        validate: reasonRequired,
        set: ({ input }) => ({
          approverId: null,
          returnReason: text(input.reason),
        }),
      },
      complete: {
        title: '提交办结',
        from: 'accepting',
        to: 'completed',
        // Not while an extraction task is still open.
        guard: async (context) =>
          isAcceptor(context) &&
          (await context.services.store.countExtractions(context.record.id, [
            'pending',
          ])) === 0,
        set: () => ({ approverId: null }),
      },
      exit: {
        title: '退出审批',
        from: 'accepting',
        to: 'exited',
        guard: isAcceptor,
        set: () => ({ approverId: null }),
      },
    },
    onEnter: { accepting: [createOneTimeExtraction] },
  });
