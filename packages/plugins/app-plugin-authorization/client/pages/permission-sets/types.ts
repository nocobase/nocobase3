/** The editable shape of a permission set while the panel holds it. */
export interface Draft {
  originalKey?: string;
  key: string;
  title: string;
  originalTitle?: string | { key: string; ns: string };
  initialTitle?: string;
  grants: readonly GrantDraft[];
}

export interface GrantDraft {
  id: number;
  resource: { type: string; id: string };
  actions: readonly string[];
  policies?: Readonly<
    Record<string, { type: string; [key: string]: unknown } | undefined>
  >;
}
