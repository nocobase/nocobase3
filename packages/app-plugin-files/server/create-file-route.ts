import { Hono } from 'hono';

import type { CreateFileRouteOptions } from './types.js';

export function createFileRoute(_options: CreateFileRouteOptions): Hono {
  throw new Error('File route creation is not implemented yet.');
}
