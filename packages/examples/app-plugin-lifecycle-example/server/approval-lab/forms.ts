import { text } from '../../shared/text.js';
import { randomUUID } from 'node:crypto';
import type { JsonObject, LifecycleRecord } from '@nocobase/lifecycle';
import {
  assigneeTasks,
  currentStage,
  type ApprovalTrail,
} from '../../shared/approval-trail.js';
import type { ApprovalRequest } from '../approval-scenarios/approval/lifecycle.js';
import { contentHash } from '../approval-scenarios/approval/model.js';
import {
  sheetHash,
  type Reimbursement,
} from '../approval-scenarios/reimbursement.js';

/** Input forms include the hashes of the content the actor is looking at. */
export function actionForms(
  lifecycle: string,
  record: LifecycleRecord,
  actor: string,
  trail: ApprovalTrail | null = null,
): Record<string, JsonObject> {
  const forms: Record<string, JsonObject> = {
    approve: { comment: '' },
    reject: { comment: '', reason: '' },
    cancel: { reason: '' },
    withdraw: {},
    submit: {},
    start: {},
    publish: {},
    returnTo: { target: 'applicant', reason: '' },
    transfer: { to: '', reason: '' },
    addSigner: { userId: '', mode: 'parallel' },
    reassign: { from: '', to: '', reason: '', override: false },
    assign: { to: '' },
    requestMaterials: { request: '' },
    supplyMaterials: { answer: '', attachments: [] },
    consult: { expertId: '', question: '' },
    answerConsultation: { id: '', opinion: '' },
    migrateRules: { version: 'v2', reason: '' },
    revoke: { reason: '' },
    requestReapproval: { reason: '' },
    terminate: { reason: '' },
    schedule: { executeAt: new Date(Date.now() + 60000).toISOString() },
    markReady: {},
    paymentSucceeded: {
      paymentRef: `DEMO-${randomUUID()}`,
      occurredAt: new Date().toISOString(),
    },
    refundSucceeded: { refundRef: `DEMO-REFUND-${randomUUID()}` },
    depositReceived: {
      depositRef: `DEMO-DEPOSIT-${randomUUID()}`,
      amountCents: 1000000,
    },
    legalReject: { reason: '' },
    riskReject: { reason: '' },
    verifyManually: { risk: 'low', reason: '' },
    recheck: { registrationNo: text(record.registrationNo ?? '') },
    consume: {
      amountCents: 10000,
      usageKey: randomUUID(),
      subjectId: text(record.subjectId ?? ''),
      subjectRevision: Number(record.subjectRevision ?? 1),
    },
    comment: { text: '' },
  };
  if (lifecycle === 'approvalRequests') {
    const request = record as ApprovalRequest;
    const stage = trail ? currentStage(trail) : undefined;
    const consultation = trail?.stages
      .flatMap((each) => each.consultations)
      .find((item) => item.assigneeId === actor && item.status === 'pending');
    forms.decide = {
      decision: 'approve',
      comment: '',
      contentHash: contentHash(request.content),
    };
    forms.editDraft = { content: request.content };
    forms.submit = {};
    forms.revise = { content: request.content };
    forms.answerConsultation = { id: consultation?.id ?? '', opinion: '' };
    forms.reassign = {
      from: stage ? (assigneeTasks(stage)[0]?.assigneeId ?? '') : '',
      to: '',
      reason: '',
      override: false,
    };
  }
  if (lifecycle === 'coordinations')
    forms.revise = { content: record.content as JsonObject };
  if (lifecycle === 'reimbursements') {
    const reimbursement = record as Reimbursement;
    const line =
      reimbursement.lines.find(
        (item) => item.approverId === actor && item.decision === null,
      ) ?? reimbursement.lines[0];
    forms.decideLine = {
      lineId: line?.id ?? '',
      outcome: 'approved',
      contentHash: line?.contentHash ?? '',
      approvedCents: line?.amountCents ?? 0,
      comment: '',
    };
    forms.decideSheet = {
      outcome: 'approved',
      sheetHash: sheetHash(reimbursement.lines),
    };
    forms.resubmit = {
      lines: reimbursement.lines.map((item) => ({
        id: item.id,
        category: item.category,
        description: item.description,
        amountCents: item.amountCents,
      })),
    };
  }
  if (lifecycle === 'authorizationRequests')
    forms.approve = { limitCents: (record.requested as JsonObject).limitCents };
  return forms;
}
