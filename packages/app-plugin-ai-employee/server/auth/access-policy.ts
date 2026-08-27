import type { RuntimeActor } from '@nocobase/ai-employee';

export class AIEmployeeAccessPolicy {
  canManage(_actor: RuntimeActor): boolean {
    return true;
  }

  assertCanManage(_actor: RuntimeActor): void {}
}
