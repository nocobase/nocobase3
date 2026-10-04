import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';
import type { Context, Hono } from 'hono';
import type { OpenAPIV3_1 } from 'openapi-types';

import {
  generateApiDocument,
  type ApiDocument,
  type ApiDocumentFragment,
  type ApiDocumentInfo,
} from './document.js';

/**
 * Decides whether a request may read the API document and its Swagger UI. It answers `true` to allow; `false` leaves
 * the decision to the other checks. It may also throw an `ApiError` to answer with a status of its own.
 */
export type ApiDocsAccessCheck = (
  context: Context,
) => boolean | Promise<boolean>;

export interface ApiDocsAccess {
  /** Who contributes the check, such as a plugin's package name. */
  readonly name: string;
  readonly check: ApiDocsAccessCheck;
}

/** A fragment, or a function that builds one each time the document is generated. */
export type ApiDocumentFragmentSource =
  | ApiDocumentFragment
  | (() => ApiDocumentFragment | Promise<ApiDocumentFragment>);

export interface ApiDocsDescription {
  readonly info: ApiDocumentInfo;
  readonly servers?: readonly OpenAPIV3_1.ServerObject[];
}

/** What the application hands the service once its `/api` router is assembled. */
export interface ApiDocsTarget {
  readonly api: Hono;
  /** The document's `info` and `servers`, read when the document is generated. */
  readonly describe: () => ApiDocsDescription | Promise<ApiDocsDescription>;
  readonly onWarning?: (message: string) => void;
}

/**
 * The application's API documentation: who may read it, what plugins add to it, and the cached document itself.
 *
 * - Access: `GET /api/swagger` and `GET /api/swagger/docs` are served only once at least one access check is
 *   registered, and only to a request one of them allows. With none registered the routes answer `404
 *   ROUTE_NOT_FOUND`, exactly like a path that does not exist: an application that has no way to tell who is asking
 *   does not publish its API. With checks registered and none allowing, they answer `401 UNAUTHENTICATED`.
 * - Fragments: paths, components and tags a plugin documents itself, merged after the declared routes.
 * - Cache: the document is generated on the first request and kept until `invalidate()`, which anything that changes
 *   what the document describes calls — a Collection's metadata changing changes its data endpoints' schemas.
 */
export class ApiDocsService {
  private readonly accessChecks: ApiDocsAccess[] = [];
  private readonly fragments: ApiDocumentFragmentSource[] = [];
  private target: ApiDocsTarget | undefined;
  private cached: Promise<ApiDocument> | undefined;

  /** Allow the requests `access.check` accepts to read the documentation. Returns a function that removes it. */
  public addAccess(access: ApiDocsAccess): () => void {
    this.accessChecks.push(access);
    return () => {
      const index = this.accessChecks.indexOf(access);
      if (index >= 0) this.accessChecks.splice(index, 1);
    };
  }

  /** Merge `fragment` into the document. Returns a function that removes it. */
  public addFragment(fragment: ApiDocumentFragmentSource): () => void {
    this.fragments.push(fragment);
    this.invalidate();
    return () => {
      const index = this.fragments.indexOf(fragment);
      if (index >= 0) this.fragments.splice(index, 1);
      this.invalidate();
    };
  }

  /** Whether any access check is registered, which decides whether the documentation is served at all. */
  public hasAccessChecks(): boolean {
    return this.accessChecks.length > 0;
  }

  /** Whether one of the registered checks allows `context` to read the documentation. */
  public async canRead(context: Context): Promise<boolean> {
    for (const access of [...this.accessChecks]) {
      if (await access.check(context)) return true;
    }
    return false;
  }

  /** Called by the application once its `/api` router is assembled. */
  public attach(target: ApiDocsTarget): void {
    this.target = target;
    this.invalidate();
  }

  /** The `/api` router the document is generated from, once the application has registered its routes. */
  public get apiRouter(): Hono | undefined {
    return this.target?.api;
  }

  /** The document, generated on first use and cached until `invalidate()`. */
  public getDocument(): Promise<ApiDocument> {
    const target = this.target;
    if (!target) {
      return Promise.reject(
        new Error(
          'The API document is not available before the application registers its routes.',
        ),
      );
    }
    if (!this.cached) {
      const generation = this.generate(target);
      this.cached = generation;
      // A failed generation is not cached, so the next request tries again.
      generation.catch(() => {
        if (this.cached === generation) this.cached = undefined;
      });
    }
    return this.cached;
  }

  /** Drop the cached document; the next read generates it again. */
  public invalidate(): void {
    this.cached = undefined;
  }

  private async generate(target: ApiDocsTarget): Promise<ApiDocument> {
    const fragments: ApiDocumentFragment[] = [];
    for (const source of this.fragments) {
      fragments.push(typeof source === 'function' ? await source() : source);
    }
    return generateApiDocument(target.api, {
      ...(await target.describe()),
      fragments,
      ...(target.onWarning ? { onWarning: target.onWarning } : {}),
    });
  }
}

/**
 * The application's `ApiDocsService`. A plugin resolves it in its service provider's `register()` or `boot()` to add
 * an access check or a fragment, or to invalidate the cached document.
 */
export const apiDocsToken: ServiceToken<ApiDocsService> =
  createServiceToken<ApiDocsService>('@nocobase/app/api-docs');
