import type { AuthEnv } from '@nocobase/app-plugin-authentication/server';
import type { Context } from 'hono';
import { Hono } from 'hono';

import type { JsonRecord } from '../internal-types.js';
import type { PageOptions } from '../services/pagination.js';

export type KnowledgeBaseRouteContext = Context<AuthEnv>;

export function data(
  context: KnowledgeBaseRouteContext,
  value: unknown,
  status = 200,
): Response {
  return context.json({ data: value }, status as 200);
}

export function error(
  context: KnowledgeBaseRouteContext,
  status: number,
  message: string,
): Response {
  return context.json({ errors: [{ message }] }, status as 400);
}

export async function body(
  context: KnowledgeBaseRouteContext,
): Promise<JsonRecord> {
  const type = context.req.header('content-type') ?? '';
  return type.includes('application/json')
    ? await context.req.json<JsonRecord>()
    : {};
}

export function ids(
  context: KnowledgeBaseRouteContext,
  name: string,
): Array<string | number> {
  const url = new URL(context.req.url);
  return url.searchParams
    .getAll(name)
    .concat(url.searchParams.getAll(`${name}[]`))
    .flatMap((value) => value.split(','))
    .filter(Boolean);
}

export function scalar(
  context: KnowledgeBaseRouteContext,
  name: string,
): string | undefined {
  return new URL(context.req.url).searchParams.get(name) ?? undefined;
}

export function paging(context: KnowledgeBaseRouteContext): PageOptions {
  return {
    page: Math.max(1, Number(scalar(context, 'page')) || 1),
    pageSize: Math.min(
      200,
      Math.max(1, Number(scalar(context, 'pageSize')) || 20),
    ),
    paginate: scalar(context, 'paginate') !== 'false',
  };
}

export function userId(
  context: KnowledgeBaseRouteContext,
): string | number | undefined {
  return context.get('auth')?.user.id;
}

export function createRouteGroup(): Hono<AuthEnv> {
  const routes = new Hono<AuthEnv>();
  routes.onError((cause, context) => {
    const status =
      Number((cause as Error & { status?: number }).status) ||
      (/not found/i.test(cause.message) ? 404 : 500);
    return error(context, status, cause.message);
  });
  return routes;
}
