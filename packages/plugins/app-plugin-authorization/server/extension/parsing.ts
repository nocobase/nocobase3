import {
  parseAuthorizationTitle,
  parseRecordSelection,
  type AuthorizationSubject,
  type AuthorizationTitle,
  type RecordSelection,
  type ResourceRef,
  type RuleAction,
} from '@nocobase/authorization/core';

/** The fields every rule shares; `subjects` and friends only for sharing and restriction. */
export interface ParsedRule {
  key: string;
  resource: ResourceRef;
  actions: readonly RuleAction[];
  title?: AuthorizationTitle;
  subjects?: readonly AuthorizationSubject[];
  reason?: string;
}

export interface RequestParsers {
  object(value: unknown, label: string): Record<string, unknown>;
  string(value: unknown, label: string): string;
  strings(value: unknown, label: string): readonly string[];
  title(value: unknown): AuthorizationTitle | undefined;
  resource(value: unknown): ResourceRef;
  subjects(value: unknown): readonly AuthorizationSubject[];
  selection(value: unknown): RecordSelection;
  ruleActions(value: unknown): readonly RuleAction[];
  /** A rule body; `withSubjects` also reads `title`, `subjects` and `reason`. */
  rule(value: unknown, options?: { withSubjects?: boolean }): ParsedRule;
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim())
    throw new TypeError(`${label} must be a non-empty string`);
  return value.trim();
}

function strings(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  return value.map((item) => string(item, label));
}

function resource(value: unknown): ResourceRef {
  const item = object(value, 'resource');
  return {
    type: string(item.type, 'resource type'),
    id: string(item.id, 'resource id'),
  };
}

function subjects(value: unknown): readonly AuthorizationSubject[] {
  if (!Array.isArray(value)) throw new TypeError('subjects must be an array');
  return value.map((item) => {
    const subject = object(item, 'subject');
    return {
      type: string(subject.type, 'subject type'),
      id: string(subject.id, 'subject id'),
    };
  });
}

function ruleActions(value: unknown): readonly RuleAction[] {
  if (!Array.isArray(value)) throw new TypeError('actions must be an array');
  return value.map((entry) => {
    const item = object(entry, 'action');
    return {
      action: string(item.action, 'action'),
      ...(item.scopeKey === undefined
        ? {}
        : { scopeKey: string(item.scopeKey, 'scopeKey') }),
      selection: parseRecordSelection(item.selection),
    };
  });
}

/**
 * Request body parsers for authorization settings routes. Each failure is a
 * TypeError, which `createSettingsRouter` answers as `400`.
 */
export const parse: RequestParsers = {
  object,
  string,
  strings,
  title: (value) =>
    value === undefined || value === null || value === ''
      ? undefined
      : parseAuthorizationTitle(value),
  resource,
  subjects,
  selection: parseRecordSelection,
  ruleActions,
  rule(value, options = {}) {
    const input = object(value, 'rule');
    const title = parse.title(input.title);
    return {
      key: string(input.key, 'key'),
      resource: resource(input.resource),
      actions: ruleActions(input.actions),
      ...(options.withSubjects
        ? {
            ...(title === undefined ? {} : { title }),
            subjects: subjects(input.subjects),
            ...(input.reason ? { reason: string(input.reason, 'reason') } : {}),
          }
        : {}),
    };
  },
};
