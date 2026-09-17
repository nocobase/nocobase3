import { z } from 'zod';

export const BUSINESS_REPORT_LIMITS = {
  title: 200,
  summary: 2_000,
  markdown: 100_000,
  charts: 12,
  fileName: 120,
  chartBytes: 100_000,
  totalBytes: 500_000,
  depth: 16,
  nodes: 30_000,
  arrayItems: 2_000,
  placeholders: 100,
} as const;

const text = (max: number) => z.string().max(max).trim();

export const businessReportInputSchema = z
  .object({
    title: text(BUSINESS_REPORT_LIMITS.title).min(1),
    summary: text(BUSINESS_REPORT_LIMITS.summary).optional(),
    markdown: text(BUSINESS_REPORT_LIMITS.markdown).default(''),
    charts: z
      .array(
        z
          .object({
            title: text(BUSINESS_REPORT_LIMITS.title).optional(),
            summary: text(BUSINESS_REPORT_LIMITS.summary).optional(),
            options: z
              .record(z.string(), z.unknown())
              .describe(
                'Structured JSON ECharts options, with a series object or nonempty series array. No functions, stringified JSON, custom renderers, navigation links, images, or external maps.',
              ),
          })
          .strict(),
      )
      .max(BUSINESS_REPORT_LIMITS.charts)
      .default([]),
    fileName: text(BUSINESS_REPORT_LIMITS.fileName).min(1).optional(),
  })
  .strict();

export type BusinessReport = z.infer<typeof businessReportInputSchema>;
export type BusinessReportResult =
  | {
      success: true;
      chartCount: number;
      errors: string[];
      warnings: string[];
      report: BusinessReport;
    }
  | {
      success: false;
      chartCount: 0;
      errors: string[];
      warnings: string[];
    };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

// These series are supplied by the Registry's lazy ECharts runtime. Maps need
// externally registered assets and custom series need executable renderers.
const seriesTypes = new Set([
  'bar',
  'boxplot',
  'candlestick',
  'effectScatter',
  'line',
  'pictorialBar',
  'scatter',
  'funnel',
  'gauge',
  'graph',
  'pie',
  'radar',
  'sankey',
  'sunburst',
  'tree',
  'treemap',
  'heatmap',
  'lines',
  'parallel',
  'themeRiver',
]);
const cartesianTypes = new Set([
  'bar',
  'boxplot',
  'candlestick',
  'effectScatter',
  'line',
  'pictorialBar',
  'scatter',
  'heatmap',
]);
const unsafeKeys = new Set(['__proto__', 'prototype', 'constructor']);
const chartTag = /<\/?echarts\b/i;

function assertBoundedJson(value: unknown): void {
  let nodes = 0;
  let characters = 0;
  const ancestors = new Set<object>();
  const visit = (item: unknown, depth: number): void => {
    if (
      ++nodes > BUSINESS_REPORT_LIMITS.nodes ||
      depth > BUSINESS_REPORT_LIMITS.depth
    ) {
      throw new Error('Report JSON exceeds the node or nesting limit.');
    }
    if (typeof item === 'string') {
      characters += item.length;
      if (characters > BUSINESS_REPORT_LIMITS.totalBytes) {
        throw new Error('Report JSON exceeds the total size limit.');
      }
      return;
    }
    if (item === null || typeof item === 'boolean') return;
    if (typeof item === 'number' && Number.isFinite(item)) return;
    if (typeof item !== 'object' || item === null) {
      throw new Error(
        'Report must contain only strict JSON values and finite numbers.',
      );
    }
    if (ancestors.has(item))
      throw new Error('Report JSON must not contain cycles.');
    ancestors.add(item);
    if (Array.isArray(item)) {
      if (item.length > BUSINESS_REPORT_LIMITS.arrayItems) {
        throw new Error('Report JSON array exceeds the item limit.');
      }
      for (const child of item) visit(child, depth + 1);
    } else {
      if (
        Object.getPrototypeOf(item) !== Object.prototype &&
        Object.getPrototypeOf(item) !== null
      ) {
        throw new Error('Report must contain only plain JSON objects.');
      }
      for (const [key, child] of Object.entries(item)) {
        if (unsafeKeys.has(key))
          throw new Error(`Unsupported JSON key: ${key}.`);
        characters += key.length;
        visit(child, depth + 1);
      }
    }
    ancestors.delete(item);
  };
  visit(value, 0);
  if (
    Buffer.byteLength(JSON.stringify(value), 'utf8') >
    BUSINESS_REPORT_LIMITS.totalBytes
  ) {
    throw new Error('Report JSON exceeds the total byte limit.');
  }
}

