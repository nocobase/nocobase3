import type { AuditErrorCode, AuditErrorDto } from './contracts.js';

/** Error text is deliberately independent of input values and property names. */
export class AuditError extends Error implements AuditErrorDto {
  readonly ns: AuditErrorDto['ns'] = '@nocobase/app-plugin-audit';
  readonly key: string;

  constructor(readonly code: AuditErrorCode) {
    super(code);
    this.name = 'AuditError';
    this.key = code;
  }
}
