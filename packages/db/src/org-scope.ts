// 🔒 ADR-004 invariant: every tenant-scoped query goes through this helper.
// The org-scope CI guard (scripts/check-org-scope.ts) rejects any
// `.from(<tenantTable>)` chain without an `orgScope(...)` predicate:
//   db.select().from(orgMembers).where(orgScope(orgMembers.organizationId, orgId))
// Combine with `and(...)` for additional predicates.
// Escape hatch (ops/aggregate jobs only): `// @invariant-allow: orgScope-cross-tenant <reason>`

import { TenantIsolationViolation } from '@arad/errors';
import { type SQL, eq } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

export const orgScope = (column: PgColumn, organizationId: string): SQL => {
  if (!organizationId) {
    throw new TenantIsolationViolation('orgScope called with empty organizationId');
  }
  return eq(column, organizationId);
};
