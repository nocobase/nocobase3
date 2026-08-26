import { createHash, randomUUID } from 'node:crypto';
import type { RuntimeActor } from '@nocobase/ai-employee';

export interface CurrentActorResolver {
  resolve(request: Request): RuntimeActor;
}

export class HeaderCurrentActorResolver implements CurrentActorResolver {
  resolve(request: Request): RuntimeActor {
    const id =
      request.headers.get('x-user-id') ??
      request.headers.get('x-actor-id') ??
      actorFromBearer(request.headers.get('authorization')) ??
      'anonymous';
    const roles = splitHeader(
      request.headers.get('x-roles') ?? request.headers.get('x-role'),
    );
    const locale = request.headers.get('x-locale') ?? undefined;
    const scope = request.headers.get('x-app-scope') ?? undefined;
    return { id, roles, locale, scope };
  }
}

export function requestId(request: Request): string {
  return request.headers.get('x-request-id') ?? randomUUID();
}

function actorFromBearer(header: string | null): string | undefined {
  if (!header?.startsWith('Bearer ')) return undefined;
  const token = header.slice('Bearer '.length).trim();
  if (!token) return undefined;
  const jwtSubject = readJwtSubject(token);
  if (jwtSubject) return `user:${jwtSubject}`;
  return `token:${createHash('sha256').update(token).digest('hex').slice(0, 16)}`;
}

function readJwtSubject(token: string): string | undefined {
  const payload = token.split('.')[1];
  if (!payload) return undefined;
  try {
    const decoded = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as { sub?: unknown; userId?: unknown; id?: unknown };
    const value = decoded.sub ?? decoded.userId ?? decoded.id;
    return typeof value === 'string' || typeof value === 'number'
      ? String(value)
      : undefined;
  } catch {
    return undefined;
  }
}

function splitHeader(value: string | null): string[] {
  const roles =
    value
      ?.split(/[\s,]+/)
      .map((role) => role.trim())
      .filter(Boolean) ?? [];
  return roles.length ? [...new Set(roles)] : ['member'];
}
