# Module slices (ADR-003)

One directory per module: `routes.ts` (or `index.ts` for tiny ones) + `service.ts` + `policy.ts` + `events.ts` + `__tests__/`. Rules 🔒:

1. Public surface = the module's `index.ts` (service API + emitted event types). No deep imports across modules.
2. No cross-module writes — read other modules through their service API; joins only within your own tables.
3. Side-effects across modules via in-process domain events (idempotent handlers), persisted to `platform_events` when that table lands.
4. Every route: contract from `@arad-crm/api-contracts`, tenant queries through `orgScope()`, policy check at the SERVICE layer (worker/event paths obey the same rules).

Planned per the module map: platform-core → `identity` · `org` · `ops` · `audit` · `notifications` · `integrations` · sales-core → `accounts` · `leads` · `opportunities` · `activities` · `flows` · `quick-add` · `products` · `attribution` · `commission` (package) · `targets` · `reporting`.

Two slices deviate from the shape above, on purpose:

- **`ops/`** (ADR-014) splits by screen (`businesses.ts`, `users.ts`, `connections.ts`, …) because it is a control plane, not a domain: each file is one ops surface, and `audit.ts` holds the one rule they all share. 🔒 It is also the only module whose reads legitimately cross tenants — every one carries the documented `orgScope-cross-tenant` marker with its reason.
- **`flows/`** (ADR-015) keeps `service.ts` separate and re-exports it from `index.ts`, because other modules (leads' guided post-create) consume it as a service and never as routes.
