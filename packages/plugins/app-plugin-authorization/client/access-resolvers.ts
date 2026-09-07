import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

export type ClientAccessResolver = (
  action: string,
) => Promise<{ can: boolean }>;
/** App-local extension point; a matched denial never falls back to page grants. */
export class ClientAccessResolvers {
  private readonly entries: Map<string, { resolver: ClientAccessResolver }> =
    new Map();
  register(resource: string, resolver: ClientAccessResolver): () => void {
    if (!resource || this.entries.has(resource))
      throw new Error('Access resolver is already registered or invalid.');
    const entry = { resolver };
    this.entries.set(resource, entry);
    return (): void => {
      if (this.entries.get(resource) === entry) this.entries.delete(resource);
    };
  }
  async resolve(
    resource: string,
    action: string,
  ): Promise<{ can: boolean } | undefined> {
    const entry = this.entries.get(resource);
    if (!entry) return undefined;
    try {
      return await entry.resolver(action);
    } catch {
      return { can: false };
    }
  }
}
export const clientAccessResolversToken: ServiceToken<ClientAccessResolvers> =
  createServiceToken<ClientAccessResolvers>(
    '@nocobase/authorization/client-access-resolvers',
  );
