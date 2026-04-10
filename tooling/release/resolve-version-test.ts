import { execSync } from 'node:child_process';

const CHANNEL = process.argv[2] || 'dev';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

let version = '';
try {
  version = execSync(`bun tooling/release/resolve-version.ts ${CHANNEL}`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }).trim();
} catch (error) {
  fail(`resolve-version execution failed for channel '${CHANNEL}': ${error}`);
}

if (!version) {
  fail(`resolve-version returned empty output for channel '${CHANNEL}'`);
}

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  fail(`resolve-version returned invalid version '${version}' for channel '${CHANNEL}'`);
}

console.log(`Resolved version for ${CHANNEL}: ${version}`);
