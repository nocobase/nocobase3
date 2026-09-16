import { useEffect, useState } from 'react';
import type {
  AuthorizationSubject,
  SubjectSettings,
  SubjectTypeOption,
} from '../authorization-client.js';
import { getAuthorizationClient } from '../runtime.js';

const authz = getAuthorizationClient();
export function subjectKey(subject: AuthorizationSubject): string {
  return JSON.stringify([subject.type, subject.id]);
}

export function useSubjectNames(
  settings: SubjectSettings,
  types: readonly SubjectTypeOption[],
  subjects: readonly AuthorizationSubject[],
): Readonly<Record<string, string>> {
  const identity = JSON.stringify([
    settings,
    types,
    [
      ...new Map(
        subjects.map((subject) => [subjectKey(subject), subject]),
      ).values(),
    ],
  ]);
  const [state, setState] = useState<{
    identity: string;
    names: Record<string, string>;
  }>();
  useEffect(() => {
    let active = true;
    const [settings, types, subjects] = JSON.parse(identity) as [
      SubjectSettings,
      SubjectTypeOption[],
      AuthorizationSubject[],
    ];
    const names: Record<string, string> = {};
    async function resolve(): Promise<void> {
      await Promise.all(
        types.map(async (type) => {
          const selection = type.selection;
          if (selection?.type === 'fixed') {
            names[subjectKey({ type: type.value, id: selection.id })] =
              type.label;
            return;
          }
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
                names[subjectKey({ type: type.value, id: item.id })] =
                  item.title;
            } catch {
              /* Unknown or unreadable objects keep their ids. */
            }
          }
        }),
      );
      if (active) setState({ identity, names });
    }
    void resolve();
    return () => {
      active = false;
    };
  }, [identity]);
  return state?.identity === identity ? state.names : {};
}
