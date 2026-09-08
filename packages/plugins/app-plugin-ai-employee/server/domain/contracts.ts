export interface Actor {
  readonly id: string | number;
  readonly roles: readonly string[];
  readonly isRoot: boolean;
  readonly locale?: string;
  readonly scope?: string;
}

export interface ModelRef {
  readonly llmService: string;
  readonly model: string;
}

export type Translate = (
  key: string,
  options?: Record<string, unknown>,
) => string;

export const identityTranslate: Translate = (key) => key;
