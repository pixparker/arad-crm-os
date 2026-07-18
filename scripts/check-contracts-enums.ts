/**
 * 🔒 ADR-008 guard (Mizro rule-5 pattern, generalized): API enums/shapes live
 * ONLY in @arad-crm/api-contracts. Any `z.enum([...])` declaration outside it
 * is validation drift waiting to happen.
 *
 * Escape hatch for genuinely internal (non-API) enums:
 *   // @invariant-allow: local-enum <reason>
 */

import { readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import * as ts from 'typescript';
import { hasAllowMarker, walk } from './walk.js';

const ROOT = resolve(process.cwd());
const ALLOW = '@invariant-allow: local-enum';
const EXEMPT_PREFIX = join('packages', 'api-contracts') + sep;

interface Violation {
  file: string;
  line: number;
}
const violations: Violation[] = [];

const files = walk(join(ROOT, 'apps'))
  .concat(walk(join(ROOT, 'packages')))
  .filter((f) => !relative(ROOT, f).startsWith(EXEMPT_PREFIX));

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  if (!text.includes('z.enum(')) continue;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true);

  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'enum' &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === 'z'
    ) {
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      if (!hasAllowMarker(text, line, ALLOW)) {
        violations.push({ file: relative(ROOT, file), line });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

if (violations.length > 0) {
  console.error(
    `✗ contracts-enums guard: ${violations.length} z.enum declaration(s) outside api-contracts`,
  );
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
  }
  console.error(
    `  Move the enum to @arad-crm/api-contracts — or, if engine-internal, add: // ${ALLOW} <reason>`,
  );
  process.exit(1);
}

console.log(`✓ contracts-enums guard: ${files.length} files clean`);
