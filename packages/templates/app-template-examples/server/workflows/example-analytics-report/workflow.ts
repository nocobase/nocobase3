import {
  ConditionInstruction,
  defineWorkflow,
  RunInstruction,
  TerminateInstruction,
  type WorkflowSourceAst,
} from '@nocobase/app-plugin-workflow';

const workflow: WorkflowSourceAst = defineWorkflow({
  title: 'Example: Analytics daily report',
  description:
    'Read the analytics database and save a daily report in the application database. Try 2026-09-08; a date without data ends successfully without saving.',
  inputSchema: {
    type: 'object',
    required: ['date'],
    properties: {
      date: {
        type: 'string',
        title: 'Report date (YYYY-MM-DD, try 2026-09-08)',
        minLength: 10,
        maxLength: 10,
      },
    },
    additionalProperties: false,
  },
  nodes: [
    RunInstruction.create({
      key: 'loadMetrics',
      title: 'Read analytics metrics',
      config: {
        module: './server/load-metrics',
        args: { date: '{{$input.date}}' },
      },
      result: {
        type: 'object',
        properties: {
          date: { type: 'string' },
          count: { type: 'integer' },
          impressions: { type: 'integer' },
          clicks: { type: 'integer' },
          conversions: { type: 'integer' },
          spendCents: { type: 'integer' },
          revenueCents: { type: 'integer' },
        },
        required: [
          'date',
          'count',
          'impressions',
          'clicks',
          'conversions',
          'spendCents',
          'revenueCents',
        ],
        additionalProperties: false,
      },
    }),
    ConditionInstruction.create({
      key: 'hasData',
      title: 'Are there metrics for this date?',
      config: {
        expression: { '>': [{ var: 'nodeResults.loadMetrics.count' }, 0] },
      },
    }).branch({
      yes: [],
      no: [
        TerminateInstruction.create({
          key: 'noData',
          title: 'No data: finish without a report',
          config: { outcome: 'success' },
        }),
      ],
    }),
    RunInstruction.create({
      key: 'calculateReport',
      title: 'Calculate daily report',
      config: {
        module: './server/calculate-report',
        args: { metrics: '{{$nodeResults.loadMetrics}}' },
      },
      result: {
        type: 'object',
        properties: {
          date: { type: 'string' },
          impressions: { type: 'integer' },
          clicks: { type: 'integer' },
          conversions: { type: 'integer' },
          spendCents: { type: 'integer' },
          revenueCents: { type: 'integer' },
          profitCents: { type: 'integer' },
        },
        required: [
          'date',
          'impressions',
          'clicks',
          'conversions',
          'spendCents',
          'revenueCents',
          'profitCents',
        ],
        additionalProperties: false,
      },
    }),
    RunInstruction.create({
      key: 'saveReport',
      title: 'Save one report per date',
      config: {
        module: './server/save-report',
        args: { report: '{{$nodeResults.calculateReport}}' },
      },
    }),
  ],
});
export default workflow;
