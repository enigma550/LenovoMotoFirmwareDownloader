/**
 * Install mode detection — the app can run from a source checkout (git clone,
 * dev/preview installs) or as a packaged build (AppImage/Setup/bundle), and the
 * update strategy differs completely between the two.
 */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export type ProjectUpdateMode = 'source' | 'packaged';

export interface UpdateModeDetection {
  mode: ProjectUpdateMode;
  repoRoot?: string;
  reason?: string;
}

function isSourceCheckoutRoot(dir: string) {
  return (
    existsSync(join(dir, '.git')) &&
    existsSync(join(dir, 'package.json')) &&
    existsSync(join(dir, 'web', 'package.json')) &&
    existsSync(join(dir, 'electrobun.config.ts'))
  );
}

/** Walks up looking for a source checkout root of this project. */
export function findSourceCheckoutRoot(startDir: string = process.cwd()): string | null {
  let current = resolve(startDir);
  const visited = new Set<string>();

  while (!visited.has(current)) {
    visited.add(current);
    if (isSourceCheckoutRoot(current)) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return null;
}

export async function detectUpdateMode(): Promise<UpdateModeDetection> {
  const repoRoot = findSourceCheckoutRoot();
  if (repoRoot) {
    return { mode: 'source', repoRoot };
  }
  return {
    mode: 'packaged',
    reason: 'No source checkout found next to the running app; using release-based updates.',
  };
}
