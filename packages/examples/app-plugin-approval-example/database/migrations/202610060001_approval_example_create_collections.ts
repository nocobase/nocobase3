import {
  defineMigration,
  type CollectionDefinitionBuilder,
  type MigrationDefinition,
} from '@nocobase/db';

/**
 * The approval example's collections: the lifecycle log its records share,
 * the lab's simulated messages, external operations and settings, and one
 * collection per scenario business with exactly the fields its lifecycle
 * writes. Every business record also carries a display `title` and the
 * form `details` the approval center shows without the lifecycle reading
 * them. The approval layer's runs, tasks and events are
 * `@nocobase/app-plugin-approval`'s own collections.
 *
 * Everything is spelled out here rather than taken from the scenario
 * definitions: a migration has to stay what it was when it was released.
 */
type Table = CollectionDefinitionBuilder;

/** A business record: its key, its state, and what the center shows. */
function record(table: Table): void {
  table.bigInt('id').primary().autoIncrement().notNull();
  table.string('title');
  table.json('details');
  table.string('status').notNull();
  table.datetimeTz('statusChangedAt').notNull();
  table.integer('lifecycleVersion').notNull().defaultTo(0);
  table.index(['status', 'statusChangedAt']);
}

/** A row of a second layer: its key, and the version a conditional update checks. */
function row(table: Table): void {
  table.bigInt('id').primary().autoIncrement().notNull();
  table.integer('rowVersion').notNull().defaultTo(0);
}

/** A request with an applicant and nothing else of its own. */
function simple(table: Table): void {
  record(table);
  table.string('applicantId').notNull();
  table.index(['applicantId', 'id']);
}

const SIMPLE_REQUESTS: readonly string[] = [
  'scenarioCommitteeRequests',
  'scenarioPoolRequests',
  'scenarioLegalReviews',
  'scenarioExpenses',
  'scenarioPaymentApprovals',
];

