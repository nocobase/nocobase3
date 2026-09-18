import { RecordAccessBuilder } from './builders.js';
import {
  allRecords,
  customFilter,
  recordsICreated,
  recordsIOwn,
  type RecordAccessPolicy,
} from './record-access.js';

export class RecordAccessPolicyRegistry {
  private readonly policies = new Map<string, RecordAccessPolicy>();

  constructor() {
    this.add(allRecords());
    this.add(recordsIOwn());
    this.add(recordsICreated());
    this.add(customFilter());
  }

  add<P = unknown>(policy: RecordAccessPolicy<P>): void {
    if (this.policies.has(policy.key)) {
      throw new Error(
        `Database Record Access Policy already registered: ${policy.key}`,
      );
    }
    this.policies.set(policy.key, policy);
  }

  define<const K extends string, const C extends string>(
    key: K,
    options: {
      collections: readonly C[];
      title?: import('../i18n.js').OptionText;
    },
  ): RecordAccessBuilder<
    Record<string, import('@nocobase/db').FilterLiteral>,
    C,
    K
  > {
    return new RecordAccessBuilder(this, { key, ...options });
  }

  get(key: string): RecordAccessPolicy | undefined {
    return this.policies.get(key);
  }

  listFor(collection: {
    name: string;
    fields: readonly string[];
  }): readonly RecordAccessPolicy[] {
    return this.list().filter(
      (policy) =>
        (!policy.collections || policy.collections.includes(collection.name)) &&
        (!policy.requiredFields ||
          policy.requiredFields.every((field) =>
            collection.fields.includes(field),
          )),
    );
  }
  list(): readonly RecordAccessPolicy[] {
    return [...this.policies.values()];
  }
}