const isDataValue = (value: unknown): boolean =>
  value === null || typeof value === 'number' || typeof value === 'string';

const isDataTuple = (value: unknown): boolean =>
  Array.isArray(value) && value.length > 0 && value.every(isDataValue);

function isChartDataItem(value: unknown, seriesType: string): boolean {
  if (isDataValue(value) || isDataTuple(value)) return true;
  if (!isRecord(value)) return false;
  if (
    value.name !== undefined &&
    typeof value.name !== 'string' &&
    typeof value.name !== 'number'
  )
    return false;
  if (
    value.value !== undefined &&
    !isDataValue(value.value) &&
    !isDataTuple(value.value)
  )
    return false;
  if (value.children !== undefined) {
    return (
      ['tree', 'treemap', 'sunburst'].includes(seriesType) &&
      Array.isArray(value.children) &&
      value.children.every((item) => isChartDataItem(item, seriesType))
    );
  }
  if (seriesType === 'lines')
    return Array.isArray(value.coords) && value.coords.every(isDataTuple);
  return (
    value.value !== undefined ||
    (['graph', 'sankey', 'tree', 'treemap', 'sunburst'].includes(seriesType) &&
      value.name !== undefined)
  );
}

const componentTypes = [
  'xAxis',
  'yAxis',
  'grid',
  'radar',
  'polar',
  'angleAxis',
  'radiusAxis',
  'singleAxis',
  'parallel',
  'parallelAxis',
  'calendar',
  'dataset',
] as const;

// Links are executable navigation in ECharts, not inert chart text. Images can
// fetch external resources or taint the export canvas, so reports allow neither.
function validateChartResources(value: unknown, path: string): string[] {
  if (typeof value === 'string' && /^\s*image:\/\//i.test(value)) {
    return [`${path}: chart image resources are not supported.`];
  }
  if (Array.isArray(value)) {
    return value.flatMap((child, index) =>
      validateChartResources(child, `${path}[${index}]`),
    );
  }
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const childPath = `${path}.${key}`;
    if (['link', 'sublink', 'href'].includes(key.toLowerCase())) {
      return [`${childPath}: chart navigation links are not supported.`];
    }
    if (
      key.toLowerCase() === 'image' ||
      (key === 'type' && child === 'image')
    ) {
      return [`${childPath}: chart image resources are not supported.`];
    }
    return validateChartResources(child, childPath);
  });
}

