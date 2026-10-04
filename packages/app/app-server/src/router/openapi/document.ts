import type { Hono } from 'hono';
import {
  generateSpecs,
  uniqueSymbol,
  type DescribeRouteOptions,
} from 'hono-openapi';
import { findTargetHandler, isMiddleware } from 'hono/utils/handler';
import type { OpenAPIV3_1 } from 'openapi-types';

import { apiNotFoundHandler } from '../api-error.js';
import {
  apiDocumentBaseComponents,
  validationErrorResponse,
} from './components.js';
import { expandRepositoryOperations } from './repository-document.js';

export type ApiDocument = OpenAPIV3_1.Document;

export interface ApiDocumentInfo {
  readonly title: string;
  readonly version: string;
  readonly description?: string;
}

/**
 * Paths, components and tags a plugin contributes to the document for routes it does not declare with
 * `describeRoute()`, such as Better Auth's. Paths are full paths below the application's base path, starting with
 * `/api/`.
 */
export interface ApiDocumentFragment {
  /** Who contributes the fragment, such as a plugin's package name. Named in warnings. */
  readonly owner: string;
  /**
   * camelCase prefix for an `operationId` or component name that collides with one already in the document. Defaults
   * to the owner's package name without its scope and `app-plugin-`, in camelCase.
   */
  readonly namespace?: string;
  readonly paths?: OpenAPIV3_1.PathsObject;
  readonly components?: OpenAPIV3_1.ComponentsObject;
  readonly tags?: readonly OpenAPIV3_1.TagObject[];
}

export interface GenerateApiDocumentOptions {
  readonly info: ApiDocumentInfo;
  /** The path the router is mounted at. Defaults to `/api`. */
  readonly prefix?: string;
  readonly servers?: readonly OpenAPIV3_1.ServerObject[];
  readonly fragments?: readonly ApiDocumentFragment[];
  /** Receives what the merge had to drop or rename, such as a fragment operation colliding with a declared route. */
  readonly onWarning?: (message: string) => void;
}

/** One endpoint of an API router and what `describeRoute()` declared for it. */
export interface ApiRouteDeclaration {
  readonly method: string;
  /** The Hono path including the prefix, such as `/api/users/:userId`. */
  readonly path: string;
  /** Whether a `describeRoute()` applies to it, including `describeRoute({ hide: true })`. */
  readonly declared: boolean;
  readonly hidden: boolean;
  /** The `operationId` the declaration names; absent when the document would have to invent one. */
  readonly operationId?: string;
  readonly tags?: readonly string[];
  readonly summary?: string;
}

/** An application whose API router can be inspected once its routes are registered. */
export interface ApiRouterSource {
  readonly apiRouter: Hono | undefined;
}

const httpMethods = [
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
] as const;

function resolveApiRouter(source: Hono | ApiRouterSource): Hono {
  const router = 'apiRouter' in source ? source.apiRouter : source;
  if (!router) {
    throw new Error(
      'The application has not registered its routes yet. Start it before inspecting its API.',
    );
  }
  return router;
}

function describeSpecOf(handler: unknown): DescribeRouteOptions | undefined {
  const metadata = (
    findTargetHandler(handler as never) as unknown as Record<
      symbol,
      { readonly spec?: DescribeRouteOptions } | undefined
    >
  )[uniqueSymbol];
  return metadata?.spec;
}

function pathPrefixOf(path: string): string {
  return path.endsWith('/*') ? path.slice(0, -2) : path;
}

/**
 * Every endpoint of an API router with what `describeRoute()` declares for it, in registration order. The application's
 * catch-all for unknown paths is not an endpoint and is left out. A declaration applied with `router.use()` counts for
 * the paths below it, as it does in the document.
 */
