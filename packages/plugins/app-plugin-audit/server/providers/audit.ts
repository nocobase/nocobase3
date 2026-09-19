import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { ServiceProvider } from '@nocobase/service-provider';
import type { AuditEvent } from '@nocobase/audit';
import { createAppAudit } from '../services/audit.js';
import {
  auditServiceToken,
  type AppAudit,
  type AuditConfig,
  type AuditWriterBinding,
} from '../tokens.js';

export class AuditProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name: string = '@nocobase/app-plugin-audit';
  private service?: AppAudit;
  private binding?: AuditWriterBinding;
  private closing: boolean = false;
  private readonly pending: Set<Promise<void>> = new Set();
  private shutdownPromise?: Promise<void>;

  public override register(): void {
    this.app.container.instance(auditServiceToken, {
      for: (context) => {
        if (!this.service || this.closing)
          throw new Error('Audit service is not ready.');
        return this.service.for(context);
      },
    });
  }

  public override async boot(): Promise<void> {
    const config = this.app.config.get<AuditConfig>('audit');
    if (typeof config?.createWriter !== 'function')
      throw new Error('Audit requires audit.createWriter configuration.');
    const binding = await config.createWriter(this.app.container);
    this.binding = binding;
    if (
      typeof binding?.writer?.write !== 'function' ||
      (binding.dispose !== undefined && typeof binding.dispose !== 'function')
    ) {
      throw new Error('Audit createWriter must return { writer, dispose? }.');
    }
    this.service = createAppAudit(this.app.appName, {
      write: (event) => this.write(event),
    });
  }

  private write(event: AuditEvent): Promise<void> {
    if (this.closing || !this.binding)
      return Promise.reject(new Error('Audit output is closed.'));
    const writer = this.binding.writer;
    const pending = Promise.resolve().then(() => writer.write(event));
    this.pending.add(pending);
    void pending.then(
      () => this.pending.delete(pending),
      () => this.pending.delete(pending),
    );
    return pending;
  }

  public override shutdown(): Promise<void> {
    this.closing = true;
    this.shutdownPromise ??= this.close();
    return this.shutdownPromise;
  }

  private async close(): Promise<void> {
    await Promise.allSettled([...this.pending]);
    if (typeof this.binding?.dispose === 'function')
      await this.binding.dispose();
    this.binding = undefined;
  }
}
