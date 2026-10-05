import type { JsonObject } from '@nocobase/lifecycle';

import type { Resolver, StageRule } from '../../../shared/approval-trail.js';

export type { Resolver, StageRule } from '../../../shared/approval-trail.js';

export interface StagePlan {
  readonly key: string;
  readonly title: string;
  readonly resolver: Resolver;
  readonly rule: StageRule;
  /**
   * The content fields this stage's approval covers; a change to any of
   * them makes the approval void. Absent covers the whole content.
   */
  readonly fields?: readonly string[];
  /**
   * When the assignees are chosen: at submission, or when the stage is
   * entered (scenario 4). Defaults to `enter`.
   */
  readonly resolveAt?: 'submit' | 'enter';
  /** Assignees of this stage may edit the content (scenario 11). */
  readonly canRevise?: boolean;
  /** An idle single assignee is passed to their manager. */
  readonly escalate?: boolean;
  /** A role a person must hold to be (re)assigned here (scenario 16). */
  readonly qualification?: string;
  /** Why this stage is in the plan, kept for the history (scenario 2). */
  readonly because?: string;
}

/** Builds a request's stages from its content: one function per rule version. */
export type PlanBuilder = (
  content: JsonObject,
  applicantId: string,
) => readonly StagePlan[];

export interface ApprovalPolicy {
  readonly title: string;
  /** Rule versions by name. A request keeps the version it was first submitted under. */
  readonly versions: Readonly<Record<string, PlanBuilder>>;
  /** The version a request submitted now gets. */
  currentVersion: string;
  /** A person who already approved this round passes a later stage of theirs (8). */
  readonly skipRepeated?: boolean;
  /**
   * After a return to the applicant: re-review everything, or keep the
   * approvals whose covered fields did not change (12).
   */
  readonly resubmit?: 'full' | 'keepValid';
  /** One open request per subject at a time (28). */
  readonly exclusivePerSubject?: boolean;
  /** Proxies listed in the directory may submit for an applicant (22). */
  readonly proxySubmit?: boolean;
  /** Assignees may add signers (14). */
  readonly allowAddSigner?: boolean;
  /** A decision waits for the consultations it asked for (26). */
  readonly consultationsBlockDecision?: boolean;
  /** Who is told once the request is approved (25). */
  readonly carbonCopy?: (content: JsonObject) => readonly string[];
}

/**
 * The approval rules by request kind. A lifecycle definition is code and has
 * no versions of its own, so what must stay fixed for a request in flight —
 * the rule version and the plan it produced — is data on the record, and
 * the rules live here under explicit version names.
 */
export class PolicyRegistry {
  private readonly policies = new Map<string, ApprovalPolicy>();

  public constructor(policies: Readonly<Record<string, ApprovalPolicy>>) {
    for (const [kind, policy] of Object.entries(policies))
      this.policies.set(kind, policy);
  }

  public get(kind: string): ApprovalPolicy {
    const policy = this.policies.get(kind);
    if (!policy) throw new Error(`No approval policy for "${kind}".`);
    return policy;
  }

  public has(kind: string): boolean {
    return this.policies.has(kind);
  }

  public plan(
    kind: string,
    version: string,
    content: JsonObject,
    applicantId: string,
  ): readonly StagePlan[] {
    const builder = this.get(kind).versions[version];
    if (!builder)
      throw new Error(`Approval policy "${kind}" has no version "${version}".`);
    return builder(content, applicantId);
  }

  /** Changes the version new requests get; requests in flight keep theirs. */
  public publish(kind: string, version: string): void {
    const policy = this.get(kind);
    if (!(version in policy.versions))
      throw new Error(`Approval policy "${kind}" has no version "${version}".`);
    policy.currentVersion = version;
  }
}

/** A single responsible approver. */
export const SINGLE: StageRule = Object.freeze({
  kind: 'all',
  onReject: 'immediate',
});