export function inspectApiRoutes(
  source: Hono | ApiRouterSource,
  prefix: string = '/api',
): ApiRouteDeclaration[] {
  const router = resolveApiRouter(source);
  const contexts: { readonly prefix: string; spec: DescribeRouteOptions }[] =
    [];
  const endpoints = new Map<
    string,
    { method: string; path: string; specs: DescribeRouteOptions[] }
  >();
  for (const route of router.routes) {
    const target = findTargetHandler(route.handler);
    if (target === (apiNotFoundHandler as unknown)) continue;
    const spec = describeSpecOf(route.handler);
    const key = `${route.method} ${route.path}`;
    const middleware = isMiddleware(target);
    if (route.method === 'ALL' && middleware) {
      if (spec) contexts.push({ prefix: pathPrefixOf(route.path), spec });
      continue;
    }
    let endpoint = endpoints.get(key);
    if (!endpoint && !middleware) {
      endpoint = { method: route.method, path: route.path, specs: [] };
      endpoints.set(key, endpoint);
    }
    if (endpoint && spec) endpoint.specs.push(spec);
    // A describeRoute() registered before the endpoint's handler under the same method and path.
    if (!endpoint && spec) {
      endpoints.set(key, {
        method: route.method,
        path: route.path,
        specs: [spec],
      });
    }
  }
  const declarations: ApiRouteDeclaration[] = [];
  for (const endpoint of endpoints.values()) {
    const applicable = [
      ...contexts
        .filter(
          (context) =>
            endpoint.path === context.prefix ||
            endpoint.path.startsWith(`${context.prefix}/`),
        )
        .map((context) => context.spec),
      ...endpoint.specs,
    ];
    let hidden = false;
    let operationId: string | undefined;
    let summary: string | undefined;
    const tags = new Set<string>();
    for (const spec of applicable) {
      if (spec.hide) hidden = true;
      if (typeof spec.operationId === 'string') operationId = spec.operationId;
      if (spec.summary) summary = spec.summary;
      for (const tag of spec.tags ?? []) tags.add(tag);
    }
    declarations.push({
      method: endpoint.method,
      path: `${prefix}${endpoint.path === '/' ? '' : endpoint.path}` || '/',
      declared: applicable.length > 0,
      hidden,
      ...(operationId ? { operationId } : {}),
      ...(tags.size > 0 ? { tags: [...tags] } : {}),
      ...(summary ? { summary } : {}),
    });
  }
  return declarations;
}

/**
 * The endpoints that declare nothing: neither `describeRoute({...})` nor `describeRoute({ hide: true })`. Each is a
 * defect the API document check reports.
 */
export function findUndeclaredApiRoutes(
  source: Hono | ApiRouterSource,
  prefix: string = '/api',
): { readonly method: string; readonly path: string }[] {
  return inspectApiRoutes(source, prefix)
    .filter((route) => !route.declared)
    .map(({ method, path }) => ({ method, path }));
}

/**
 * Generate the OpenAPI 3.1 document for an API router: every route declared with `describeRoute()` and not hidden,
 * data endpoints expanded from their Collections, and the fragments merged in.
 */
export async function generateApiDocument(
  source: Hono | ApiRouterSource,
  options: GenerateApiDocumentOptions,
): Promise<ApiDocument> {
  const router = resolveApiRouter(source);
  const prefix = options.prefix ?? '/api';
  const base = apiDocumentBaseComponents();
  const generated = await generateSpecs(router, {
    documentation: {
      info: {
        title: options.info.title,
        version: options.info.version,
        ...(options.info.description
          ? { description: options.info.description }
          : {}),
      },
      ...(options.servers ? { servers: [...options.servers] } : {}),
      components: base,
    },
    defaultValidationErrorResponse: validationErrorResponse(),
    excludeMethods: ['OPTIONS'],
  });
  const paths: OpenAPIV3_1.PathsObject = {};
  for (const [path, item] of Object.entries(generated.paths)) {
    paths[`${prefix}${path === '/' ? '' : path}` || '/'] = item;
  }
  const document: ApiDocument = {
    openapi: '3.1.0',
    // hono-openapi fills in a description of its own when none is given.
    info: {
      title: options.info.title,
      version: options.info.version,
      ...(options.info.description
        ? { description: options.info.description }
        : {}),
    },
    ...(generated.servers ? { servers: generated.servers } : {}),
    paths,
    components: {
      ...generated.components,
      schemas: { ...base.schemas, ...generated.components.schemas },
      responses: { ...base.responses, ...generated.components.responses },
    },
  };
  await expandRepositoryOperations(document);
  const warn = options.onWarning ?? (() => undefined);
  for (const fragment of options.fragments ?? []) {
    mergeApiDocumentFragment(document, fragment, warn);
  }
  document.tags = collectTags(document, options.fragments ?? []);
  return document;
}

function collectTags(
  document: ApiDocument,
  fragments: readonly ApiDocumentFragment[],
): OpenAPIV3_1.TagObject[] {
  const described = new Map<string, OpenAPIV3_1.TagObject>();
  for (const tag of [
    ...(document.tags ?? []),
    ...fragments.flatMap((fragment) => fragment.tags ?? []),
  ]) {
    const existing = described.get(tag.name);
    described.set(
      tag.name,
      existing
        ? {
            ...tag,
            ...existing,
            description: existing.description ?? tag.description,
          }
        : tag,
    );
  }
  const used = new Set<string>();
  for (const item of Object.values(document.paths ?? {})) {
    for (const method of httpMethods) {
      for (const tag of item?.[method]?.tags ?? []) used.add(tag);
    }
  }
  return [...used]
    .sort((left, right) => left.localeCompare(right))
    .map((name) => described.get(name) ?? { name });
}

const componentKinds = [
  'schemas',
  'responses',
  'parameters',
  'examples',
  'requestBodies',
  'headers',
  'securitySchemes',
  'links',
  'callbacks',
  'pathItems',
] as const;

