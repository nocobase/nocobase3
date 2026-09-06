import { createHash } from 'node:crypto';
import { CronExpressionParser } from 'cron-parser';

export type JsonValue =
  null | boolean | number | string | JsonValue[] | JsonObject;
export type JsonObject = { readonly [key: string]: JsonValue };

export interface ScheduleDefinition {
  readonly key: string;
  readonly title: string;
  readonly description?: string;
  readonly schedule: {
    readonly cron: string;
    readonly timezone?: string;
    readonly from?: Date;
    readonly to?: Date;
    readonly limit?: number;
  };
  readonly enabled?: boolean;
  readonly target: { readonly type: string; readonly config: JsonObject };
}

export interface NormalizedScheduleDefinition extends Omit<
  ScheduleDefinition,
  'schedule' | 'enabled'
> {
  readonly schedule: Required<
    Pick<ScheduleDefinition['schedule'], 'cron' | 'timezone'>
  > &
    Omit<ScheduleDefinition['schedule'], 'cron' | 'timezone'>;
  readonly enabled: boolean;
  readonly definitionHash: string;
}

function freezeDeep<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>))
      freezeDeep(child);
  }
  return value;
}

export function defineSchedule(
  definition: ScheduleDefinition,
): NormalizedScheduleDefinition {
  if (!definition.key || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(definition.key))
    throw new Error('Schedule key must be a stable identifier.');
  if (!definition.title) throw new Error('Schedule title is required.');
  const parts = definition.schedule?.cron?.trim().split(/\s+/) ?? [];
  if (parts.length !== 5 && parts.length !== 6)
    throw new Error('Schedule cron must contain five or six fields.');
  const timezone = definition.schedule.timezone ?? 'UTC';
  try {
    CronExpressionParser.parse(definition.schedule.cron, {
      currentDate: new Date('2020-01-01T00:00:00.000Z'),
      tz: timezone,
    });
  } catch {
    throw new Error('Schedule cron or timezone is invalid.');
  }
  if (!definition.target?.type)
    throw new Error('Schedule target type is required.');
  assertNoSensitiveConfig(definition.target.config);
  if (
    definition.schedule.limit !== undefined &&
    (!Number.isInteger(definition.schedule.limit) ||
      definition.schedule.limit < 1)
  )
    throw new Error('Schedule limit must be a positive integer.');
  if (
    definition.schedule.from &&
    definition.schedule.to &&
    definition.schedule.from > definition.schedule.to
  )
    throw new Error('Schedule from must not be after to.');
  const normalized = {
    ...definition,
    schedule: {
      ...definition.schedule,
      cron: definition.schedule.cron.trim(),
      timezone,
    },
    enabled: definition.enabled ?? true,
  } as Omit<NormalizedScheduleDefinition, 'definitionHash'>;
  const canonical = stableStringify(normalized);
  return freezeDeep({
    ...normalized,
    definitionHash: createHash('sha256').update(canonical).digest('hex'),
  });
}

const SENSITIVE_CONFIG_KEY =
  /(?:apiKey|accessKey|accessToken|refreshToken|clientSecret|credential|credentials|password|privateKey|secret|token)$/i;

function assertNoSensitiveConfig(
  value: JsonValue,
  path: string = 'target.config',
): void {
  if (Array.isArray(value)) {
    value.forEach((child, index) =>
      assertNoSensitiveConfig(child, `${path}[${index}]`),
    );
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_CONFIG_KEY.test(key.replaceAll(/[_-]/g, '')))
      throw new Error(
        `Schedule ${path}.${key} must not contain credentials, tokens, or secrets.`,
      );
    assertNoSensitiveConfig(child, `${path}.${key}`);
  }
}

function stableStringify(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value))
    return `[${value.map((child) => stableStringify(child)).join(',')}]`;
  if (value && typeof value === 'object') {
    const pairs = Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`,
      );
    return `{${pairs.join(',')}}`;
  }
  return JSON.stringify(value);
}
