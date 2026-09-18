import { defineTools } from '@nocobase/ai-employee';
import {
  businessReportInputSchema,
  BusinessReportService,
} from '../../service/business-report-service.js';

const reports = new BusinessReportService();

export default defineTools({
  scope: 'SPECIFIED',
  execution: 'backend',
  requiresContext: false,
  defaultPermission: 'ALLOW',
  i18n: { namespace: '@nocobase/app-plugin-ai-employee' },
  introduction: {
    title: 'Business report generator',
    about:
      'Validate and prepare a business analysis report for preview and export.',
  },
  definition: {
    name: 'businessReportGenerator',
    description:
      'Validate a business report based on previously queried data. Supply title, optional summary, Markdown, optional structured charts [{title?, summary?, options}], and optional fileName. Never send stringified charts or inline <echarts> tags. Reference charts with 1-based {{chart:n}} placeholders; unreferenced charts are appended. Markdown-only reports are allowed. Limits: title 200, summary 2000, Markdown 100000 characters; at most 12 charts, 100000 UTF-8 bytes per chart options, 500000 bytes total, JSON depth 16, arrays 2000 items, fileName 120 characters. Check success, errors and warnings; correct invalid input and retry instead of claiming success.',
    schema: businessReportInputSchema,
  },
  invoke: async (_ctx, args) => {
    const content = reports.generate(args);
    return { status: content.success ? 'success' : 'error', content };
  },
});
