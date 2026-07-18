// Load .env.local + .env from the workspace root before parsing. Uses Node 22's
// built-in process.loadEnvFile — already-set variables win, so shell / docker /
// CI-exported values are never overridden; .env.local (loaded first) beats .env.

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const findWorkspaceRoot = (start: string): string | null => {
  let dir = start;
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
};

export const loadDotenv = (): void => {
  const root = findWorkspaceRoot(process.cwd());
  if (!root) return;
  for (const file of ['.env.local', '.env']) {
    const path = join(root, file);
    if (existsSync(path)) {
      try {
        process.loadEnvFile(path);
      } catch {
        // unreadable env file — boot continues on process.env alone
      }
    }
  }
};