function validateChartReferences(
  options: Record<string, unknown>,
  series: unknown[],
  path: string,
): string[] {
  const errors: string[] = [];
  const implicitGrid = {};
  const implicitParallel = {};
  const components = (key: string): Record<string, unknown>[] => {
    const value = options[key];
    // ECharts creates these containers implicitly for their axes.
    if (
      value === undefined &&
      ((key === 'grid' &&
        options.xAxis !== undefined &&
        options.yAxis !== undefined) ||
        (key === 'parallel' && options.parallelAxis !== undefined))
    )
      return [key === 'grid' ? implicitGrid : implicitParallel];
    return (Array.isArray(value) ? value : [value]).filter(isRecord);
  };
  const resolve = (
    source: Record<string, unknown>,
    key: string,
    sourcePath: string,
    required = false,
  ): Record<string, unknown> | undefined => {
    const index = source[`${key}Index`];
    const id = source[`${key}Id`];
    if (index === undefined && id === undefined && !required) return;
    const targets = components(key);
    if (index !== undefined && id !== undefined) {
      errors.push(
        `${sourcePath}: provide only one of ${key}Index or ${key}Id.`,
      );
      return;
    }
    if (id !== undefined) {
      // These coordinate creators in ECharts 5 read indexes, not IDs.
      if (key === 'radar' || key === 'calendar') {
        errors.push(`${sourcePath}.${key}Id: use ${key}Index instead.`);
        return;
      }
      const target =
        typeof id === 'string' || typeof id === 'number'
          ? targets.find(
              (candidate) =>
                (typeof candidate.id === 'string' ||
                  typeof candidate.id === 'number') &&
                String(candidate.id) === String(id),
            )
          : undefined;
      if (!target)
        errors.push(
          `${sourcePath}.${key}Id: must identify an existing ${key} component.`,
        );
      return target;
    }
    const effectiveIndex = index === undefined ? 0 : index;
    if (
      typeof effectiveIndex !== 'number' ||
      !Number.isSafeInteger(effectiveIndex) ||
      effectiveIndex < 0 ||
      effectiveIndex >= targets.length
    ) {
      errors.push(
        `${sourcePath}.${key}Index: must identify an existing ${key} component using a nonnegative integer.`,
      );
      return;
    }
    return targets[effectiveIndex];
  };
  for (const key of componentTypes) {
    const ids = new Set<string>();
    components(key).forEach((component, index) => {
      if (component.id !== undefined) {
        const id = component.id;
        if (
          (typeof id !== 'string' && typeof id !== 'number') ||
          ids.has(String(id))
        ) {
          errors.push(
            `${path}.${key}[${index}].id: expected a unique string or number.`,
          );
        }
        if (typeof id === 'string' || typeof id === 'number')
          ids.add(String(id));
      }
    });
  }
  for (const [axis, container] of [
    ['xAxis', 'grid'],
    ['yAxis', 'grid'],
    ['angleAxis', 'polar'],
    ['radiusAxis', 'polar'],
    ['parallelAxis', 'parallel'],
  ]) {
    components(axis).forEach((component, index) => {
      resolve(component, container, `${path}.${axis}[${index}]`, true);
    });
  }
  series.forEach((item, index) => {
    if (!isRecord(item)) return;
    const sourcePath = `${path}.series[${index}]`;
    const coordinateSystem =
      item.coordinateSystem ??
      (cartesianTypes.has(String(item.type)) ? 'cartesian2d' : item.type);
    const required = new Set(
      coordinateSystem === 'cartesian2d'
        ? ['xAxis', 'yAxis']
        : coordinateSystem === 'themeRiver'
          ? ['singleAxis']
          : ['polar', 'singleAxis', 'parallel', 'calendar', 'radar'].includes(
                String(coordinateSystem),
              )
            ? [String(coordinateSystem)]
            : [],
    );
    if (item.data === undefined && options.dataset !== undefined)
      required.add('dataset');
    const resolved = new Map<string, Record<string, unknown> | undefined>();
    for (const key of componentTypes) {
      resolved.set(key, resolve(item, key, sourcePath, required.has(key)));
    }
    if (coordinateSystem === 'polar') {
      const polar = resolved.get('polar');
      if (polar) {
        for (const axis of ['angleAxis', 'radiusAxis']) {
          if (
            !components(axis).some(
              (component) =>
                resolve(component, 'polar', sourcePath, true) === polar,
            )
          ) {
            errors.push(`${sourcePath}: the selected polar requires ${axis}.`);
          }
        }
      }
    }
    if (coordinateSystem === 'cartesian2d') {
      const xAxis = resolved.get('xAxis');
      const yAxis = resolved.get('yAxis');
      if (xAxis && yAxis) {
        const xGrid = resolve(xAxis, 'grid', sourcePath, true);
        const yGrid = resolve(yAxis, 'grid', sourcePath, true);
        if (xGrid && yGrid && xGrid !== yGrid) {
          errors.push(
            `${sourcePath}: xAxis and yAxis must belong to the same grid.`,
          );
        }
      }
    }
  });
  return errors;
}

