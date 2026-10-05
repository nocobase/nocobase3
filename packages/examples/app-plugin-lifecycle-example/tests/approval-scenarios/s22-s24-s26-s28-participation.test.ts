// Scenarios 22 (submitting for someone else), 24 (a candidate pool), 26
// (asking for material and opinions) and the exclusivity part of 28.
import { describe, expect, it } from 'vitest';

import {
  active,
  approvalHarness,
  assignees,
  decide,
  draft,
  request,
  stages,
  submitted,
  trail,
  versionOf,
} from './approval-fixtures.js';

describe('scenario 22: submitting for someone else', () => {
  it('an assistant drafts and submits for zhang; zhang’s manager decides', async () => {
    const h = approvalHarness();
    const r = await draft(h, 'travel', { city: 'Shenzhen' }, 'zhang', {
      createdBy: 'assistant',
    });
    await h.fire('approvalRequests', r.id, 'submit', {}, 'assistant');
    const sent = request(h, r.id);
    expect(sent).toMatchObject({
      applicantId: 'zhang',
      createdBy: 'assistant',
      submittedBy: 'assistant',
    });
    expect(await assignees(h, r.id)).toEqual(['li']);
    await decide(h, r.id, 'li');
    // Both the beneficiary and the submitter hear the outcome.
    expect(h.messagesTo('zhang')).toContain('travel of zhang: approved');
    expect(h.messagesTo('assistant')).toContain('travel of zhang: approved');
  });

  it('someone with no proxy right cannot submit for zhang', async () => {
    const h = approvalHarness();
    const r = await draft(h, 'travel', {}, 'zhang', { createdBy: 'zhao' });
    await expect(
      h.fire('approvalRequests', r.id, 'submit', {}, 'zhao'),
    ).rejects.toMatchObject({
      blockers: [expect.objectContaining({ code: 'notApplicant' })],
    });
  });

  it('a kind without proxy submission refuses even a listed proxy', async () => {
    const h = approvalHarness();
    const r = await draft(h, 'leaveTiered', { days: 1 }, 'zhang', {
      createdBy: 'assistant',
    });
    await expect(
      h.fire('approvalRequests', r.id, 'submit', {}, 'assistant'),
    ).rejects.toMatchObject({
      code: 'GUARD_REJECTED',
    });
  });

  it('the submitter may withdraw; self-approval is judged against the beneficiary', async () => {
    const h = approvalHarness();
    const r = await draft(h, 'travel', {}, 'li', { createdBy: 'li' });
    await h.fire('approvalRequests', r.id, 'submit', {}, 'li');
    // li's request goes to wang, never to li.
    expect(await assignees(h, r.id)).toEqual(['wang']);
  });

  it('the proxy who submitted can withdraw', async () => {
    const h = approvalHarness();
    const r = await draft(h, 'travel', {}, 'zhang', { createdBy: 'assistant' });
    await h.fire('approvalRequests', r.id, 'submit', {}, 'assistant');
    expect(
      (await h.fire('approvalRequests', r.id, 'withdraw', {}, 'assistant'))
        .status,
    ).toBe('draft');
  });
});

describe('scenario 24: a candidate pool', () => {
  it('whoever takes it decides; the others cannot', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'financePool', {});
    expect((await active(h, r.id))?.candidates).toEqual([
      'finA',
      'finB',
      'finC',
    ]);
    await expect(decide(h, r.id, 'finA')).rejects.toMatchObject({
      blockers: [expect.objectContaining({ code: 'claimFirst' })],
    });
    await h.fire('approvalRequests', r.id, 'claim', {}, 'finA');
    await expect(
      h.fire('approvalRequests', r.id, 'claim', {}, 'finB'),
    ).rejects.toMatchObject({
      blockers: [expect.objectContaining({ code: 'taken' })],
    });
    await expect(decide(h, r.id, 'finB')).rejects.toMatchObject({
      code: 'GUARD_REJECTED',
    });
    expect((await decide(h, r.id, 'finA')).status).toBe('approved');
  });

  it('two people taking it at once: one gets it', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'financePool', {});
    const seen = versionOf(r);
    await h.fire('approvalRequests', r.id, 'claim', {}, 'finA', {
      expect: { version: seen },
    });
    await expect(
      h.fire('approvalRequests', r.id, 'claim', {}, 'finB', {
        expect: { version: seen },
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('put back, assigned by the supervisor, and returned to the pool when left idle', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'financePool', {});
    await h.fire('approvalRequests', r.id, 'claim', {}, 'finA');
    await h.fire('approvalRequests', r.id, 'release', {}, 'finA');
    await h.fire('approvalRequests', r.id, 'assign', { to: 'finC' }, 'sup');
    expect((await active(h, r.id))?.claimedBy).toBe('finC');
    h.advance({ hours: 25 });
    await h.runtime.runTriggers();
    expect((await active(h, r.id))?.claimedBy).toBeNull();
    expect((await active(h, r.id))?.notes.at(-1)).toBe(
      'finC left it idle; back in the pool.',
    );
  });

  it('only the supervisor assigns, and only to an active pool member', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'financePool', {});
    await expect(
      h.fire('approvalRequests', r.id, 'assign', { to: 'finB' }, 'finA'),
    ).rejects.toMatchObject({ code: 'GUARD_REJECTED' });
    h.org.deactivate('finB');
    await expect(
      h.fire('approvalRequests', r.id, 'assign', { to: 'finB' }, 'sup'),
    ).rejects.toMatchObject({
      blockers: [expect.objectContaining({ code: 'notCandidate' })],
    });
  });
});

