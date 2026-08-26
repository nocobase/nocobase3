export type CurrentUser = {
  id: string | number;
  roles: string[];
  isRoot: boolean;
  locale?: string;
  scope?: string;
};

export type RuntimeActor = {
  id: string;
  roles: string[];
  locale?: string;
  scope?: string;
};

export interface RuntimeIdGenerator {
  generate(): string | number | bigint;
}
