import { createHash, randomUUID } from 'node:crypto';

import { EncryptJWT, jwtDecrypt, type JWTPayload } from 'jose';

export interface SessionCookiePayload extends JWTPayload {
  sid: string;
}

export function generateSessionId(): string {
  return randomUUID();
}

export async function encryptSessionCookie(
  payload: SessionCookiePayload,
  secret: string,
  expiresAt: number,
): Promise<string> {
  return new EncryptJWT({ sid: payload.sid })
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt / 1000))
    .encrypt(createSecretKey(secret));
}

export async function decryptSessionCookie(
  token: string,
  secrets: string[],
): Promise<SessionCookiePayload | null> {
  for (const secret of secrets) {
    try {
      const result = await jwtDecrypt(token, createSecretKey(secret));
      const sid = result.payload.sid;
      if (typeof sid === 'string' && sid) {
        return { ...result.payload, sid };
      }
    } catch {
      continue;
    }
  }

  return null;
}

function createSecretKey(secret: string): Uint8Array {
  return createHash('sha256').update(secret).digest();
}
