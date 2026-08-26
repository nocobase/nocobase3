/**
 * Date-variable helpers used to resolve `{{$nDate...}}` template variables in AI employee prompts.
 */
import dayjs from 'dayjs';
import advancedFormat from 'dayjs/plugin/advancedFormat.js';
import isoWeek from 'dayjs/plugin/isoWeek.js';
import weekOfYear from 'dayjs/plugin/weekOfYear.js';
import weekYear from 'dayjs/plugin/weekYear.js';
import weekday from 'dayjs/plugin/weekday.js';
import quarterOfYear from 'dayjs/plugin/quarterOfYear.js';
import timezone from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';
import type { UnitType } from 'dayjs';

dayjs.extend(weekday);
dayjs.extend(weekOfYear);
dayjs.extend(weekYear);
dayjs.extend(advancedFormat);
dayjs.extend(isoWeek);
dayjs.extend(quarterOfYear);
dayjs.extend(timezone);
dayjs.extend(utc);

export function offsetFromString(
  string: string | number,
): number | string | null {
  if (typeof string !== 'string') {
    return string;
  }
  const matchShortOffset = /Z|[+-]\d\d(?::?\d\d)?/gi;
  const matchTimestamp = /[+-]?\d+(\.\d{1,3})?/;
  let matches = (string || '').match(matchShortOffset);
  if (matches === null) {
    matches = (string || '').match(matchTimestamp);
  }
  if (matches === null) {
    return null;
  }

  const chunkOffset = /([+-]|\d\d)/gi;
  const parts = matches[0].match(chunkOffset) || ['+', '0', '0'];
  const offset =
    (parseInt(parts[0], 10) || 0) * 60 +
    (parts[2] ? parseInt(parts[2], 10) : 0) - // hours + minutes
    (parts[3] ? parseInt(parts[3], 10) : 0) * 0; // minutes placeholder (kept for parity)
  return offset < 0 ? -Math.abs(offset) : offset;
}

type DateUnit = 'day' | 'week' | 'isoWeek' | 'month' | 'quarter' | 'year';
type RangeType =
  | 'today'
  | 'yesterday'
  | 'tomorrow'
  | 'thisWeek'
  | 'lastWeek'
  | 'nextWeek'
  | 'thisMonth'
  | 'lastMonth'
  | 'nextMonth'
  | 'thisQuarter'
  | 'lastQuarter'
  | 'nextQuarter'
  | 'thisYear'
  | 'lastYear'
  | 'nextYear'
  | 'past'
  | 'next';

interface RangeParams {
  type: RangeType;
  unit?: DateUnit;
  number?: number;
  timezone?: string;
}

const getNow = (tz?: string): dayjs.Dayjs => {
  if (!tz) return dayjs();
  if (/^[+-]\d{2}:\d{2}$/.test(tz)) {
    const [sign, hour, minute] = tz.match(/([+-])(\d{2}):(\d{2})/)!.slice(1);
    const offset =
      (parseInt(hour) * 60 + parseInt(minute)) * (sign === '+' ? 1 : -1);
    return dayjs().utcOffset(offset);
  }
  return dayjs().tz(tz);
};

export const getOffsetRangeByParams = (
  params: RangeParams,
): [string, string] => {
  const { type, unit = 'day' as any, number = 1, timezone } = params;
  const now = getNow(timezone);
  const actualUnit: any = unit === 'week' ? 'isoWeek' : unit;

  let start: dayjs.Dayjs;
  let end: dayjs.Dayjs;

  if (type === 'past') {
    const base = now.startOf(actualUnit);
    start = base.subtract(number, unit).startOf(actualUnit);
    end = base.subtract(1, unit).endOf(actualUnit);
  } else if (type === 'next') {
    const base = now.startOf(actualUnit);
    start = base.add(1, unit).startOf(actualUnit);
    end = start.add(number - 1, unit).endOf(actualUnit);
  } else {
    throw new Error(`Unsupported type: ${type}`);
  }
  return [
    start.format('YYYY-MM-DD HH:mm:ss'),
    end.format('YYYY-MM-DD HH:mm:ss'),
  ];
};

const getStart = (offset: number, unit: DateUnit, tz?: string): dayjs.Dayjs => {
  const actualUnit = unit === 'isoWeek' ? 'week' : unit;
  return getNow(tz)
    .add(offset, actualUnit as dayjs.ManipulateType)
    .startOf(unit as UnitType);
};

const getEnd = (offset: number, unit: DateUnit, tz?: string): dayjs.Dayjs => {
  const actualUnit = unit === 'isoWeek' ? 'week' : unit;
  return getNow(tz)
    .add(offset, actualUnit as dayjs.ManipulateType)
    .endOf(unit as UnitType);
};

const strategies: Record<
  Exclude<RangeType, 'past' | 'next'>,
  (params?: RangeParams) => [dayjs.Dayjs, dayjs.Dayjs]
