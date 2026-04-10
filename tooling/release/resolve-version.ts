import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function getConfiguredVersion() {
  const configPath = join(process.cwd(), 'electrobun.config.ts');

  try {
    const content = readFileSync(configPath, 'utf8');
    const match = content.match(/version:\s*["']([^"']+)["']/);
    const version = match?.[1]?.trim() || '';

    if (!version) {
      fail('Could not find app.version in electrobun.config.ts');
    }

    return version;
  } catch (error) {
    fail(`Error reading electrobun.config.ts: ${error}`);
  }
}

process.stdout.write(getConfiguredVersion());
