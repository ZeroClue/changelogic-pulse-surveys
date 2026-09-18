import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { AsyncLocalStorage } from 'node:async_hooks';
import { type DataSource, type EntityManager } from 'typeorm';
import { setTenantContextSql } from './set-tenant-context';

interface TenantContext {
  organizationId: string;
  manager: EntityManager;
}

/**
 * Request-scoped tenant transaction runtime (SPEC §2, review A-2).
 *
 * `run(organizationId, fn)` opens one `dataSource.transaction`, executes
 * `SET LOCAL app.current_organization_id = '<org>'` before any query and
 * publishes the transactional EntityManager through AsyncLocalStorage for the
 * duration of `fn`. Nested `run()` calls with the same org JOIN the active
 * transaction instead of opening a second one (TypeORM transactions do not
 * nest — a second connection would get its own tenant context); a nested call
 * with a DIFFERENT org is a programming error and throws.
 *
 * Repositories/services must not touch `dataSource` for tenant entities: they
 * either receive the transactional EntityManager from `run`'s callback or use
 * `requireManager()` inside an active context. `SET LOCAL` dies with the
 * transaction, so pooled connections can never leak tenant context; the RLS
 * policies fail closed when the setting is absent (SPEC §2, migration 003).
 */
@Injectable()
export class TenancyService {
  private readonly context = new AsyncLocalStorage<TenantContext>();

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async run<T>(
    organizationId: string,
    fn: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    const active = this.context.getStore();
    if (active) {
      if (active.organizationId !== organizationId) {
        throw new Error(
          'tenant context mismatch: cannot switch organization inside an active tenant transaction',
        );
      }
      return fn(active.manager);
    }
    return this.dataSource.transaction(async (manager) => {
      await manager.query(setTenantContextSql(organizationId));
      return this.context.run({ organizationId, manager }, () => fn(manager));
    });
  }

  /** The active transactional EntityManager; throws outside `run`. */
  requireManager(): EntityManager {
    const active = this.context.getStore();
    if (!active) {
      throw new Error(
        'no tenant transaction active: tenant entities must be accessed inside TenancyService.run',
      );
    }
    return active.manager;
  }
}
