# Module slices (ADR-003)

One directory per module: `routes.ts` (or `index.ts` for tiny ones) + `service.ts` + `policy.ts` + `events.ts` + `__tests__/`. Rules 🔒:

1. Public surface = the module's `index.ts` (service API + emitted event types). No deep imports across modules.
2. No cross-module writes — read other modules through their service API; joins only within your own tables.
3. Side-effects across modules via in-process domain events (idempotent handlers), persisted to `platform_events` when that table lands.
4. Every route: contract from `@arad-crm/api-contracts`, tenant queries through `orgScope()`, policy check at the SERVICE layer (worker/event paths obey the same rules).

Planned per the module map: platform-core → `identity` · `org` · `audit` · `notifications` · `integrations` · sales-core → `accounts` · `leads` · `opportunities` · `activities` · `products` · `attribution` · `commission` (package) · `targets` · `reporting`.
