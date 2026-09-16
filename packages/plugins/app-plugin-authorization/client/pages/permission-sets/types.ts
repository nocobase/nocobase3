/** The editable shape of a permission set while the panel holds it. */
export interface Draft {
  originalKey?: string;
  key: string;
  title: string;
  grants: readonly GrantDraft[];
}

export interface GrantDraft {
  id: number;
  resource: { type: string; id: string };
  actions: readonly string[];
  database: Readonly<Record<string, DatabaseActionDraft>>;
}

export interface DatabaseActionDraft {
  input: '*' | readonly string[];
  output: '*' | readonly string[];
  recordAccess: RecordAccessDraft;
}

export type RecordAccessDraft =
  | string
  | {
      key: string;
      params?: unknown;
    };
