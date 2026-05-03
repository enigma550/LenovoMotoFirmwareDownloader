import { existsSync } from 'node:fs';
import { chmod, copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readEnvFlag, resolveBuildTarget } from './lib/build-env.ts';
import { commandExists, runCommand } from './lib/process.ts';
import { readJsonFile, readJsonFileIfExists, writeJsonFile } from './lib/tool-metadata.ts';

const REPO_ROOT = process.cwd();
const USB_PACKAGE_JSON_PATH = join(REPO_ROOT, 'node_modules', 'usb', 'package.json');
const OUTPUT_DIR = join(REPO_ROOT, 'assets', 'tools', 'usb', 'linux-x64');
const OUTPUT_BINARY_PATH = join(OUTPUT_DIR, 'node.napi.glibc.node');
const OUTPUT_METADATA_PATH = join(OUTPUT_DIR, 'release.json');
const CONTAINER_IMAGE = 'quay.io/pypa/manylinux2014_x86_64';
const NODE_VERSION = '16.20.2';
const PYTHON_PATH = '/opt/python/cp311-cp311/bin/python3';

type ExistingMetadata = {
  usbVersion?: string;
  buildFlavor?: string;
  nodeVersion?: string;
} | null;

async function readExistingMetadata(): Promise<ExistingMetadata> {
  return readJsonFileIfExists<ExistingMetadata>(OUTPUT_METADATA_PATH);
}

async function disableUdevInUsbBuildFiles(sourceDir: string) {
  for (const relativePath of ['binding.gyp', 'libusb.gypi']) {
    const filePath = join(sourceDir, relativePath);
    const content = await readFile(filePath, 'utf8');
    const patched = content.replace("'use_udev%': 1", "'use_udev%': 0");
    if (patched === content) {
      throw new Error(
        `[USB] Could not disable udev in ${relativePath}; expected use_udev setting was not found.`,
      );
    }
    await writeFile(filePath, patched);
  }
}

async function ensureExecutableBit(filePath: string) {
  try {
    await chmod(filePath, 0o755);
  } catch {
    // Best effort.
  }
}

async function main() {
  const target = resolveBuildTarget({ label: 'USB' });
  const forcePrepare = readEnvFlag('USB_FORCE_PREPARE');

  if (target.platform !== 'linux' || target.arch !== 'x64') {
    console.log(`[USB] Skipping legacy addon build for ${target.key}.`);
    return;
  }

  if (process.platform !== 'linux') {
    console.log('[USB] Skipping legacy addon build because host is not Linux.');
    return;
  }

  if (!commandExists('podman', REPO_ROOT)) {
    console.log('[USB] Skipping legacy addon build because podman is unavailable.');
    return;
  }

  const packageJson = await readJsonFile<{ version: string }>(USB_PACKAGE_JSON_PATH);
  const buildFlavor = `podman:${CONTAINER_IMAGE}:node-${NODE_VERSION}:no-udev`;
  const existingMetadata = await readExistingMetadata();
  const metadataMatches =
    existingMetadata?.usbVersion === packageJson.version &&
    existingMetadata?.buildFlavor === buildFlavor &&
    existingMetadata?.nodeVersion === NODE_VERSION;

  if (!forcePrepare && existsSync(OUTPUT_BINARY_PATH) && metadataMatches) {
    console.log(`[USB] Bundled legacy addon already ready at ${OUTPUT_BINARY_PATH}`);
    return;
  }

  const buildRoot = join(tmpdir(), 'lmfd-usb-addon-build', target.key);
  const sourceDir = join(buildRoot, 'usb');
  const builtBinaryPath = join(sourceDir, 'build', 'Release', 'usb_bindings.node');

  console.log(`[USB] Preparing legacy linux-x64 addon for usb@${packageJson.version}...`);

  await rm(buildRoot, { recursive: true, force: true });
  await mkdir(buildRoot, { recursive: true });
  await mkdir(OUTPUT_DIR, { recursive: true });

  runCommand({
    args: ['-a', join(REPO_ROOT, 'node_modules', 'usb'), sourceDir],
    command: 'cp',
    cwd: REPO_ROOT,
    label: 'USB',
  });
  await disableUdevInUsbBuildFiles(sourceDir);

  const containerScript = [
    'set -euo pipefail',
    'yum install -y gcc gcc-c++ make tar xz >/dev/null',
    `export PATH=${PYTHON_PATH.replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\/python3$/, '')}:$PATH`,
    'python3 --version',
    `curl -fsSL https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz -o /tmp/node.tar.xz`,
    'mkdir -p /opt/node',
    'tar -xJf /tmp/node.tar.xz -C /opt/node --strip-components=1',
    'export PATH=/opt/node/bin:$PATH',
    'export npm_config_python=$(command -v python3)',
    'node -v',
    'npm -v',
    'npm install --ignore-scripts >/dev/null',
    './node_modules/.bin/node-gyp rebuild',
    'strip -s build/Release/usb_bindings.node || :',
    'cp -f build/Release/usb_bindings.node /out/node.napi.glibc.node',
  ].join('\n');

  runCommand({
    args: [
      'run',
      '--rm',
      '--platform',
      'linux/amd64',
      '-v',
      `${sourceDir}:/work:Z`,
      '-v',
      `${OUTPUT_DIR}:/out:Z`,
      '-w',
      '/work',
      CONTAINER_IMAGE,
      'bash',
      '-lc',
      containerScript,
    ],
    command: 'podman',
    cwd: REPO_ROOT,
    label: 'USB',
  });

  if (!existsSync(OUTPUT_BINARY_PATH)) {
    throw new Error('[USB] Legacy addon build completed without producing output.');
  }

  await ensureExecutableBit(OUTPUT_BINARY_PATH);
  await copyFile(OUTPUT_BINARY_PATH, builtBinaryPath).catch(() => {
    // Ignore copy-back failures; the packaged override uses OUTPUT_BINARY_PATH.
  });

  await writeJsonFile(OUTPUT_METADATA_PATH, {
    buildFlavor,
    nodeVersion: NODE_VERSION,
    targetArch: target.arch,
    targetPlatform: target.platform,
    usbVersion: packageJson.version,
  });

  console.log(`[USB] Bundled legacy addon ready at ${OUTPUT_BINARY_PATH}`);
}

await main();
