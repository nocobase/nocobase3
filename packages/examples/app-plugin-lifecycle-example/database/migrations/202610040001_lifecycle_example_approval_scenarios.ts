import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202610040001_lifecycle_example_approval_scenarios',
  async up({ builder }) {
    await builder.createCollection('scenarioLeaveRequests', (table) => {
      table.string('id').primary().notNull();
      table.string('title');
      table.string('status').notNull();
      table.datetimeTz('statusChangedAt').notNull();
      table.integer('lifecycleVersion').notNull().defaultTo(0);
      table.index(['status', 'statusChangedAt']);
      table.string('applicantId');
      table.string('approverId');
      table.string('decidedBy');
      table.string('registrationRef');
      table.text('reason');
      table.text('decisionComment');
      table.integer('days');
      table.index(['applicantId', 'id']);
    });

    await builder.createCollection('scenarioApprovalRequests', (table) => {
      table.string('id').primary().notNull();
      table.string('status').notNull();
      table.datetimeTz('statusChangedAt').notNull();
      table.integer('lifecycleVersion').notNull().defaultTo(0);
      table.index(['status', 'statusChangedAt']);
      table.string('kind');
      table.string('title');
      table.string('applicantId');
      table.string('createdBy');
      table.string('submittedBy');
      table.string('subjectKey');
      table.string('ruleVersion');
      table.string('parentLifecycle');
      table.string('parentId');
      table.integer('round');
      table.integer('revision');
      table.integer('sequence').notNull().defaultTo(0);
      table.string('contentHash');
      table.datetimeTz('submittedAt');
      table.string('currentStageId');
      table.json('content');
      table.datetimeTz('outcomeAt');
      table.string('outcomeBy');
      table.text('outcomeNote');
      table.index(['applicantId', 'id']);
      table.index(['submittedBy', 'id']);
      table.index(['createdBy', 'id']);
      table.index(['subjectKey', 'id']);
      table.index(['parentId', 'id']);
    });

    // One row per stage per round: the plan a round was submitted under.
    await builder.createCollection('scenarioApprovalStages', (table) => {
      table.string('id').primary().notNull();
      table.string('requestId').notNull();
      table.integer('round').notNull();
      table.integer('seq').notNull();
      table.integer('position').notNull();
      table.string('key').notNull();
      table.string('title');
      table.json('rule').notNull();
      table.json('resolver').notNull();
      table.json('fields');
      table.string('resolveAt').notNull();
      table.boolean('canRevise').notNull().defaultTo(false);
      table.boolean('escalate').notNull().defaultTo(false);
      table.string('qualification');
      table.text('because');
      table.string('status').notNull();
      table.datetimeTz('resolvedAt');
      table.string('basis');
      table.string('keptFrom');
      table.unique(['requestId', 'seq']);
      table.index(['requestId', 'round', 'position']);
    });

    // One row per to-do: a decision, an opinion asked, or material asked for.
    await builder.createCollection('scenarioApprovalTasks', (table) => {
      table.string('id').primary().notNull();
      table.string('requestId').notNull();
      table.string('stageId');
      table.integer('round').notNull();
      table.integer('seq').notNull();
      table.string('kind').notNull();
      table.string('status').notNull();
      table.string('assigneeId').notNull();
      table.string('via').notNull();
      table.string('previousTaskId');
      table.text('note');
      table.string('requestedBy');
      table.text('prompt');
      table.string('decision');
      table.text('comment');
      table.json('attachments');
      table.string('actorId');
      table.integer('revision');
      table.string('contentHash');
      table.datetimeTz('claimedAt');
      table.datetimeTz('createdAt').notNull();
      table.datetimeTz('closedAt');
      table.integer('closedSeq');
      table.text('closeReason');
      table.unique(['requestId', 'seq']);
      table.index(['assigneeId', 'status']);
      table.index(['actorId', 'id']);
      table.index(['stageId', 'seq']);
      table.index(['status', 'id']);
    });

    // How each stage was handled, step by step, tied to the transition it was part of.
    await builder.createCollection('scenarioApprovalLogs', (table) => {
      table.string('id').primary().notNull();
      table.string('requestId').notNull();
      table.integer('round').notNull();
      table.integer('seq').notNull();
      table.string('stageId');
      table.string('taskId');
      table.string('transitionId');
      table.string('kind').notNull();
      table.string('actorId');
      table.string('userId');
      table.text('message');
      table.json('data');
      table.datetimeTz('at').notNull();
      table.unique(['requestId', 'seq']);
      table.index(['transitionId', 'seq']);
    });

    await builder.createCollection('scenarioCoordinations', (table) => {
      table.string('id').primary().notNull();
      table.string('status').notNull();
      table.datetimeTz('statusChangedAt').notNull();
      table.integer('lifecycleVersion').notNull().defaultTo(0);
      table.index(['status', 'statusChangedAt']);
      table.string('kind');
      table.string('title');
      table.string('applicantId');
      table.integer('revision');
      table.json('content');
      table.json('strategy');
      table.json('branches');
      table.json('superseded');
      table.json('notes');
      table.json('attention');
      table.json('lateResults');
      table.json('outcome');
      table.index(['applicantId', 'id']);
    });

    await builder.createCollection('scenarioWorkItems', (table) => {
      table.string('id').primary().notNull();
      table.string('status').notNull();
      table.datetimeTz('statusChangedAt').notNull();
      table.integer('lifecycleVersion').notNull().defaultTo(0);
      table.index(['status', 'statusChangedAt']);
      table.string('title');
      table.string('definition');
      table.string('businessKey');
      table.string('ownerRole');
      table.string('parentLifecycle');
      table.string('parentId');
      table.string('branchKey');
      table.string('rollbackFor');
      table.integer('cursor');
      table.text('lastError');
      table.json('steps');
      table.json('notes');
      table.index(['parentId', 'id']);
    });

    await builder.createCollection('scenarioAcknowledgements', (table) => {
      table.string('id').primary().notNull();
      table.string('status').notNull();
      table.datetimeTz('statusChangedAt').notNull();
      table.integer('lifecycleVersion').notNull().defaultTo(0);
      table.index(['status', 'statusChangedAt']);
      table.string('sourceLifecycle');
      table.string('sourceId');
      table.string('recipientId');
      table.string('title');
      table.string('kind');
      table.boolean('blocking');
      table.integer('reminders');
      table.datetimeTz('deliveredAt');
      table.datetimeTz('readAt');
      table.datetimeTz('confirmedAt');
      table.json('comments');
      table.index(['recipientId', 'id']);
    });

    await builder.createCollection('scenarioNotices', (table) => {
      table.string('id').primary().notNull();
      table.string('status').notNull();
      table.datetimeTz('statusChangedAt').notNull();
      table.integer('lifecycleVersion').notNull().defaultTo(0);
      table.index(['status', 'statusChangedAt']);
      table.string('title');
      table.string('publisherId');
      table.string('mode');
      table.json('recipientIds');
      table.datetimeTz('publishedAt');
      table.datetimeTz('effectiveAt');
    });

    await builder.createCollection('scenarioOrders', (table) => {
      table.string('id').primary().notNull();
      table.string('title');
      table.string('status').notNull();
      table.datetimeTz('statusChangedAt').notNull();
      table.integer('lifecycleVersion').notNull().defaultTo(0);
      table.index(['status', 'statusChangedAt']);
      table.string('customerId');
      table.string('paymentRef');
      table.string('shipmentNo');
      table.string('refundRef');
      table.integer('amountCents');
      table.datetimeTz('paidAt');
    });

    await builder.createCollection('scenarioSupplierOnboardings', (table) => {
      table.string('id').primary().notNull();
      table.string('title');
      table.string('status').notNull();
      table.datetimeTz('statusChangedAt').notNull();
      table.integer('lifecycleVersion').notNull().defaultTo(0);
      table.index(['status', 'statusChangedAt']);
      table.string('name');
      table.string('registrationNo');
      table.string('applicantId');
      table.string('riskLevel');
      table.string('riskReviewerId');
      table.string('legalApprovedBy');
      table.string('depositRef');
      table.string('account');
      table.integer('verificationRound');
      table.integer('depositCents');
      table.datetimeTz('riskCheckedAt');
      table.datetimeTz('legalApprovedAt');
      table.datetimeTz('approvedAt');
      table.text('verificationError');
      table.text('accountError');
      table.json('approvalBasis');
      table.index(['applicantId', 'id']);
    });

    await builder.createCollection('scenarioReimbursements', (table) => {
      table.string('id').primary().notNull();
      table.string('status').notNull();
      table.datetimeTz('statusChangedAt').notNull();
      table.integer('lifecycleVersion').notNull().defaultTo(0);
      table.index(['status', 'statusChangedAt']);
      table.string('title');
      table.string('applicantId');
      table.string('followUpOf');
      table.integer('round');
      table.integer('approvedTotalCents');
      table.json('lines');
      table.json('policy');
      table.json('payments');
      table.text('paymentError');
      table.index(['applicantId', 'id']);
    });

    await builder.createCollection('scenarioPaymentRequests', (table) => {
      table.string('id').primary().notNull();
      table.string('status').notNull();
      table.datetimeTz('statusChangedAt').notNull();
      table.integer('lifecycleVersion').notNull().defaultTo(0);
      table.index(['status', 'statusChangedAt']);
      table.string('title');
      table.string('applicantId');
      table.string('payeeId');
      table.string('budgetCode');
      table.string('executionMode');
      table.string('approverId');
      table.string('approvedBy');
      table.string('failureKind');
      table.string('reservationStatus');
      table.integer('amountCents');
      table.integer('installments');
      table.integer('approvalRound');
      table.integer('paidCents');
      table.integer('installmentsPaid');
      table.integer('reservedCents');
      table.datetimeTz('approvedAt');
      table.datetimeTz('executeAt');
      table.json('submittedSnapshot');
      table.json('approvedSnapshot');
      table.json('paymentRefs');
      table.text('failureError');
      table.index(['applicantId', 'id']);
    });

    await builder.createCollection('scenarioAuthorizationRequests', (table) => {
      table.string('id').primary().notNull();
      table.string('title');
      table.string('status').notNull();
      table.datetimeTz('statusChangedAt').notNull();
      table.integer('lifecycleVersion').notNull().defaultTo(0);
      table.index(['status', 'statusChangedAt']);
      table.string('subjectId');
      table.string('matter');
      table.string('applicantId');
      table.string('supersedes');
      table.string('approverId');
      table.string('grantId');
      table.integer('subjectRevision');
      table.text('reason');
      table.json('requested');
      table.json('approved');
      table.index(['applicantId', 'id']);
      table.index(['subjectId', 'id']);
    });

    await builder.createCollection('scenarioPaymentReservations', (table) => {
      table.bigInt('id').primary().autoIncrement().notNull();
      table.string('requestId').notNull();
      table.string('budgetCode').notNull();
      table.string('kind').notNull();
      table.integer('amountCents').notNull();
      table.string('transitionId').notNull();
      table.datetimeTz('at').notNull();
      table.index(['budgetCode', 'id']);
    });

    await builder.createCollection('scenarioBudgetGrants', (table) => {
      table.string('id').primary().notNull();
      table.string('status').notNull();
      table.datetimeTz('statusChangedAt').notNull();
      table.integer('lifecycleVersion').notNull().defaultTo(0);
      table.index(['status', 'statusChangedAt']);
      table.string('requestId');
      table.string('subjectId');
      table.string('matter');
      table.string('holderId');
      table.string('approvedBy');
      table.string('supersedes');
      table.string('supersededBy');
      table.string('revokedBy');
      table.integer('subjectRevision');
      table.integer('limitCents');
      table.integer('maxUses');
      table.integer('usedCents');
      table.integer('uses');
      table.datetimeTz('validFrom');
      table.datetimeTz('validUntil');
      table.json('usages');
      table.text('revokedReason');
      table.index(['subjectId', 'id']);
      table.index(['holderId', 'id']);
    });

    await builder.createCollection('scenarioMessages', (table) => {
      table.bigInt('id').primary().autoIncrement().notNull();
      table.string('key').notNull().unique();
      table.string('recipientId');
      table.text('subject');
      table.datetimeTz('createdAt');
      table.index(['recipientId', 'id']);
    });

    await builder.createCollection('scenarioExternalOperations', (table) => {
      table.bigInt('id').primary().autoIncrement().notNull();
      table.string('key').notNull().unique();
      table.string('kind');
      table.json('input');
      table.json('result');
      table.datetimeTz('createdAt');
    });

    await builder.createCollection('scenarioDemoSettings', (table) => {
      table.bigInt('id').primary().autoIncrement().notNull();
      table.string('key').notNull().unique();
      table.json('value');
    });
  },
  async down({ builder }) {
    await builder.dropCollection('scenarioDemoSettings');
    await builder.dropCollection('scenarioExternalOperations');
    await builder.dropCollection('scenarioMessages');
    await builder.dropCollection('scenarioBudgetGrants');
    await builder.dropCollection('scenarioPaymentReservations', {
      ifExists: true,
    });
    await builder.dropCollection('scenarioAuthorizationRequests');
    await builder.dropCollection('scenarioPaymentRequests');
    await builder.dropCollection('scenarioReimbursements');
    await builder.dropCollection('scenarioSupplierOnboardings');
    await builder.dropCollection('scenarioOrders');
    await builder.dropCollection('scenarioNotices');
    await builder.dropCollection('scenarioAcknowledgements');
    await builder.dropCollection('scenarioWorkItems');
    await builder.dropCollection('scenarioCoordinations');
    // A database that ran an earlier draft of this migration has no
    // approval stage, task or log tables to drop.
    await builder.dropCollection('scenarioApprovalLogs', { ifExists: true });
    await builder.dropCollection('scenarioApprovalTasks', { ifExists: true });
    await builder.dropCollection('scenarioApprovalStages', { ifExists: true });
    await builder.dropCollection('scenarioApprovalRequests');
    await builder.dropCollection('scenarioLeaveRequests');
  },
});

export default migration;
