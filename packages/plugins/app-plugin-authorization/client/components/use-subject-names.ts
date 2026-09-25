import { useEffect, useMemo, useState } from 'react';
import type {
  AuthorizationSubject,
  SubjectTypeOption,
} from '../authorization-client.js';
import { useAuthorizationClient } from '../use-authorization-client.js';

export function subjectKey(subject: AuthorizationSubject): string {
  return JSON.stringify([subject.type, subject.id]);
}

/** What a resolved subject is called, and where it is managed when its type says. */
export interface SubjectDetails {
  title: string;
  manage?: string;
}

/**
 * Resolves collection subjects through the surface's `resolve` route, keyed
 * by {@link subjectKey}. Fixed audiences carry their type's label; a subject
 * nobody resolved is absent.
 */
export function useSubjectDetails(
  settings: string,
  types: readonly SubjectTypeOption[],
  subjects: readonly AuthorizationSubject[],
): Readonly<Record<string, SubjectDetails>> {
  const authz = useAuthorizationClient();
  const identity = JSON.stringify([
    settings,
    types
      .filter((type) => type.selection?.type === 'collection')
      .map(({ value, selection }) => ({ value, selection })),
    [
      ...new Map(
        subjects.map((subject) => [subjectKey(subject), subject]),
      ).values(),
    ],
  ]);
  const [state, setState] = useState<{
    identity: string;
    details: Record<string, SubjectDetails>;
  }>();
  useEffect(() => {
    let active = true;
    const [settings, types, subjects] = JSON.parse(identity) as [
      string,
      Pick<SubjectTypeOption, 'value' | 'selection'>[],
      AuthorizationSubject[],
    ];
    const details: Record<string, SubjectDetails> = {};
    async function resolve(): Promise<void> {
      await Promise.all(
        types.map(async (type) => {
          const selection = type.selection;
          if (selection?.type !== 'collection') return;
          const ids = subjects
            .filter((subject) => subject.type === type.value)
            .map((subject) => subject.id);
          for (let offset = 0; offset < ids.length; offset += 100) {
            try {
              const items = await authz.resolveSubjects(
                settings,
                type.value,
                ids.slice(offset, offset + 100),
              );
              for (const item of items)
                details[subjectKey({ type: type.value, id: item.id })] = {
                  title: item.title,
                  ...(item.manage === undefined ? {} : { manage: item.manage }),
                };
            } catch {
              /* Unknown or unreadable objects keep their ids. */
            }
          }
        }),
      );
      if (active) setState({ identity, details });
    }
    void resolve();
    return () => {
      active = false;
    };
  }, [authz, identity]);
  const resolved = state?.identity === identity ? state.details : undefined;
  return useMemo(
    () => ({
      ...resolved,
      ...Object.fromEntries(
        types.flatMap((type) =>
          type.selection?.type === 'fixed'
            ? [
                [
                  subjectKey({ type: type.value, id: type.selection.id }),
                  { title: type.label },
                ],
              ]
            : [],
        ),
      ),
    }),
    [resolved, types],
  );
}

/** {@link useSubjectDetails}, reduced to each subject's title. */
export function useSubjectNames(
  settings: string,
  types: readonly SubjectTypeOption[],
  subjects: readonly AuthorizationSubject[],
): Readonly<Record<string, string>> {
  const details = useSubjectDetails(settings, types, subjects);
  return useMemo(
    () =>
      Object.fromEntries(
        Object.entries(details).map(([key, value]) => [key, value.title]),
      ),
    [details],
  );
}