> = {
  today: (params) => [
    getStart(0, 'day', params?.timezone),
    getEnd(0, 'day', params?.timezone),
  ],
  yesterday: (params) => [
    getStart(-1, 'day', params?.timezone),
    getEnd(-1, 'day', params?.timezone),
  ],
  tomorrow: (params) => [
    getStart(1, 'day', params?.timezone),
    getEnd(1, 'day', params?.timezone),
  ],
  thisWeek: (params) => [
    getStart(0, 'isoWeek', params?.timezone),
    getEnd(0, 'isoWeek', params?.timezone),
  ],
  lastWeek: (params) => [
    getStart(-1, 'isoWeek', params?.timezone),
    getEnd(-1, 'isoWeek', params?.timezone),
  ],
  nextWeek: (params) => [
    getStart(1, 'isoWeek', params?.timezone),
    getEnd(1, 'isoWeek', params?.timezone),
  ],
  thisMonth: (params) => [
    getStart(0, 'month', params?.timezone),
    getEnd(0, 'month', params?.timezone),
  ],
  lastMonth: (params) => [
    getStart(-1, 'month', params?.timezone),
    getEnd(-1, 'month', params?.timezone),
  ],
  nextMonth: (params) => [
    getStart(1, 'month', params?.timezone),
    getEnd(1, 'month', params?.timezone),
  ],
  thisQuarter: (params) => [
    getStart(0, 'quarter', params?.timezone),
    getEnd(0, 'quarter', params?.timezone),
  ],
  lastQuarter: (params) => [
    getStart(-1, 'quarter', params?.timezone),
    getEnd(-1, 'quarter', params?.timezone),
  ],
  nextQuarter: (params) => [
    getStart(1, 'quarter', params?.timezone),
    getEnd(1, 'quarter', params?.timezone),
  ],
  thisYear: (params) => [
    getStart(0, 'year', params?.timezone),
    getEnd(0, 'year', params?.timezone),
  ],
  lastYear: (params) => [
    getStart(-1, 'year', params?.timezone),
    getEnd(-1, 'year', params?.timezone),
  ],
  nextYear: (params) => [
    getStart(1, 'year', params?.timezone),
    getEnd(1, 'year', params?.timezone),
  ],
};

export const getDayRangeByParams = (params: RangeParams): [string, string] => {
  if (params.type === 'past' || params.type === 'next') {
    return getOffsetRangeByParams(params);
  }
  const fn = strategies[params.type];
  if (!fn) throw new Error(`Unsupported type: ${params.type}`);
  const [start, end] = fn(params);
  return [
    start.format('YYYY-MM-DD HH:mm:ss'),
    end.format('YYYY-MM-DD HH:mm:ss'),
  ];
};

export function utc2unit(options: {
  now?: any;
  unit: any;
  timezone?: string | number;
  offset?: number;
}) {
  const { now, unit, timezone = '+00:00', offset } = options;
  let m = now ? dayjs(now) : dayjs();
  m = m.utcOffset(offsetFromString(timezone) as number);
  m = m.startOf(unit);
  if (offset > 0) {
    m = m.add(offset, unit);
  } else if (offset < 0) {
    m = m.subtract(-1 * offset, unit);
  }
  const fn: Record<string, () => string> = {
    year: () => m.format('YYYY'),
    quarter: () => m.format('YYYY[Q]Q'),
    month: () => m.format('YYYY-MM'),
    week: () => m.format('gggg[w]ww'),
    isoWeek: () => m.format('GGGG[W]WW'),
    day: () => m.format('YYYY-MM-DD'),
  };
  const r = fn[unit]?.();
  return timezone ? r + timezone : r;
}

type ToUnitParams = {
  now?: any;
  timezone?: string | number;
  field?: {
    timezone?: string | number;
  };
};

export const toUnit = (unit: string, offset?: number) => {
  return ({ now, timezone, field }: ToUnitParams) => {
    if (field?.timezone) {
      timezone = field?.timezone;
    }
    return utc2unit({ now, timezone, unit, offset });
  };
};

export function getDayRange(options: {
  now?: any;
  timezone?: string | number;
  offset: number;
}) {
  const { now, timezone = '+00:00', offset } = options;
  let m = (now ? dayjs(now) : dayjs()).utcOffset(
    offsetFromString(timezone) as number,
  );
  if (offset > 0) {
    return [
      (m = m.add(1, 'day').startOf('day')).format('YYYY-MM-DD'),
      m.clone().add(offset, 'day').startOf('day').format('YYYY-MM-DD'),
      '[)',
      timezone,
    ];
  }
  return [
    m
      .clone()
      .subtract(-1 * offset - 1, 'day')
      .startOf('day')
      .format('YYYY-MM-DD'),
    m.clone().add(1, 'day').startOf('day').format('YYYY-MM-DD'),
    '[)',
    timezone,
  ];
}

const toDays = (offset: number) => {
  return ({ now, timezone, field }: ToUnitParams) => {
    if (field?.timezone) {
      timezone = field?.timezone;
    }
    return getDayRange({ now, timezone, offset });
  };
};

export function getDateVars() {
  return {
    now: new Date().toISOString(),
    today: toUnit('day'),
    yesterday: toUnit('day', -1),
    tomorrow: toUnit('day', 1),
    thisWeek: toUnit('week'),
    lastWeek: toUnit('week', -1),
    nextWeek: toUnit('week', 1),
    thisIsoWeek: toUnit('isoWeek'),
    lastIsoWeek: toUnit('isoWeek', -1),
    nextIsoWeek: toUnit('isoWeek', 1),
    thisMonth: toUnit('month'),
    lastMonth: toUnit('month', -1),
    nextMonth: toUnit('month', 1),
    thisQuarter: toUnit('quarter'),
    lastQuarter: toUnit('quarter', -1),
    nextQuarter: toUnit('quarter', 1),
    thisYear: toUnit('year'),
    lastYear: toUnit('year', -1),
    nextYear: toUnit('year', 1),
    last7Days: toDays(-7),
    next7Days: toDays(7),
    last30Days: toDays(-30),
    next30Days: toDays(30),
    last90Days: toDays(-90),
    next90Days: toDays(90),
  };
}
