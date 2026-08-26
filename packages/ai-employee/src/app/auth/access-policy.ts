import type { RuntimeActor } from '../../index.js';

export class AIEmployeeAccessPolicy {
  canManage(actor: RuntimeActor): boolean {
    return actor.roles.some(
      (role) => role === 'root' || role === 'admin' || role === 'ai-admin',
    );
  }

  assertCanManage(actor: RuntimeActor): void {
    if (!this.canManage(actor)) {
      const err: any = new Error(
        'AI resource management requires an administrator role',
      );
      err.status = 403;
      throw err;
    }
  }
}
