import type { AuthorizationIdentity, AuthorizationSubject } from './types.js';

export function resolveAuthorizationSubjects(
  identity: AuthorizationIdentity,
): readonly AuthorizationSubject[] {
  const subjects: AuthorizationSubject[] = [
    { type: identity.principal.type, id: identity.principal.id },
    ...(identity.subjects ?? []),
  ];
  const seen = new Set<string>();
  return subjects.filter((subject) => {
    const key = `${subject.type}\u0000${subject.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
