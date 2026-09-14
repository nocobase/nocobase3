import type { AuthClient } from './auth-client.js';

export type AuthSession = AuthClient['$Infer']['Session'];
export type AuthSessionUser = AuthSession['user'];
