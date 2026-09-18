import { describe, expect, it } from 'vitest';
import { redactDeploymentDiagnostic } from '../src/deployment-events.js';

describe('deployment diagnostic redaction', () => {
  it('preserves the error context while removing credentials', () => {
    const result = redactDeploymentDiagnostic(
      'ECONNREFUSED postgres://admin:private-value@db:5432 password="other-private" token=private-token Bearer private-bearer',
    );
    expect(result).toContain('ECONNREFUSED');
    expect(result).toContain('db:5432');
    expect(result).not.toContain('private');
    expect(result).not.toContain('admin');
  });
  it('bounds oversized messages', () => {
    expect(redactDeploymentDiagnostic('x'.repeat(5000))).toHaveLength(2000);
  });
});