type ComponentKind = (typeof componentKinds)[number];

function defaultNamespace(owner: string): string {
  const bare = owner.replace(/^@[^/]+\//, '').replace(/^app-plugin-/, '');
  return bare.replace(/[-_.\s]+([a-zA-Z0-9])/g, (_match, letter: string) =>
    letter.toUpperCase(),
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function uniqueName(base: string, taken: (name: string) => boolean): string {
  if (!taken(base)) return base;
  let index = 2;
  while (taken(`${base}${index}`)) index += 1;
  return `${base}${index}`;
}

function rewriteRefs(
  value: unknown,
  renames: ReadonlyMap<string, string>,
): unknown {
  if (Array.isArray(value))
    return value.map((item) => rewriteRefs(item, renames));
  if (typeof value !== 'object' || value === null) return value;
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    result[key] =
      key === '$ref' && typeof child === 'string'
        ? (renames.get(child) ?? child)
        : rewriteRefs(child, renames);
  }
  return result;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Merge one fragment into a document in place.
 *
 * - A component whose name is free is added; one identical to an existing component is shared; one that differs is
 *   renamed with the fragment's namespace in PascalCase as prefix (`AuthSession`), and every `$ref` in the fragment
 *   follows the rename.
 * - An operation whose method and path the document already has is dropped with a warning: a declared route is what
 *   actually answers.
 * - An `operationId` already in use is prefixed with the namespace (`authSignIn`), then numbered if still taken.
 * - Tags merge by name; a description already in the document wins.
 */
export function mergeApiDocumentFragment(
  document: ApiDocument,
  fragment: ApiDocumentFragment,
  onWarning: (message: string) => void = () => undefined,
): void {
  const namespace = fragment.namespace ?? defaultNamespace(fragment.owner);
  const components = (document.components ??= {}) as Record<
    ComponentKind,
    Record<string, unknown> | undefined
  >;
  const renames = new Map<string, string>();
  const additions: [ComponentKind, string, unknown][] = [];
  const fragmentComponents = (fragment.components ?? {}) as Record<
    string,
    Record<string, unknown> | undefined
  >;
  for (const kind of componentKinds) {
    for (const [name, component] of Object.entries(
      fragmentComponents[kind] ?? {},
    )) {
      const existing = components[kind]?.[name];
      if (existing === undefined) {
        additions.push([kind, name, component]);
        continue;
      }
      if (sameJson(existing, component)) continue;
      const renamed = uniqueName(
        `${capitalize(namespace)}${name}`,
        (candidate) =>
          components[kind]?.[candidate] !== undefined ||
          fragmentComponents[kind]?.[candidate] !== undefined,
      );
      renames.set(
        `#/components/${kind}/${name}`,
        `#/components/${kind}/${renamed}`,
      );
      additions.push([kind, renamed, component]);
      onWarning(
        `${fragment.owner}: component ${kind}/${name} differs from the one already in the API document and was renamed to ${renamed}.`,
      );
    }
  }
  for (const [kind, name, component] of additions) {
    (components[kind] ??= {})[name] = rewriteRefs(component, renames);
  }

  const operationIds = new Set<string>();
  for (const item of Object.values(document.paths ?? {})) {
    for (const method of httpMethods) {
      const operationId = item?.[method]?.operationId;
      if (operationId) operationIds.add(operationId);
    }
  }
  const paths = (document.paths ??= {});
  for (const [path, rawItem] of Object.entries(fragment.paths ?? {})) {
    if (!rawItem) continue;
    const item = rewriteRefs(rawItem, renames) as OpenAPIV3_1.PathItemObject;
    const target = (paths[path] ??= {});
    for (const [key, value] of Object.entries(item)) {
      const method = key as (typeof httpMethods)[number];
      if (!httpMethods.includes(method)) {
        if (!(key in target)) (target as Record<string, unknown>)[key] = value;
        continue;
      }
      if (target[method]) {
        onWarning(
          `${fragment.owner}: ${method.toUpperCase()} ${path} is already declared by a route and was left out of the fragment.`,
        );
        continue;
      }
      const operation = { ...(value as OpenAPIV3_1.OperationObject) };
      if (operation.operationId && operationIds.has(operation.operationId)) {
        const renamed = uniqueName(
          `${namespace}${capitalize(operation.operationId)}`,
          (candidate) => operationIds.has(candidate),
        );
        onWarning(
          `${fragment.owner}: operationId ${operation.operationId} of ${method.toUpperCase()} ${path} is already used and was renamed to ${renamed}.`,
        );
        operation.operationId = renamed;
      }
      if (operation.operationId) operationIds.add(operation.operationId);
      (target as Record<string, unknown>)[method] = operation;
    }
  }
}
