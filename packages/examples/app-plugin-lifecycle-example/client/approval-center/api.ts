import { useApiClient, type ApiClient } from '@nocobase/app-client';
import {
  createLifecycleHook,
  type JsonObject,
  type UseRecordLifecycle,
} from '@nocobase/lifecycle/react';

import type {
  CenterOverview,
  CenterPreview,
} from '../../shared/approval-center.js';
import type { LabRecord } from '../../shared/approval-lab.js';
import type { ApprovalTrail } from '../../shared/approval-trail.js';
import { useLoader } from '../lib/use-loader.js';

/** The approval lab's routes: the center reads and acts on the same records. */
export const CENTER_BASE = 'lifecycle-example/approval-lab';

export const useCenterLifecycle: UseRecordLifecycle = createLifecycleHook({
  useTransport: useApiClient,
  basePath: `${CENTER_BASE}/lifecycles`,
});

/** The transition that sends a new request on its way, by lifecycle. */
export const START_TRANSITION: Readonly<Record<string, string>> = {
  approvalRequests: 'submit',
  coordinations: 'start',
  reimbursements: 'submit',
  paymentRequests: 'submit',
  authorizationRequests: 'submit',
  notices: 'publish',
  leaveRequests: 'submit',
};

export interface CenterData {
  readonly data: CenterOverview | undefined;
  readonly error: string;
  readonly reload: () => Promise<void>;
}

/** Every request and the person's to-do center, refreshed while the page is open. */
export function useCenter(actor: string): CenterData {
  const client = useApiClient();
  return useLoader(
    () =>
      client.request<CenterOverview>({
        path: `${CENTER_BASE}/center`,
        query: { actAs: actor },
      }),
    `approval-center:${actor}`,
  );
}

export interface CenterApi {
  create(
    key: string,
    values: JsonObject,
    actor: string,
    submit: boolean,
  ): Promise<LabRecord>;
  forms(
    lifecycle: string,
    id: string,
    actor: string,
  ): Promise<Record<string, JsonObject>>;
  preview(
    key: string,
    content: JsonObject,
    applicantId: string,
    actor: string,
  ): Promise<CenterPreview>;
  /** A staged approval's stages, to-dos and handling log. */
  trail(id: string, actor: string): Promise<ApprovalTrail>;
  simulate(
    lifecycle: string,
    id: string,
    transition: string,
    input: JsonObject,
    version: number | null,
    actor: string,
  ): Promise<void>;
  loadSamples(actor: string): Promise<void>;
}

export function centerApi(client: ApiClient): CenterApi {
  return {
    create: async (key, values, actor, submit) => {
      const created = await client.request<LabRecord>({
        method: 'POST',
        path: `${CENTER_BASE}/create/${key}`,
        query: { actAs: actor },
        json: values,
      });
      const transition = START_TRANSITION[created.lifecycle];
      if (submit && transition && created.status !== 'legalReview')
        await client.request({
          method: 'POST',
          path: `${CENTER_BASE}/lifecycles/${created.lifecycle}/${encodeURIComponent(created.id)}/fire`,
          query: { actAs: actor },
          json: { transition, input: {} },
        });
      return created;
    },
    forms: (lifecycle, id, actor) =>
      client.request<Record<string, JsonObject>>({
        path: `${CENTER_BASE}/forms/${lifecycle}/${encodeURIComponent(id)}`,
        query: { actAs: actor },
      }),
    preview: (key, content, applicantId, actor) =>
      client.request<CenterPreview>({
        method: 'POST',
        path: `${CENTER_BASE}/center/preview/${key}`,
        query: { actAs: actor },
        json: { content, applicantId },
      }),
    trail: (id, actor) =>
      client.request<ApprovalTrail>({
        path: `${CENTER_BASE}/approvals/${encodeURIComponent(id)}`,
        query: { actAs: actor },
      }),
    simulate: async (lifecycle, id, transition, input, version, actor) => {
      await client.request({
        method: 'POST',
        path: `${CENTER_BASE}/events/${lifecycle}/${encodeURIComponent(id)}`,
        query: { actAs: actor },
        json: { transition, input, version },
      });
    },
    loadSamples: async (actor) => {
      await client.request({
        method: 'POST',
        path: `${CENTER_BASE}/samples`,
        query: { actAs: actor },
      });
    },
  };
}
