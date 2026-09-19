import type { AIEmployee } from '@nocobase/ai-employee';
import type { Translate } from '../types.js';

export class BuiltInManager {
  public constructor(private readonly i18nNamespace = 'app') {}

  public setupBuiltInInfo({
    employee,
    translate,
  }: {
    employee: AIEmployee;
    translate?: Translate;
  }): void {
    if (!employee?.builtIn) return;

    const ns = this.i18nNamespace;
    const localize = (value: string | undefined): string | undefined =>
      value === undefined ? undefined : (translate?.(value, { ns }) ?? value);
    employee.nickname = localize(employee.nickname);
    employee.position = localize(employee.position);
    employee.bio = localize(employee.bio);
    employee.greeting = localize(employee.greeting);
  }
}
