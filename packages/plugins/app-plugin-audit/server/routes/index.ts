import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { Hono, type Context } from 'hono';
import type { TrustedAuditScope } from '../contracts.js';
import { AuditAccessDenied, AuditAuthorization } from '../authorization.js';
import { ScopedAuditQueryService } from '../query-service.js';
import { PersistentAuditSettingsService } from '../settings-service.js';
import { snapshotAuditSettingsUpdate } from '../settings-validation.js';
import { LocalAuditHealthService } from '../health-service.js';
import { AuditHttpCollector } from '../http.js';
import { TrustedAuditRuntime } from '../runtime.js';
import { AuditError } from '../errors.js';
import { readAuditQuery } from './input.js';
import { settingsMetadata, mayAccessSettings } from './settings-metadata.js';
import type { AuditCaptureCatalog } from '../capture-catalog.js';
import type { AuditDeclaredRoute } from '../contracts.js';

export interface AuditApiRoutesOptions {
  readonly authorization: AuditAuthorization;
  readonly query: ScopedAuditQueryService;
  readonly settings: PersistentAuditSettingsService;
  readonly health: LocalAuditHealthService;
  readonly http: AuditHttpCollector;
  readonly runtime: TrustedAuditRuntime;
  readonly configurationStore: string;
  /** Trusted composition supplies the same catalog and registered stores used by readiness. */
  readonly catalog?: AuditCaptureCatalog;
  readonly stores?: readonly string[];
  readonly declaredRoutes?: () => readonly AuditDeclaredRoute[];
}
export function createAuditApiRoutes(
  options: AuditApiRoutesOptions,
): AppApiRouteContribution<AppPluginApplication> {
  return defineApiRoutes(({ container }) => {
    const router = new Hono();
    const routes = new Hono<AuthorizationEnv>();
    const authentication = container.resolve(authenticationToken);
    const authorization = container.resolve(authorizationToken);
    routes.onError((error, context) => {
      const status =
        error instanceof AuditAccessDenied
          ? 403
          : error instanceof AuditError
            ? error.code === 'AUDIT_POLICY_CONFLICT'
              ? 409
              : error.code === 'AUDIT_INVALID_EVENT'
                ? 400
                : 503
            : 503;
      const code =
        error instanceof AuditAccessDenied
          ? 'AUDIT_ACCESS_DENIED'
          : error instanceof AuditError
            ? error.code
            : 'AUDIT_NOT_READY';
      return context.json(
        { code, ns: '@nocobase/app-plugin-audit', key: code, message: code },
        status,
      );
    });
    routes.use(
      '*',
      options.http.http({ action: 'audit.api.access' }),
      authentication.required(),
      authorization.middleware(),
    );
    routes.use('*', async (context: Context<AuthorizationEnv>, next) => {
      const principal = context.get('authz').identity.principal;
      await options.runtime.runAuthenticated(
        { actor: { type: principal.type, id: principal.id } },
        async () => {
          options.http.captureScope(context);
          await next();
        },
      );
    });
    routes.get('/capabilities', async (context) => {
      const authz = context.get('authz');
      const stores: string[] = [];
      let events = false;
      let settings = false;
      for (const store of options.stores ?? [options.configurationStore]) {
        const can = async (
          resource: 'audit.events' | 'audit.settings',
          action: string,
        ): Promise<boolean> => {
          try {
            await options.authorization.require(authz, store, resource, action);
            return true;
          } catch (error) {
            if (error instanceof AuditAccessDenied) return false;
            throw error;
          }
        };
        const readEvents =
          (await can('audit.events', 'read')) &&
          (await can('audit.events', 'readAll'));
        const readSettings =
          store === options.configurationStore &&
          (await can('audit.settings', 'read'));
        if (readEvents || readSettings) stores.push(store);
        events ||= readEvents;
        settings ||= readSettings;
      }
      if (settings) {
        const policy = await options.settings.get(options.runtime.current());
        const metadata = await settingsMetadata(
          options.authorization,
          authz,
          options.settings,
          policy,
          options.configurationStore,
          options.stores ?? [options.configurationStore],
        );
        settings = metadata.complete;
      }
      context.header('Cache-Control', 'no-store');
      return context.json({ data: { events, settings, stores } });
    });
    routes.get('/events', async (context) => {
      const query = readAuditQuery(context, 'list');
      const proof = await options.authorization.issue(
        context.get('authz'),
        query.store,
        query.target,
      );
      const page = await options.query.list(proof, query);
      const total =
        context.req.query('count') === 'true'
          ? await options.query.count(proof, query)
          : undefined;
      return context.json({
        data: page,
        ...(total === undefined ? {} : { total }),
      });
    });
    routes.get('/events/:id', async (context) => {
      const query = readAuditQuery(context, 'detail');
      const proof = await options.authorization.issue(
        context.get('authz'),
        query.store,
        query.target,
      );
      const data = await options.query.detail(proof, {
        store: query.store,
        id: context.req.param('id'),
      });
      return data
        ? context.json({ data })
        : context.json({ code: 'AUDIT_EVENT_NOT_FOUND' }, 404);
    });
    routes.get('/operations/:id', async (context) => {
      const query = readAuditQuery(context, 'operation');
      const proof = await options.authorization.issue(
        context.get('authz'),
        query.store,
        query.target,
      );
      return context.json({
        data: await options.query.operation(proof, {
          store: query.store,
          id: context.req.param('id'),
          cursor: query.cursor,
          pageSize: query.pageSize,
        }),
      });
    });
    const scope = (): TrustedAuditScope => options.runtime.current();
    routes.get('/settings', async (context) => {
      const query = readAuditQuery(context, 'settings');
      await options.authorization.require(
        context.get('authz'),
        query.store,
        'audit.settings',
        'read',
      );
      if (query.store !== options.configurationStore)
        throw new AuditAccessDenied();
      const settings = await options.settings.get(scope());
      context.header('ETag', '"' + settings.revision + '"');
      const meta = await settingsMetadata(
        options.authorization,
        context.get('authz'),
        options.settings,
        settings,
        options.configurationStore,
        options.stores ?? [
          options.configurationStore,
          settings.observationStore,
          ...settings.sources.database.map((entry) => entry.dataSource),
        ],
      );
      // Never deliver a partial policy that a reader could accidentally overwrite.
      if (!meta.complete) throw new AuditAccessDenied();
      return context.json({ data: settings, meta });
    });
    routes.put('/settings', async (context) => {
      const query = readAuditQuery(context, 'settings');
      await options.authorization.require(
        context.get('authz'),
        query.store,
        'audit.settings',
        'manage',
      );
      if (query.store !== options.configurationStore)
        throw new AuditAccessDenied();
      const length = context.req.header('content-length');
      if (length && Number(length) > 65536)
        throw new AuditError('AUDIT_INVALID_EVENT');
      const text = await context.req.text();
      if (Buffer.byteLength(text) > 65536)
        throw new AuditError('AUDIT_INVALID_EVENT');
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        throw new AuditError('AUDIT_INVALID_EVENT');
      }
      const update = snapshotAuditSettingsUpdate(raw);
      const match = context.req.header('if-match');
      if (match !== '"' + update.expectedRevision + '"')
        throw new AuditError('AUDIT_POLICY_CONFLICT');
      const previous = await options.settings.get(scope());
      if (previous.revision !== update.expectedRevision)
        throw new AuditError('AUDIT_POLICY_CONFLICT');
      // Removing protection requires permission on the old scope too. The
      // service's CAS rejects concurrent changes after this authorization read.
      for (const store of new Set([
        options.configurationStore,
        ...options.settings.requirements.requiredDataSources,
        previous.observationStore,
        ...previous.sources.database.map((entry) => entry.dataSource),
        update.settings.observationStore,
        ...update.settings.sources.database.map((entry) => entry.dataSource),
      ]))
        await options.authorization.require(
          context.get('authz'),
          store,
          'audit.settings',
          'manage',
        );
      const settings = await options.settings.update(scope(), update);
      context.header('ETag', '"' + settings.revision + '"');
      return context.json({ data: settings });
    });
    routes.get('/health', async (context) => {
      const query = readAuditQuery(context, 'health');
      await options.authorization.require(
        context.get('authz'),
        query.store,
        'audit.settings',
        'read',
      );
      const observation = options.health.observe({
        store: query.store,
        instanceId: context.req.query('instanceId'),
      });
      if (observation.observation === 'unknown' || !options.catalog)
        return context.json({
          data: { ...observation, declarationObservation: 'unknown' },
        });
      let settings;
      try {
        settings = await options.settings.get(scope());
      } catch (error) {
        if (!(error instanceof AuditError)) throw error;
        // Persistent failures have already updated the independent local health.
        return context.json({
          data: {
            ...options.health.observe({
              store: query.store,
              instanceId: context.req.query('instanceId'),
            }),
            declarationObservation: 'unknown',
          },
        });
      }
      const captures = [];
      for (const entry of options.catalog.entries(settings)) {
        if (
          entry.dataSource !== query.store ||
          !(await mayAccessSettings(
            options.authorization,
            context.get('authz'),
            entry.dataSource,
            'read',
          ))
        )
          continue;
        captures.push({
          producer: entry.producer,
          kind: entry.kind,
          dataSource: entry.dataSource,
          configured: entry.configured,
          registered: entry.live,
          verified: entry.verified,
          targets: entry.targets.filter(
            (target) => target.dataSource === entry.dataSource,
          ),
        });
      }
      return context.json({
        data: {
          ...observation,
          captures,
          declarationObservation:
            options.declaredRoutes && query.store === settings.observationStore
              ? 'static'
              : 'unknown',
          ...(options.declaredRoutes &&
          query.store === settings.observationStore
            ? { declaredRoutes: options.declaredRoutes() }
            : {}),
        },
      });
    });
    router.route('/audit', routes);
    return router;
  });
}
