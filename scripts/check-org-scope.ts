/**
 * 🔒 ADR-004 guard (ported from Mizro's check-locked-invariants rule 1):
 * any `.from(<tenantTable>)` Drizzle chain must include `orgScope(...)` in a
 * predicate. Tenant tables are DERIVED from packages/db/src/schema.ts — every
 * exported pgTable whose column object contains `organizationId` — so the
 * guard can never drift from the schema.
 *
 * Escape hatch (ops/aggregate jobs only):
 *   // @invariant-allow: orgScope-cross-tenant <reason>
 */

import { readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import * as ts from 'typescript';
import { hasAllowMarker, walk } from './walk.js';

const ROOT = resolve(process.cwd());
const SCHEMA_PATH = join(ROOT, 'packages/db/src/schema.ts');
const ALLOW = '@invariant-allow: orgScope-cross-tenant';

// ── derive tenant tables from the schema ────────────────────────────────────

const deriveTenantTables = (): Set<string> => {
  const source = ts.createSourceFile(
    SCHEMA_PATH,
    readFileSync(SCHEMA_PATH, 'utf8'),
    ts.ScriptTarget.ES2022,
    true,
  );
  const tables = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      ts.isIdentifier(node.initializer.expression) &&
      node.initializer.expression.text === 'pgTable'
    ) {
      const columns = node.initializer.arguments[1];
      if (columns && ts.isObjectLiteralExpression(columns)) {
        const hasOrgId = columns.properties.some(
          (p) =>
            ts.isPropertyAssignment(p) &&
            ts.isIdentifier(p.name) &&
            p.name.text === 'organizationId',
        );
        if (hasOrgId) tables.add(node.name.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return tables;
};

// ── scan ────────────────────────────────────────────────────────────────────

const TENANT_TABLES = deriveTenantTables();

interface Violation {
  file: string;
  line: number;
  table: string;
}
const violations: Violation[] = [];

const collectCallChain = (start: ts.CallExpression): ts.CallExpression[] => {
  const chain: ts.CallExpression[] = [start];
  let current: ts.Node = start;
  while (
    current.parent &&
    ts.isPropertyAccessExpression(current.parent) &&
    current.parent.expression === current &&
    current.parent.parent &&
    ts.isCallExpression(current.parent.parent) &&
    current.parent.parent.expression === current.parent
  ) {
    current = current.parent.parent;
    chain.push(current);
  }
  return chain;
};

const containsOrgScope = (call: ts.CallExpression): boolean => {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'orgScope'
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  call.forEachChild(visit);
  return found;
};

const files = walk(join(ROOT, 'apps')).concat(walk(join(ROOT, 'packages')));

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  if (!text.includes('.from(')) continue;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true);

  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'from'
    ) {
      const arg = node.arguments[0];
      if (arg && ts.isIdentifier(arg) && TENANT_TABLES.has(arg.text)) {
        const chain = collectCallChain(node);
        const scoped = chain.some(containsOrgScope);
        if (!scoped) {
          const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
          if (!hasAllowMarker(text, line, ALLOW)) {
            violations.push({ file: relative(ROOT, file), line, table: arg.text });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

if (violations.length > 0) {
  console.error(
    `✗ org-scope guard: ${violations.length} unscoped tenant-table quer${violations.length === 1 ? 'y' : 'ies'}`,
  );
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line} — .from(${v.table}) without orgScope(...)`);
  }
  console.error(
    `  Fix: .where(orgScope(<table>.organizationId, orgId)) — or, for ops/aggregate jobs only, add: // ${ALLOW} <reason>`,
  );
  process.exit(1);
}

console.log(
  `✓ org-scope guard: ${files.length} files clean (tenant tables: ${[...TENANT_TABLES].join(', ') || 'none'})`,
);
