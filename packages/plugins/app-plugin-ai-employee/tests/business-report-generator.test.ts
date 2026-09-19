import { describe, expect, it } from 'vitest';
import * as echarts from 'echarts';
import tool from '../server/ai/tools/businessReportGenerator.js';
import {
  BUSINESS_REPORT_LIMITS,
  BusinessReportService,
} from '../server/service/business-report-service.js';

const service = new BusinessReportService();
const chart = () => ({
  title: ' Sales ',
  options: { series: { type: 'pie', data: [{ name: 'Paid', value: 2 }] } },
});
const report = () => ({
  title: ' April report ',
  summary: ' Summary ',
  markdown: 'Revenue\n\n{{ Chart : 01 }}',
  charts: [chart()],
});

function expectFailure(input: unknown, message?: string) {
  const result = service.generate(input);
  expect(result).toMatchObject({ success: false, chartCount: 0 });
  expect(result).not.toHaveProperty('report');
  expect(result.errors.length).toBeGreaterThan(0);
  if (message) expect(result.errors.join('\n')).toContain(message);
  return result;
}

describe('BusinessReportService', () => {
  it('normalizes a detached, structured report and 1-based placeholders', () => {
    const input = report();
    const result = service.generate(input);
    expect(result).toMatchObject({
      success: true,
      chartCount: 1,
      errors: [],
      warnings: [],
      report: {
        title: 'April report',
        summary: 'Summary',
        markdown: 'Revenue\n\n{{chart:1}}',
        charts: [
          {
            title: 'Sales',
            options: {
              series: [{ type: 'pie', data: [{ name: 'Paid', value: 2 }] }],
            },
          },
        ],
      },
    });
    expect(input.charts[0].options.series).not.toBeInstanceOf(Array);
    expect(input.title).toBe(' April report ');
  });

  it('supports Markdown-only reports and chart-only reports', () => {
    expect(
      service.generate({ title: 'Report', markdown: '**No data**' }),
    ).toMatchObject({
      success: true,
      chartCount: 0,
      report: { charts: [], markdown: '**No data**' },
    });
    expect(
      service.generate({ title: 'Report', charts: [chart()] }),
    ).toMatchObject({
      success: true,
      chartCount: 1,
      warnings: [expect.stringContaining('appended')],
    });
    expectFailure({ title: 'Report' }, 'Provide Markdown');
  });

  it('normalizes file names and tooltip rendering without mutating input', () => {
    const input = {
      ...report(),
      fileName: '../April:Revenue',
      charts: [
        {
          ...chart(),
          options: { ...chart().options, tooltip: { renderMode: 'html' } },
        },
      ],
    };
    const result = service.generate(input);
    expect(result).toMatchObject({
      success: true,
      warnings: [expect.stringContaining('file name')],
      report: {
        fileName: '-April-Revenue',
        charts: [{ options: { tooltip: { renderMode: 'richText' } } }],
      },
    });
    expect(input.charts[0].options.tooltip.renderMode).toBe('html');
    expectFailure({ ...report(), fileName: '...' }, 'fileName');
  });

  it.each([
    '[{"options":{"series":[]}}]',
    '[{options: {series: []}}]',
    null,
    {},
  ])('rejects non-structured chart lists: %j', (charts) => {
    expectFailure({ ...report(), charts }, 'charts');
  });

  it.each([
    {},
    { options: {} },
    { options: { series: [] } },
    { options: { series: [{ type: 'unknown', data: [1] }] } },
    { options: { series: [{ type: 'custom', data: [1] }] } },
    { options: { series: [{ type: 'map', data: [1] }] } },
    { options: { series: [{ type: 'pie' }] } },
    { options: { series: [{ type: 'pie', data: 'bad' }] } },
    { options: { series: [{ type: 'pie', data: [] }] } },
    { options: { series: [{ type: 'pie', data: [{}] }] } },
    { options: { series: [{ type: 'pie', data: [true] }] } },
    { options: { series: [{ type: 'line', data: [1, 2] }] } },
    { options: { series: [{ type: 'radar', data: [[1, 2]] }] } },
    { options: { series: [{ type: 'pie', data: [1] }], baseOption: {} } },
    { options: { series: [{ type: 'pie' }], dataset: { source: [] } } },
    {
      options: {
        series: [{ type: 'pie' }],
        dataset: { source: [1], transform: {} },
      },
    },
    { options: { series: [{ type: 'pie' }], dataset: 'bad' } },
    { options: { series: [{ type: 'pie', data: [1] }], tooltip: [] } },
  ])('rejects invalid chart definitions atomically: %j', (invalid) => {
    expectFailure({ ...report(), charts: [chart(), invalid] });
  });

  it('requires coordinate components for Cartesian charts', () => {
    expect(
      service.generate({
        title: 'Trend',
        charts: [
          {
            options: {
              xAxis: { type: 'category', data: ['April'] },
              yAxis: { type: 'value' },
              series: { type: 'line', data: [2] },
            },
          },
        ],
      }),
    ).toMatchObject({ success: true, chartCount: 1 });
    expectFailure(
      {
        title: 'Trend',
        charts: [
          {
            options: {
              xAxis: 'invalid',
              yAxis: {},
              series: { type: 'line', data: [2] },
            },
          },
        ],
      },
      'xAxis',
    );
  });

  it.each([
    { title: { text: 'Click', link: 'javascript:alert(document.domain)' } },
    { title: [{ subtext: 'Click', sublink: 'javascript:alert(1)' }] },
    { title: { link: 'https://example.com' } },
    {
      series: {
        type: 'treemap',
        data: [
          {
            name: 'Root',
            children: [
              { name: 'Child', value: 1, link: 'javascript:alert(1)' },
            ],
          },
        ],
      },
    },
    {
      series: {
        type: 'pie',
        data: [{ value: 1, sublink: 'javascript:alert(1)' }],
      },
    },
    {
      graphic: {
        children: [{ style: { image: 'https://example.com/pixel.png' } }],
      },
    },
    {
      series: {
        type: 'pie',
        data: [1],
        symbol: 'image://https://example.com/pixel.png',
      },
    },
    {
      title: {
        textStyle: {
          rich: {
            badge: { backgroundColor: { image: 'data:image/svg+xml,<svg/>' } },
          },
        },
      },
    },
  ])(
    'rejects navigation and image resources anywhere in chart options: %j',
    (options) => {
      expectFailure(
        {
          title: 'Unsafe',
          charts: [{ options: { ...chart().options, ...options } }],
        },
        'not supported',
      );
    },
  );

  it('rejects the axis reference that makes ECharts setOption throw', () => {
    const options = {
      xAxis: {},
      yAxis: {},
      series: [{ type: 'bar', xAxisIndex: 99, data: [1] }],
    };
    const chart = echarts.init(null, undefined, {
      renderer: 'svg',
      ssr: true,
      width: 400,
      height: 280,
    });
    try {
      expect(() => chart.setOption(options)).toThrow(/xAxis/i);
    } finally {
      chart.dispose();
    }
    expectFailure({ title: 'Trend', charts: [{ options }] }, 'xAxisIndex');
  });

  it.each([99, -1, 0.5, '0', null, [], {}])(
    'rejects invalid axis indexes: %j',
    (xAxisIndex) => {
      expectFailure(
        {
          title: 'Trend',
          charts: [
            {
              options: {
                xAxis: {},
                yAxis: {},
                series: [{ type: 'bar', xAxisIndex, data: [1] }],
              },
            },
          ],
        },
        'xAxisIndex',
      );
    },
  );

  it.each([
    { xAxis: {}, yAxis: {}, series: { type: 'bar', yAxisIndex: 1, data: [1] } },
    {
      xAxis: {},
      yAxis: {},
      series: { type: 'bar', xAxisId: 'missing', data: [1] },
    },
    { xAxis: { gridIndex: 2 }, yAxis: {}, series: { type: 'bar', data: [1] } },
    {
      grid: [{}, {}],
      xAxis: { gridIndex: 0 },
      yAxis: { gridIndex: 1 },
      series: { type: 'bar', data: [1] },
    },
    { radar: {}, series: { type: 'radar', radarIndex: 1, data: [[1, 2]] } },
    {
      singleAxis: {},
      series: {
        type: 'themeRiver',
        singleAxisId: 'missing',
        data: [[1, 2, 'A']],
      },
    },
    {
      parallelAxis: {},
      series: { type: 'parallel', parallelIndex: 2, data: [[1, 2]] },
    },
    {
      calendar: {},
      series: {
        type: 'heatmap',
        coordinateSystem: 'calendar',
        calendarIndex: 2,
        data: [[1, 2]],
      },
    },
    {
      polar: {},
      angleAxis: {},
      radiusAxis: {},
      series: {
        type: 'bar',
        coordinateSystem: 'polar',
        polarIndex: 2,
        data: [1],
      },
    },
    {
      polar: [{}, {}],
      angleAxis: {},
      radiusAxis: {},
      series: {
        type: 'bar',
        coordinateSystem: 'polar',
        polarIndex: 1,
        data: [1],
      },
    },
    {
      dataset: { source: [['A', 1]] },
      series: { type: 'pie', datasetIndex: 2 },
    },
  ])('rejects unresolved component references: %j', (options) => {
    expectFailure({ title: 'Trend', charts: [{ options }] });
  });

  it.each([
    { xAxis: {}, yAxis: {}, series: { type: 'bar', data: [1] } },
    {
      grid: [{ id: 'first' }, { id: 'second' }],
      xAxis: [{ gridId: 'second' }],
      yAxis: [{ gridIndex: 1 }],
      series: { type: 'bar', xAxisIndex: 0, yAxisIndex: 0, data: [1] },
    },
    {
      xAxis: [{ id: 'first' }, { id: 'second' }],
      yAxis: { id: 'values' },
      series: { type: 'bar', xAxisId: 'second', yAxisId: 'values', data: [1] },
    },
    {
      dataset: [{ id: 'sales', source: [['A', 1]] }],
      series: { type: 'pie', datasetId: 'sales' },
    },
  ])('accepts resolved indexes, IDs and implicit grid: %j', (options) => {
    expect(
      service.generate({ title: 'Trend', charts: [{ options }] }),
    ).toMatchObject({ success: true, chartCount: 1, errors: [] });
  });

  it('allows a structured ECharts dataset instead of series data', () => {
    expect(
      service.generate({
        ...report(),
        charts: [
          {
            options: {
              dataset: {
                source: [
                  ['name', 'value'],
                  ['Paid', 2],
                ],
              },
              series: { type: 'pie' },
            },
          },
        ],
      }),
    ).toMatchObject({ success: true });
  });

  it.each([
    '{{chart:0}}',
    '{{chart:2}}',
    '{{chart:-1}}',
    '{{chart:1.5}}',
    '{{chart:x}}',
    '{{chart:}}',
    '{{chart:1}',
    '{{chart:999999999999999999999999}}',
  ])('rejects illegal placeholder %s', (markdown) => {
    expectFailure({ ...report(), markdown }, 'chart');
  });

  it('accepts repeated valid references, warns about unreferenced charts, and bounds expansion', () => {
    expect(
      service.generate({
        ...report(),
        markdown: '{{chart:1}} {{chart:1}}',
        charts: [chart(), chart()],
      }),
    ).toMatchObject({
      success: true,
      chartCount: 2,
      warnings: [expect.stringContaining('appended')],
    });
    expectFailure(
      {
        ...report(),
        markdown: '{{chart:1}}'.repeat(BUSINESS_REPORT_LIMITS.placeholders + 1),
      },
      'Too many',
    );
    expectFailure(
      { title: 'Report', markdown: '{{chart:1}}' },
      'Invalid chart reference',
    );
  });

  it.each(['title', 'summary', 'markdown'])(
    'blocks unvalidated inline chart tags in %s',
    (key) => {
      expectFailure(
        { ...report(), [key]: '<echarts>{"series":[]}</echarts>' },
        'Inline <echarts>',
      );
    },
  );

  it.each([
    ['title', 'a'.repeat(BUSINESS_REPORT_LIMITS.title + 1)],
    ['summary', 'a'.repeat(BUSINESS_REPORT_LIMITS.summary + 1)],
    ['markdown', 'a'.repeat(BUSINESS_REPORT_LIMITS.markdown + 1)],
    ['fileName', 'a'.repeat(BUSINESS_REPORT_LIMITS.fileName + 1)],
    [
      'charts',
      Array.from({ length: BUSINESS_REPORT_LIMITS.charts + 1 }, chart),
    ],
    ['format', 'html'],
  ])('enforces bounded inputs and rejects unknown fields: %s', (key, value) => {
    expectFailure({ ...report(), [key]: value });
  });

  it('bounds individual chart bytes, total UTF-8 bytes, arrays, nodes and depth', () => {
    expectFailure(
      {
        ...report(),
        charts: [
          {
            options: {
              ...chart().options,
              label: 'x'.repeat(BUSINESS_REPORT_LIMITS.chartBytes),
            },
          },
        ],
      },
      'byte limit',
    );
    expectFailure(
      {
        ...report(),
        charts: Array.from({ length: 6 }, () => ({
          options: { label: '界'.repeat(30_000) },
        })),
      },
      'total byte limit',
    );
    expectFailure(
      {
        ...report(),
        charts: [
          {
            options: {
              values: Array.from(
                { length: BUSINESS_REPORT_LIMITS.arrayItems + 1 },
                () => 1,
              ),
            },
          },
        ],
      },
      'item limit',
    );
    let nested: unknown = 1;
    for (let i = 0; i < 20; i++) nested = { nested };
    expectFailure(
      { ...report(), charts: [{ options: { nested } }] },
      'nesting limit',
    );
    expectFailure(
      {
        ...report(),
        charts: [
          {
            options: {
              many: Array.from({ length: 100 }, () =>
                Array.from({ length: 400 }, () => 1),
              ),
            },
          },
        ],
      },
      'node',
    );
  });

  it.each([NaN, Infinity, undefined, () => 1, 1n, new Date()])(
    'rejects non-JSON values rather than repairing them: %s',
    (value) => {
      expectFailure({ ...report(), charts: [{ options: { value } }] }, 'JSON');
    },
  );

  it('rejects cycles and prototype keys', () => {
    const value: Record<string, unknown> = {};
    value.self = value;
    expectFailure({ ...report(), charts: [{ options: value }] }, 'cycles');
    expectFailure(
      JSON.parse('{"title":"Report","markdown":"Body","__proto__":{}}'),
      'Unsupported JSON key',
    );
  });
});

describe('businessReportGenerator tool', () => {
  it('is an explicit, context-free backend tool activated by its skill', () => {
    expect(tool).toMatchObject({
      scope: 'SPECIFIED',
      execution: 'backend',
      defaultPermission: 'ALLOW',
      requiresContext: false,
      definition: { name: 'businessReportGenerator' },
    });
    expect(tool.definition.schema?.safeParse(report()).success).toBe(true);
    expect(
      tool.definition.schema?.safeParse({ ...report(), charts: '[]' }).success,
    ).toBe(false);
  });

  it('returns success and the exact normalized service output', async () => {
    await expect(
      tool.invoke(undefined, report(), {
        toolCallId: 'report',
        writer: () => undefined,
      }),
    ).resolves.toEqual({
      status: 'success',
      content: service.generate(report()),
    });
  });

  it('returns actionable errors without a displayable partial report', async () => {
    await expect(
      tool.invoke(
        undefined,
        { ...report(), charts: '[]' },
        { toolCallId: 'report', writer: () => undefined },
      ),
    ).resolves.toMatchObject({
      status: 'error',
      content: {
        success: false,
        chartCount: 0,
        errors: [expect.any(String)],
        warnings: [],
      },
    });
  });
});