function validateChartOptions(
  options: Record<string, unknown>,
  path: string,
): string[] {
  const errors = validateChartResources(options, path);
  if (
    Buffer.byteLength(JSON.stringify(options), 'utf8') >
    BUSINESS_REPORT_LIMITS.chartBytes
  ) {
    return [`${path}: chart options exceed the byte limit.`];
  }
  const series = Array.isArray(options.series)
    ? options.series
    : [options.series];
  if (series.length === 0 || series.length > 30) {
    return [`${path}.series: provide between 1 and 30 series.`];
  }
  // Dynamic option branches could bypass validation of the visible series.
  for (const key of ['baseOption', 'options', 'media', 'geo']) {
    if (options[key] !== undefined)
      errors.push(
        `${path}.${key}: dynamic option branches and external geographic assets are not supported.`,
      );
  }
  for (const key of componentTypes) {
    if (options[key] === undefined) continue;
    const components = Array.isArray(options[key])
      ? options[key]
      : [options[key]];
    if (
      !components.length ||
      components.some((component) => !isRecord(component))
    ) {
      errors.push(
        `${path}.${key}: expected an object or nonempty array of objects.`,
      );
    }
  }
  if (options.dataset !== undefined) {
    const datasets = Array.isArray(options.dataset)
      ? options.dataset
      : [options.dataset];
    if (
      !datasets.length ||
      datasets.some(
        (dataset) =>
          !isRecord(dataset) ||
          !Array.isArray(dataset.source) ||
          dataset.source.length === 0 ||
          dataset.transform !== undefined,
      )
    ) {
      errors.push(
        `${path}.dataset: each dataset must provide a structured source array; transforms are not supported.`,
      );
    }
  }
  series.forEach((item, index) => {
    const seriesPath = `${path}.series[${index}]`;
    if (
      !isRecord(item) ||
      typeof item.type !== 'string' ||
      !seriesTypes.has(item.type)
    ) {
      errors.push(
        `${seriesPath}: provide an explicit supported ECharts series type (not custom or map).`,
      );
      return;
    }
    const coordinateSystem =
      item.coordinateSystem ??
      (cartesianTypes.has(item.type) ? 'cartesian2d' : undefined);
    const requiredComponents: Record<string, string[]> = {
      cartesian2d: ['xAxis', 'yAxis'],
      polar: ['polar', 'angleAxis', 'radiusAxis'],
      singleAxis: ['singleAxis'],
      parallel: ['parallelAxis'],
      calendar: ['calendar'],
    };
    if (
      coordinateSystem !== undefined &&
      (typeof coordinateSystem !== 'string' ||
        !Object.hasOwn(requiredComponents, coordinateSystem))
    ) {
      errors.push(
        `${seriesPath}.coordinateSystem: unsupported coordinate system.`,
      );
    } else if (typeof coordinateSystem === 'string') {
      for (const key of requiredComponents[coordinateSystem]) {
        if (options[key] === undefined)
          errors.push(`${seriesPath}: ${coordinateSystem} requires ${key}.`);
      }
    }
    for (const [type, key] of [
      ['radar', 'radar'],
      ['parallel', 'parallelAxis'],
      ['themeRiver', 'singleAxis'],
    ]) {
      if (item.type === type && options[key] === undefined)
        errors.push(`${seriesPath}: ${type} requires ${key}.`);
    }
    if (item.data !== undefined && !Array.isArray(item.data)) {
      errors.push(`${seriesPath}.data: expected an array.`);
    } else if (item.data === undefined && options.dataset === undefined) {
      errors.push(`${seriesPath}: provide a data array or a chart dataset.`);
    }
    if (Array.isArray(item.data)) {
      if (item.data.length === 0)
        errors.push(`${seriesPath}.data: provide at least one data item.`);
      else if (
        !item.data.every((value) => isChartDataItem(value, item.type as string))
      ) {
        errors.push(
          `${seriesPath}.data: invalid data item; use scalar values, dimension arrays, or named value objects appropriate for this series.`,
        );
      }
    }
    if (item.tooltip !== undefined) {
      if (!isRecord(item.tooltip))
        errors.push(`${seriesPath}.tooltip: expected an object.`);
      else item.tooltip = { ...item.tooltip, renderMode: 'richText' };
    }
  });
  errors.push(...validateChartReferences(options, series, path));
  if (!errors.length) options.series = series;
  // HTML tooltip formatting is unnecessary for reports and can interpret data
  // as markup. Rich-text tooltips keep the report's structured data as text.
  if (options.tooltip !== undefined) {
    if (!isRecord(options.tooltip))
      errors.push(`${path}.tooltip: expected an object.`);
    else options.tooltip = { ...options.tooltip, renderMode: 'richText' };
  }
  return errors;
}

