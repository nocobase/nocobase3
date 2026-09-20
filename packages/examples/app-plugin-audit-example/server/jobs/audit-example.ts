import { Job, type JobOptions } from '@nocobase/queue';
import type { AppAudit } from '@nocobase/app-plugin-audit/server';
import type { AppAuthorizationService } from '@nocobase/app-plugin-authorization';
import type { CustomerService } from '../services/audit-example.js';
import { parseCustomerUpdate } from '../input.js';
import type { CustomerUpdate } from '../types.js';

export interface CustomerMaintenancePayload {
  readonly ownerId: string;
  readonly input: CustomerUpdate;
}
export interface CustomerMaintenanceDependencies {
  readonly customers: CustomerService;
  readonly audit: AppAudit;
  readonly authorization: AppAuthorizationService;
}
export default class CustomerMaintenanceJob extends Job<CustomerMaintenancePayload> {
  public static options: JobOptions = {
    name: '@nocobase/app-plugin-audit-example/customer-maintenance',
    queue: 'default',
  };
  public constructor(
    private readonly dependencies: CustomerMaintenanceDependencies,
  ) {
    super();
  }
  public async execute(): Promise<void> {
    const { customers, audit, authorization } = this.dependencies;
    const { ownerId } = this.payload;
    if (typeof ownerId !== 'string' || !ownerId)
      throw new Error('Customer maintenance requires its trusted initiator.');
    const input = parseCustomerUpdate(this.payload.input);
    const identity = authorization.for({
      principal: { type: 'user', id: ownerId },
      subjects: [{ type: 'authenticated', id: '*' }],
    });
    const bound = audit.for({
      actor: { type: 'service', id: 'customer-maintenance' },
      initiator: { type: 'user', id: ownerId },
      source: {
        type: 'job',
        jobId: this.context.jobId,
        attempt: this.context.attempt,
      },
    });
    await customers.update(identity, input, bound);
  }
}
