// Shared source-tree walker for the guard scripts (Mizro guard-script pattern).

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SKIP_DIRS = new Set(['node_modules', '.next', '.turbo', 'dist', 'drizzle', 'coverage']);

export const walk = (dir: string, out: string[] = []): string[] => {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name) || name.startsWith('.')) continue;
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (full.endsWith('.ts') || full.endsWith('.tsx')) out.push(full);
  }
  return out;
};

/** Escape-hatch check: marker on the node's line or the 3 lines above. */
export const hasAllowMarker = (sourceText: string, line: number, marker: string): boolean => {
  const lines = sourceText.split('\n');
  const start = Math.max(0, line - 4);
  return lines.slice(start, line).some((l) => l.includes(marker));
};