export class BusinessReportService {
  generate(input: unknown): BusinessReportResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const failed = (): BusinessReportResult => ({
      success: false,
      chartCount: 0,
      errors: errors.slice(0, 20),
      warnings,
    });
    try {
      assertBoundedJson(input);
    } catch (error) {
      errors.push(
        error instanceof Error ? error.message : 'Invalid report JSON.',
      );
      return failed();
    }
    const parsed = businessReportInputSchema.safeParse(input);
    if (!parsed.success) {
      errors.push(
        ...parsed.error.issues.map(
          (issue) => `${issue.path.join('.') || 'report'}: ${issue.message}`,
        ),
      );
      return failed();
    }
    // Clone the validated JSON so normalization cannot mutate caller-owned options.
    const report = JSON.parse(JSON.stringify(parsed.data)) as BusinessReport;
    if (!report.markdown && !report.charts.length) {
      errors.push('Provide Markdown content or at least one chart.');
    }
    const prose = [
      report.title,
      report.summary,
      report.markdown,
      ...report.charts.flatMap((chart) => [chart.title, chart.summary]),
    ];
    if (prose.some((value) => value && chartTag.test(value))) {
      errors.push(
        'Inline <echarts> tags are not allowed. Use structured charts and {{chart:n}} placeholders.',
      );
    }
    report.charts.forEach((chart, index) => {
      errors.push(
        ...validateChartOptions(chart.options, `charts[${index}].options`),
      );
    });
    const usedIndexes = new Set<number>();
    let references = 0;
    report.markdown = report.markdown.replace(
      /\{\{\s*chart\s*:\s*(\d+)\s*\}\}/gi,
      (placeholder, rawIndex: string) => {
        references++;
        const index = Number(rawIndex);
        if (references > BUSINESS_REPORT_LIMITS.placeholders)
          return placeholder;
        if (
          !Number.isSafeInteger(index) ||
          index < 1 ||
          index > report.charts.length
        ) {
          errors.push(
            `Invalid chart reference ${placeholder.slice(0, 80)}: indexes are 1-based and must identify an existing chart.`,
          );
          return placeholder;
        }
        usedIndexes.add(index);
        return `{{chart:${index}}}`;
      },
    );
    if (references > BUSINESS_REPORT_LIMITS.placeholders) {
      errors.push('Too many chart placeholders.');
    }
    const remainder = report.markdown.replace(/\{\{chart:\d+\}\}/g, '');
    if (/\{\{\s*chart\b/i.test(remainder)) {
      errors.push(
        'Malformed chart placeholder. Use {{chart:n}} with a positive integer index.',
      );
    }
    if (report.charts.length > usedIndexes.size) {
      warnings.push(
        'Charts without an inline placeholder will be appended to the report.',
      );
    }
    if (report.fileName) {
      const fileName = report.fileName
        // Control characters are intentionally removed from export file names.
        // eslint-disable-next-line no-control-regex
        .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '-')
        .replace(/^\.+|[. ]+$/g, '')
        .trim();
      if (!fileName)
        errors.push('fileName: provide a usable export file name.');
      else if (fileName !== report.fileName) {
        report.fileName = fileName;
        warnings.push(
          'The export file name was normalized to remove unsafe characters.',
        );
      }
    }
    if (errors.length) return failed();
    return {
      success: true,
      chartCount: report.charts.length,
      errors: [],
      warnings,
      report,
    };
  }
}