const migration: MigrationDefinition = defineMigration({
  name: '202610060001_approval_example_create_collections',

  async up({ builder, connection }) {
    // The lifecycle log the example's records share.
    await builder.createCollection('approvalExampleTransitions', (table) => {
      table.bigInt('id').primary().autoIncrement().notNull();
      table.string('lifecycle').notNull();
      table.string('recordId').notNull();
      table.string('transition').notNull();
      // Null on the entry runtime.create() writes.
      table.string('from');
      table.string('to').notNull();
      table.string('actorId').notNull();
      table.json('input').notNull().defaultTo({});
      table.datetimeTz('at').notNull();
      table.integer('version').notNull();
      table.string('requestId');
      table.index(['lifecycle', 'recordId', 'id']);
      table.index(['actorId', 'id']);
      table.unique(['lifecycle', 'recordId', 'version']);
      table.unique(['lifecycle', 'recordId', 'requestId'], {
        ...(connection.capabilities.partialIndexes
          ? { predicate: { requestId: { $notNull: true } } }
          : {}),
      });
    });

    await builder.createCollection('approvalExampleEffectRuns', (table) => {
      table.bigInt('id').primary().autoIncrement().notNull();
      table.bigInt('transitionId').notNull();
      table.string('lifecycle').notNull();
      table.string('recordId').notNull();
      table.string('effect').notNull();
      table.string('status').notNull();
      table.integer('attempts').notNull().defaultTo(0);
      table.integer('maxAttempts').notNull().defaultTo(1);
      table.json('result');
      table.text('error');
      table.datetimeTz('createdAt').notNull();
      table.datetimeTz('updatedAt').notNull();
      table.datetimeTz('claimedAt');
      table.datetimeTz('runAfter');
      table.index(['status', 'id']);
      table.index(['lifecycle', 'recordId', 'id']);
    });

    // The lab: messages sent, simulated external calls, and its settings.
    await builder.createCollection('approvalExampleMessages', (table) => {
      table.bigInt('id').primary().autoIncrement().notNull();
      table.string('key').notNull();
      table.string('recipientId').notNull();
      table.text('subject').notNull();
      table.datetimeTz('createdAt').notNull();
      table.unique(['key']);
      table.index(['recipientId', 'id']);
    });

    await builder.createCollection('approvalExampleOperations', (table) => {
      table.bigInt('id').primary().autoIncrement().notNull();
      table.string('key').notNull();
      table.string('kind').notNull();
      table.json('input').notNull().defaultTo({});
      table.json('result').notNull().defaultTo({});
      table.datetimeTz('createdAt').notNull();
      table.unique(['key']);
    });

    await builder.createCollection('approvalExampleSettings', (table) => {
      table.bigInt('id').primary().autoIncrement().notNull();
      table.string('key').notNull();
      table.json('value').notNull().defaultTo({});
      table.unique(['key']);
    });

    // Scenarios 1–4: leave.
    await builder.createCollection('scenarioLeaveRequests', (table) => {
      simple(table);
      table.integer('days').notNull();
      table.text('reason').notNull();
      table.string('registrationRef');
    });
    await builder.createCollection('scenarioCompensatoryLeaves', (table) => {
      simple(table);
      table.integer('days').notNull();
    });
    await builder.createCollection('scenarioRuledLeaves', (table) => {
      simple(table);
      table.integer('days').notNull();
    });

    // Scenarios 5–8: collaboration.
    await builder.createCollection('scenarioFinanceRequests', (table) => {
      simple(table);
      table.string('mode').notNull();
    });
    await builder.createCollection('scenarioCountersigns', (table) => {
      simple(table);
      table.json('reviewers');
      table.boolean('collect').notNull().defaultTo(false);
    });
    await builder.createCollection('scenarioPurchaseRequests', (table) => {
      simple(table);
      table.integer('amount').notNull();
    });
    for (const name of SIMPLE_REQUESTS)
      await builder.createCollection(name, simple);

    // Scenarios 9, 10 and 19: coordinated requests, their branches and children.
    await builder.createCollection('scenarioCoordinations', (table) => {
      simple(table);
      table.string('kind').notNull();
      table.json('content').notNull().defaultTo({});
      table.integer('revision').notNull().defaultTo(0);
      table.json('strategy');
      table.json('notes').notNull().defaultTo([]);
      table.text('outcomeNote');
      table.string('outcomeBy');
    });
    await builder.createCollection('scenarioBranches', (table) => {
      row(table);
      table.string('parentId').notNull();
      table.integer('enteredVersion').notNull();
      table.string('key').notNull();
      table.string('title').notNull();
      table.string('kind').notNull();
      table.boolean('required').notNull();
      table.string('childLifecycle').notNull();
      table.string('childId').notNull();
      table.string('state').notNull();
      table.string('basis').notNull();
      table.integer('revision').notNull();
      table.text('because');
      table.string('status').notNull();
      table.json('late').notNull().defaultTo([]);
      table.index(['parentId', 'id']);
      table.index(['childLifecycle', 'childId']);
    });
    await builder.createCollection('scenarioCoordinationNotes', (table) => {
      table.bigInt('id').primary().autoIncrement().notNull();
      table.string('parentId').notNull();
      table.text('message').notNull();
      table.index(['parentId', 'id']);
    });
    await builder.createCollection('scenarioBranchReviews', (table) => {
      simple(table);
      table.json('content').notNull().defaultTo({});
      table.json('reviewers').notNull().defaultTo([]);
      table.string('lead');
      table.text('cancelReason');
    });
    await builder.createCollection('scenarioWorkItems', (table) => {
      record(table);
      table.string('definition').notNull();
      table.string('businessKey').notNull();
      table.string('ownerRole').notNull();
      table.json('steps').notNull().defaultTo([]);
      table.integer('cursor');
      table.text('lastError');
      table.string('rollbackFor');
      table.json('notes').notNull().defaultTo([]);
    });

    // Scenarios 11–16 and 21: contracts and responsibility.
    await builder.createCollection('scenarioContracts', (table) => {
      simple(table);
      table.integer('amount').notNull();
    });
    for (const name of [
      'scenarioContractReviews',
      'scenarioContractFullReviews',
    ])
      await builder.createCollection(name, (table) => {
        simple(table);
        table.string('submittedBy');
        table.string('party').notNull();
        table.integer('amount').notNull();
        table.text('terms').notNull();
      });

    // Scenario 17: orders and the payments their provider reports.
    await builder.createCollection('scenarioOrders', (table) => {
      record(table);
      table.string('customerId').notNull();
      table.integer('amountCents').notNull();
      table.datetimeTz('payBy');
      table.string('paymentRef');
      table.string('shipmentNo');
      table.string('refundRef');
      table.index(['customerId', 'id']);
    });
    await builder.createCollection('scenarioOrderPayments', (table) => {
      row(table);
      table.string('eventId').notNull();
      table.string('orderId').notNull();
      table.string('paymentRef').notNull();
      table.datetimeTz('occurredAt').notNull();
      table.string('use').notNull();
      table.index(['orderId', 'id']);
    });

    // Scenario 18: supplier onboarding and its deposits.
    await builder.createCollection('scenarioSuppliers', (table) => {
      simple(table);
      table.string('name').notNull();
      table.string('registrationNo').notNull();
      table.integer('verificationRound').notNull().defaultTo(0);
      table.string('riskLevel');
      table.text('verificationError');
      table.string('legalApprovedBy');
      table.datetimeTz('approvedAt');
      table.json('approvalBasis');
      table.string('depositRef');
      table.string('account');
      table.text('accountError');
    });
    await builder.createCollection('scenarioSupplierDeposits', (table) => {
      row(table);
      table.string('eventId').notNull();
      table.string('supplierId').notNull();
      table.string('depositRef').notNull();
      table.integer('amountCents').notNull();
      table.string('use').notNull();
      table.index(['supplierId', 'id']);
    });

    // Scenarios 22, 24, 26 and 28: participation.
    await builder.createCollection('scenarioTrips', (table) => {
      simple(table);
      table.string('createdBy').notNull();
      table.string('submittedBy');
      table.string('city').notNull();
    });
    await builder.createCollection('scenarioCounselReviews', simple);
    await builder.createCollection('scenarioMatters', (table) => {
      simple(table);
      table.string('subjectKey').notNull();
      table.index(['subjectKey', 'status']);
    });

    // Scenario 23: itemized reimbursement.
    await builder.createCollection('scenarioReimbursements', (table) => {
      simple(table);
      table.json('lines').notNull().defaultTo([]);
      table.json('decisions');
      table.integer('approvedTotalCents').notNull().defaultTo(0);
      table.json('payments');
      table.text('paymentError');
      table.string('followUpOf');
    });

    // Scenario 25: notices and their acknowledgements.
    await builder.createCollection('scenarioNotices', (table) => {
      record(table);
      table.string('publisherId').notNull();
      table.string('mode').notNull();
      table.json('recipientIds').notNull().defaultTo([]);
      table.datetimeTz('publishedAt');
      table.datetimeTz('effectiveAt');
      table.index(['publisherId', 'id']);
    });
    await builder.createCollection('scenarioAcknowledgements', (table) => {
      row(table);
      table.string('noticeId').notNull();
      table.string('recipientId').notNull();
      table.string('kind').notNull();
      table.boolean('blocking').notNull().defaultTo(false);
      table.string('status').notNull();
      table.datetimeTz('deliveredAt');
      table.datetimeTz('readAt');
      table.datetimeTz('confirmedAt');
      table.integer('reminders').notNull().defaultTo(0);
      table.datetimeTz('remindAt');
      table.json('comments').notNull().defaultTo([]);
      table.index(['noticeId', 'id']);
      table.index(['recipientId', 'status']);
    });

    // Scenario 27: payment requests and the budget they reserve.
    await builder.createCollection('scenarioPayments', (table) => {
      simple(table);
      table.string('payeeId').notNull();
      table.integer('amountCents').notNull();
      table.string('budgetCode').notNull();
      table.string('executionMode');
      table.integer('installments');
      table.datetimeTz('approvedAt');
      table.string('approvedBy');
      table.json('approvedSnapshot');
      table.integer('approvalRound');
      table.datetimeTz('executeAt');
      table.integer('paidCents');
      table.integer('installmentsPaid');
      table.json('paymentRefs');
      table.string('failureKind');
      table.text('failureError');
      table.integer('reservedCents');
      table.string('reservationStatus');
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

    // Scenario 28: grants, their balances and uses.
    await builder.createCollection('scenarioGrantRequests', (table) => {
      simple(table);
      table.string('subjectId').notNull();
      table.integer('subjectRevision').notNull();
      table.string('matter').notNull();
      table.json('requested').notNull();
      table.string('supersedes');
      table.json('approved');
      table.string('grantId');
      table.index(['subjectId', 'matter']);
    });
    await builder.createCollection('scenarioGrants', (table) => {
      record(table);
      table.string('requestId').notNull();
      table.string('subjectId').notNull();
      table.integer('subjectRevision').notNull();
      table.string('matter').notNull();
      table.string('holderId').notNull();
      table.string('approvedBy').notNull();
      table.integer('limitCents');
      table.integer('maxUses');
      table.datetimeTz('validFrom').notNull();
      table.datetimeTz('validUntil').notNull();
      table.string('supersedes');
      table.string('supersededBy');
      table.string('revokedBy');
      table.text('revokedReason');
      table.index(['subjectId', 'status']);
    });
    await builder.createCollection('scenarioGrantBalances', (table) => {
      row(table);
      table.string('grantId').notNull();
      table.integer('usedCents').notNull().defaultTo(0);
      table.integer('uses').notNull().defaultTo(0);
      table.unique(['grantId']);
    });
    await builder.createCollection('scenarioGrantUsages', (table) => {
      table.bigInt('id').primary().autoIncrement().notNull();
      table.string('grantId').notNull();
      table.string('usageKey').notNull();
      table.integer('amountCents').notNull();
      table.string('by').notNull();
      table.datetimeTz('at').notNull();
      table.string('requestId');
      table.unique(['grantId', 'usageKey']);
    });
  },

  async down({ builder }) {
    for (const name of [
      'scenarioGrantUsages',
      'scenarioGrantBalances',
      'scenarioGrants',
      'scenarioGrantRequests',
      'scenarioPaymentReservations',
      'scenarioPayments',
      'scenarioAcknowledgements',
      'scenarioNotices',
      'scenarioReimbursements',
      'scenarioMatters',
      'scenarioCounselReviews',
      'scenarioTrips',
      'scenarioSupplierDeposits',
      'scenarioSuppliers',
      'scenarioOrderPayments',
      'scenarioOrders',
      'scenarioContractFullReviews',
      'scenarioContractReviews',
      'scenarioContracts',
      'scenarioWorkItems',
      'scenarioBranchReviews',
      'scenarioCoordinationNotes',
      'scenarioBranches',
      'scenarioCoordinations',
      ...[...SIMPLE_REQUESTS].reverse(),
      'scenarioPurchaseRequests',
      'scenarioCountersigns',
      'scenarioFinanceRequests',
      'scenarioRuledLeaves',
      'scenarioCompensatoryLeaves',
      'scenarioLeaveRequests',
      'approvalExampleSettings',
      'approvalExampleOperations',
      'approvalExampleMessages',
      'approvalExampleEffectRuns',
      'approvalExampleTransitions',
    ])
      await builder.dropCollection(name);
  },
});

export default migration;
