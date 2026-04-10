import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function getCurrentVersion() {
  const configPath = join(process.cwd(), 'electrobun.config.ts');
  try {
    const content = readFileSync(configPath, 'utf8');
    const match = content.match(/version:\s*["']([^"']+)["']/);
    return match?.[1] ? match[1] : '0.0.1';
  } catch (e) {
    console.error(`Error reading config: ${e}`);
    return '0.0.1';
  }
}

const CHANNEL = process.argv[2] || 'dev';
let version = getCurrentVersion();

console.error(`Starting version resolution for channel: ${CHANNEL}, base version: ${version}`);

function incrementVersion(v: string) {
  const parts = v.split('.');
  if (parts.length < 3) {
    return `${v}.1`;
  }
  const lastPart = parts[parts.length - 1];
  if (lastPart === undefined) {
    return `${v}.1`;
  }
  const last = parseInt(lastPart, 10);
  if (Number.isNaN(last)) {
    return `${v}.1`;
  }
  parts[parts.length - 1] = (last + 1).toString();
  return parts.join('.');
}

// Get tags using multiple methods for reliability
const TAGS: Set<string> = new Set();

// Method 1: git ls-remote (Very reliable for remote tags, ignores shallow clone issues)
try {
  console.error('Fetching tags via git ls-remote --tags origin...');
  const LS_REMOTE = execSync('git ls-remote --tags origin', {
    encoding: 'utf8',
  });
  LS_REMOTE.split('\n').forEach((line) => {
    // Format: [hash] refs/tags/[tagname] or refs/tags/[tagname]^{}
    const match = line.match(/refs\/tags\/([^^ ]+)/);
    if (match?.[1]) {
      TAGS.add(match[1]);
    }
  });
  console.error(`Found ${TAGS.size} tags via git ls-remote`);
} catch (e) {
  console.error(`git ls-remote failed: ${e}`);
}

// Method 2: GitHub API (Fallback/Extra check)
try {
  const REPO = process.env.GITHUB_REPOSITORY;
  if (REPO) {
    console.error(`Fetching tags from GH API for repo: ${REPO}`);
    const TAGS_JSON = execSync(`gh api "repos/${REPO}/tags?per_page=100" --jq '.[].name'`, {
      encoding: 'utf8',
    });
    TAGS_JSON.split('\n').forEach((t) => {
      const trimmed = t.trim();
      if (trimmed) TAGS.add(trimmed);
    });
  }
} catch (e) {
  console.error(`gh api failed: ${e}`);
}

const TAG_LIST = Array.from(TAGS);
console.error(`Total unique tags found: ${TAG_LIST.length}`);
if (TAG_LIST.length > 0) {
  console.error(`Sample tags: ${TAG_LIST.slice(0, 5).join(', ')}`);
}

while (true) {
  const TAG_PREFIX = CHANNEL === 'stable' ? `v${version}` : `v${version}-${CHANNEL}`;

  // Check for exact match or prefix match with a dot (e.g. v0.0.1-canary.hash)
  const CONFLICT = TAG_LIST.some((t) => {
    const isExact = t === TAG_PREFIX;
    const isPrefix = t.startsWith(`${TAG_PREFIX}.`);
    return isExact || isPrefix;
  });

  if (CONFLICT) {
    const OLD_VERSION = version;
    version = incrementVersion(version);
    console.error(
      `COLLISION DETECTED: A tag starting with ${TAG_PREFIX} already exists. Incrementing ${OLD_VERSION} -> ${version}`,
    );
  } else {
    console.error(`No conflict found for ${TAG_PREFIX}. Using version ${version}`);
    break;
  }
}

// Ensure ONLY the version is on stdout
process.stdout.write(version.trim());
