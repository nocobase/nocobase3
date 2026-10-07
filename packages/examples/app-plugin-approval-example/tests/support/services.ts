// The organization most scenarios resolve people in, and fakes of the
// external systems effects call, with switches to make them fail.
import type { OrgSnapshot } from '../../server/scenarios/org.js';
import {
  PaymentDeclined,
  type ExternalSystems,
} from '../../server/scenarios/services.js';

/**
 * zhang → li → wang → vp → ceo is the management chain. Finance, legal and
 * the committee are groups; admin administers approvals, sup supervises the
 * finance pool, assistant may submit for zhang.
 */
export const ORG: OrgSnapshot = {
  people: [
    'zhang',
    'li',
    'wang',
    'zhao',
    'vp',
    'ceo',
    'hr',
    'finA',
    'finB',
    'finC',
    'legalA',
    'legalB',
    'legalC',
    'legalLead',
    'lawyer',
    'm1',
    'm2',
    'm3',
    'm4',
    'm5',
    'admin',
    'sup',
    'assistant',
  ],
  managers: {
    zhang: 'li',
    li: 'wang',
    zhao: 'wang',
    wang: 'vp',
    vp: 'ceo',
    assistant: 'li',
  },
  roles: {
    hr: ['hr'],
    vp: ['vp'],
    ceo: ['ceo'],
    finance: ['finA', 'finB', 'finC'],
    legal: ['legalA', 'legalB', 'legalC'],
    legalLead: ['legalLead'],
    lawyer: ['lawyer'],
    committee: ['m1', 'm2', 'm3', 'm4', 'm5'],
    approvalAdmin: ['admin'],
    poolSupervisor: ['sup'],
  },
  proxies: { assistant: ['zhang'] },
};

export interface SentMessage {
  readonly to: string;
  readonly subject: string;
  readonly key: string;
}

/** Fakes of the external systems, with switches to make them fail. */
export class FakeExternal implements ExternalSystems {
  public readonly payments: Map<
    string,
    { reference: string; payee: string; amountCents: number }
  > = new Map();
  public readonly calls: string[] = [];
  /** Balance available for payments; a payment above it is declined. */
  public balanceCents: number = Number.POSITIVE_INFINITY;
  /** Calls of these kinds throw a transient error this many more times. */
  public readonly outages: Map<string, number> = new Map();
  /** Pay, then lose the response: the payment exists but the caller sees an error. */
  public loseNextPaymentResponse: boolean = false;
  public companyRisk: Record<string, 'low' | 'high'> = {};
  public readonly accounts: Map<string, string> = new Map();
  public readonly rolledBack: string[] = [];

  private outage(kind: string): void {
    const remaining = this.outages.get(kind) ?? 0;
    if (remaining > 0) {
      this.outages.set(kind, remaining - 1);
      throw new Error(`${kind} is unavailable.`);
    }
  }

  public pay(
    key: string,
    payee: string,
    amountCents: number,
  ): { reference: string } {
    this.calls.push(`pay:${key}`);
    this.outage('pay');
    const existing = this.payments.get(key);
    if (existing) return { reference: existing.reference };
    if (amountCents > this.balanceCents)
      throw new PaymentDeclined('Insufficient balance.');
    this.balanceCents -= amountCents;
    const payment = {
      reference: `PAY-${this.payments.size + 1}`,
      payee,
      amountCents,
    };
    this.payments.set(key, payment);
    if (this.loseNextPaymentResponse) {
      this.loseNextPaymentResponse = false;
      throw new Error('The payment response was lost.');
    }
    return { reference: payment.reference };
  }

  public findPayment(key: string): { reference: string } | undefined {
    const payment = this.payments.get(key);
    return payment ? { reference: payment.reference } : undefined;
  }

  public checkCompany(registrationNo: string): { risk: 'low' | 'high' } {
    this.calls.push(`checkCompany:${registrationNo}`);
    this.outage('checkCompany');
    return { risk: this.companyRisk[registrationNo] ?? 'low' };
  }

  public createSupplierAccount(
    key: string,
    supplierName: string,
  ): { account: string } {
    this.calls.push(`createSupplierAccount:${key}`);
    this.outage('createSupplierAccount');
    const existing = this.accounts.get(key);
    if (existing) return { account: existing };
    const account = `ACC-${this.accounts.size + 1}-${supplierName}`;
    this.accounts.set(key, account);
    return { account };
  }

  public runOnboardingStep(key: string, step: string): { done: string } {
    this.calls.push(`step:${step}:${key}`);
    this.outage(`step:${step}`);
    return { done: step };
  }

  public rollBackPreparation(key: string, item: string): void {
    this.calls.push(`rollBack:${item}:${key}`);
    this.rolledBack.push(item);
  }
}