describe('scenario 26: material and opinions', () => {
  it('asks counsel; the decision waits for the opinion, and counsel cannot decide', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'consulted', {});
    await h.fire(
      'approvalRequests',
      r.id,
      'consult',
      { expertId: 'lawyer', question: 'Is clause 7 enforceable?' },
      'legalA',
    );
    await expect(decide(h, r.id, 'legalA')).rejects.toMatchObject({
      blockers: [expect.objectContaining({ code: 'consultationOpen' })],
    });
    await expect(decide(h, r.id, 'lawyer')).rejects.toMatchObject({
      code: 'GUARD_REJECTED',
    });
    // The question is the lawyer's own to-do, with an id to answer it by.
    const asked = (await active(h, r.id))?.consultations[0];
    expect(asked).toMatchObject({
      kind: 'consult',
      status: 'pending',
      assigneeId: 'lawyer',
      requestedBy: 'legalA',
    });
    await h.fire(
      'approvalRequests',
      r.id,
      'answerConsultation',
      { id: asked?.id ?? '', opinion: 'Yes, with changes' },
      'lawyer',
    );
    const done = await decide(h, r.id, 'legalA');
    expect(done.status).toBe('approved');
    expect((await stages(h, r.id))[0].consultations[0]).toMatchObject({
      assigneeId: 'lawyer',
      status: 'completed',
      comment: 'Yes, with changes',
      requestedBy: 'legalA',
    });
  });

  it('asks the applicant for an attachment without returning the request', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'leaveTiered', { days: 5 });
    await decide(h, r.id, 'li');
    await h.fire(
      'approvalRequests',
      r.id,
      'requestMaterials',
      { request: 'Attach the doctor’s note' },
      'wang',
    );
    expect(request(h, r.id).status).toBe('awaitingMaterials');
    await expect(
      h.fire(
        'approvalRequests',
        r.id,
        'supplyMaterials',
        { answer: 'Here', content: { days: 2 } },
        'zhang',
      ),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await h.fire(
      'approvalRequests',
      r.id,
      'supplyMaterials',
      { answer: 'Here', attachments: ['note.pdf'] },
      'zhang',
    );
    const back = request(h, r.id);
    // Same stage, same content, earlier approval intact.
    expect(back).toMatchObject({ status: 'inReview', revision: 0 });
    expect((await active(h, r.id))?.key).toBe('deptManager');
    expect((await stages(h, r.id))[0].status).toBe('approved');
    expect((await trail(h, r.id)).materials[0]).toMatchObject({
      kind: 'supply',
      status: 'completed',
      assigneeId: 'zhang',
      requestedBy: 'wang',
      prompt: 'Attach the doctor’s note',
      comment: 'Here',
      attachments: ['note.pdf'],
    });
    // Back to wang's turn once the note came.
    expect((await active(h, r.id))?.tasks.map((task) => task.status)).toEqual([
      'pending',
    ]);
  });

  it('limitation: the deadline restarts whenever anything happens on the request', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'leaveAtSubmit', { days: 1 });
    await decide(h, r.id, 'li');
    h.advance({ hours: 70 });
    // Asking an opinion is a self-transition; it stamps statusChangedAt.
    await h.fire(
      'approvalRequests',
      r.id,
      'consult',
      { expertId: 'lawyer', question: '?' },
      'li',
    );
    h.advance({ hours: 5 });
    expect(await h.runtime.runTriggers()).toBe(0);
  });
});

describe('scenario 28: one open request per subject and matter', () => {
  it('refuses a duplicate on the same matter while one is under review', async () => {
    const h = approvalHarness();
    const first = await draft(h, 'contractMatter', {}, 'zhang', {
      subjectKey: 'contract:42:priceException',
    });
    await h.fire('approvalRequests', first.id, 'submit', {}, 'zhang');
    const second = await draft(h, 'contractMatter', {}, 'zhang', {
      subjectKey: 'contract:42:priceException',
    });
    await expect(
      h.fire('approvalRequests', second.id, 'submit', {}, 'zhang'),
    ).rejects.toMatchObject({
      blockers: [expect.objectContaining({ code: 'subjectBusy' })],
    });
    // Another matter on the same contract proceeds alongside.
    const other = await draft(h, 'contractMatter', {}, 'zhang', {
      subjectKey: 'contract:42:paymentTerms',
    });
    expect(
      (await h.fire('approvalRequests', other.id, 'submit', {}, 'zhang'))
        .status,
    ).toBe('inReview');
    // Once the first settles, the duplicate may go.
    await decide(h, first.id, 'li');
    expect(
      (await h.fire('approvalRequests', second.id, 'submit', {}, 'zhang'))
        .status,
    ).toBe('inReview');
  });
});
