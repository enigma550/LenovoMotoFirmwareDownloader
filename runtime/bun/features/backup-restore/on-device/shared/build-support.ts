import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function isWindows() {
  return process.platform === 'win32';
}

export function commandName(base: string) {
  return isWindows() ? `${base}.exe` : base;
}

function commandCandidates(base: string) {
  if (!isWindows()) {
    return [base];
  }
  if (/\.[^\\/]+$/.test(base)) {
    return [base];
  }
  return [`${base}.exe`, `${base}.bat`, `${base}.cmd`, base];
}

function toSpawnCommand(command: string, args: string[]) {
  if (!isWindows()) {
    return [command, ...args];
  }

  const lower = command.toLowerCase();
  if (!lower.endsWith('.bat') && !lower.endsWith('.cmd')) {
    return [command, ...args];
  }

  return ['cmd.exe', '/d', '/s', '/c', command, ...args];
}

export function candidateSdkRoots() {
  const localAppData = process.env.LOCALAPPDATA || '';
  return [
    process.env.LMFD_ANDROID_SDK_ROOT || '',
    process.env.ANDROID_SDK_ROOT || '',
    process.env.ANDROID_HOME || '',
    join(homedir(), 'Android', 'Sdk'),
    join(homedir(), 'Library', 'Android', 'sdk'),
    localAppData ? join(localAppData, 'Android', 'Sdk') : '',
    join(homedir(), '.cache', 'apie', 'android-sdk'),
  ].filter((value, index, array) => value && array.indexOf(value) === index);
}

export function sdkRoot() {
  return candidateSdkRoots()[0] || join(homedir(), '.cache', 'apie', 'android-sdk');
}

export async function collectFiles(rootDir: string, extension: string): Promise<string[]> {
  const collected: string[] = [];

  async function walk(currentDir: string) {
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(extension)) {
        collected.push(entryPath);
      }
    }
  }

  await walk(rootDir);
  collected.sort();
  return collected;
}

export function run(command: string, args: string[]) {
  const proc = Bun.spawnSync(toSpawnCommand(command, args), {
    stdout: 'pipe',
    stderr: 'pipe',
    env: process.env,
  });
  if (proc.exitCode !== 0) {
    throw new Error(
      `${command} failed.\n${proc.stdout.toString().trim()}\n${proc.stderr.toString().trim()}`.trim(),
    );
  }
}

export async function runWithInput(command: string, args: string[], input: string) {
  const proc = Bun.spawn(toSpawnCommand(command, args), {
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: 'pipe',
    env: process.env,
  });
  const stdin = proc.stdin;
  if (!stdin) {
    throw new Error(`Unable to write stdin for ${command}.`);
  }
  stdin.write(input);
  stdin.end();
  const [stdout, stderr, exitCode] = await Promise.all([
    proc.stdout ? new Response(proc.stdout).text() : Promise.resolve(''),
    proc.stderr ? new Response(proc.stderr).text() : Promise.resolve(''),
    proc.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(`${command} failed.\n${stdout.trim()}\n${stderr.trim()}`.trim());
  }
}

export async function findInPath(executable: string) {
  const pathValue = process.env.PATH || '';
  for (const segment of pathValue.split(isWindows() ? ';' : ':')) {
    if (!segment) {
      continue;
    }
    for (const name of commandCandidates(executable)) {
      const candidate = join(segment, name);
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return '';
}

export async function resolveBuildTool(tool: string) {
  const envName = `ANDROID_${tool.toUpperCase()}`;
  const envHit = process.env[envName];
  if (envHit && existsSync(envHit)) {
    return envHit;
  }

  const pathHit = await findInPath(tool);
  if (pathHit) {
    return pathHit;
  }

  for (const root of candidateSdkRoots()) {
    const buildToolsRoot = join(root, 'build-tools');
    if (!existsSync(buildToolsRoot)) {
      continue;
    }
    const versions = await readdir(buildToolsRoot).catch(() => []);
    for (const version of versions.sort().reverse()) {
      for (const name of commandCandidates(tool)) {
        const candidate = join(buildToolsRoot, version, name);
        if (existsSync(candidate)) {
          return candidate;
        }
      }
    }
  }

  return '';
}

export async function resolveSdkManager() {
  const pathHit = await findInPath('sdkmanager');
  if (pathHit) {
    return pathHit;
  }

  for (const root of candidateSdkRoots()) {
    for (const name of commandCandidates('sdkmanager')) {
      const candidate = join(root, 'cmdline-tools', 'latest', 'bin', name);
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return '';
}
