/**
 * 🔒 ADR-007/011 guard (Mizro wallet-ledger guard pattern): append-only tables
 * accept NO update/delete anywhere — except the commission store's single
 * writer, which may update ONLY commission_entries.status inside transition/
 * reversal. Attribution claims are immutable (first-touch 🔒). Audit tables
 * are insert-only forever.
 */

import { readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import * as ts from 'typescript';
import { walk } from './walk.js';

const ROOT = resolve(process.cwd());

// table identifier → files allowed to .update() it (none may .delete())
const PROTECTED: Record<string, readonly string[]> = {
  commissionEntries: ['packages/commission/src/store.ts'],
  commissionEntryStatusAudit: [],
  commissionPlanVersions: [],
  attributionClaims: [],
  attributionLinks: [],
  auditLog: [],
};

interface Violation {
  file: string;
  line: number;
  op: string;
  table: string;
}
const violations: Violation[] = [];

const files = walk(join(ROOT, 'apps')).concat(walk(join(ROOT, 'packages')));

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  if (!text.includes('.update(') && !text.includes('.delete(')) continue;
  const rel = relative(ROOT, file);
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true);

  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      (node.expression.name.text === 'update' || node.expression.name.text === 'delete')
    ) {
      const op = node.expression.name.text;
      const arg = node.arguments[0];
      if (arg && ts.isIdentifier(arg) && arg.text in PROTECTED) {
        const allowed = op === 'update' && (PROTECTED[arg.text] ?? []).includes(rel);
        if (!allowed) {
          const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
          violations.push({ file: rel, line, op, table: arg.text });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

if (violations.length > 0) {
  console.error(
    `✗ ledger-integrity guard: ${violations.length} forbidden write(s) on append-only tables`,
  );
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line} — .${v.op}(${v.table})`);
  }
  console.error(
    '  These tables are append-only 🔒 — append reversal/adjustment entries or use the commission store transition(); never mutate history.',
  );
  process.exit(1);
}

console.log(`✓ ledger-integrity guard: ${files.length} files clean`);
