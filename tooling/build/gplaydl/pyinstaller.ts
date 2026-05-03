import { existsSync } from 'node:fs';
import { runCommand } from '../lib/process.ts';
import type { GplaydlBuildContext } from './config.ts';
import { GPLAYDL_VERSION, PYINSTALLER_VERSION } from './config.ts';

const PYINSTALLER_EXCLUDED_MODULES = ['IPython', 'matplotlib', 'numpy', 'tkinter'];

function createPyinstallerArgs(context: GplaydlBuildContext): string[] {
  const args = [
    '-m',
    'PyInstaller',
    '--noconfirm',
    '--clean',
    '--onefile',
    context.sourceEntryPath,
    '--name',
    'gplaydl',
    '--distpath',
    context.distDir,
    '--workpath',
    context.workDir,
    '--specpath',
    context.specDir,
  ];

  for (const moduleName of PYINSTALLER_EXCLUDED_MODULES) {
    args.push('--exclude-module', moduleName);
  }

  return args;
}

export function buildGplaydlOnHost(context: GplaydlBuildContext): void {
  runCommand({
    args: [
      '-m',
      'pip',
      'install',
      '--upgrade',
      '--target',
      context.sitePackagesDir,
      `pyinstaller==${PYINSTALLER_VERSION}`,
      `gplaydl==${GPLAYDL_VERSION}`,
    ],
    command: context.pythonExecutable,
    env: {
      ['PYTHONNOUSERSITE']: '1',
    },
    label: 'GPLAYDL',
  });

  if (!existsSync(context.sourceEntryPath)) {
    throw new Error(`[GPLAYDL] Could not locate gplaydl entrypoint at ${context.sourceEntryPath}`);
  }

  runCommand({
    args: createPyinstallerArgs(context),
    command: context.pythonExecutable,
    env: {
      ['MPLCONFIGDIR']: context.mplConfigDir,
      ['PYTHONNOUSERSITE']: '1',
      ['PYTHONPATH']: context.sitePackagesDir,
    },
    label: 'GPLAYDL',
  });
}

export function buildGplaydlInContainer(context: GplaydlBuildContext): void {
  if (!context.container) {
    throw new Error('[GPLAYDL] Container build requested without a container plan.');
  }

  const containerWorkRoot = '/work';
  const containerSitePackagesDir = `${containerWorkRoot}/site-packages`;
  const containerSourceEntryPath = `${containerSitePackagesDir}/gplaydl/__main__.py`;
  const containerPyinstallerArgs = [
    'PYTHONPATH=site-packages',
    'PYTHONNOUSERSITE=1',
    'MPLCONFIGDIR=mplconfig',
    JSON.stringify(context.container.python),
    ...createPyinstallerArgs({
      ...context,
      distDir: 'dist',
      sourceEntryPath: 'site-packages/gplaydl/__main__.py',
      specDir: 'spec',
      workDir: 'work',
    }),
  ].join(' ');

  const containerScript = [
    'set -euo pipefail',
    'yum install -y libffi-devel openssl-devel >/dev/null',
    'if [ ! -x /work/python-shared/bin/python3 ] || ! env LD_LIBRARY_PATH=/work/python-shared/lib /work/python-shared/bin/python3 -c "import _ctypes, ssl" >/dev/null 2>&1; then',
    '  rm -rf /work/python-shared',
    '  cd /work',
    `  curl -fL ${JSON.stringify(context.container.pythonTarballUrl)} -o Python.tgz`,
    `  rm -rf ${JSON.stringify(context.container.pythonSourceDir)}`,
    '  tar -xf Python.tgz',
    `  cd ${JSON.stringify(context.container.pythonSourceDir)}`,
    '  ./configure --prefix=/work/python-shared --enable-shared --with-ensurepip=no --with-openssl=/usr',
    '  make -j"$(nproc)"',
    '  make install',
    '  cd /work',
    'fi',
    `export LD_LIBRARY_PATH=/work/python-shared/lib\${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}`,
    `${JSON.stringify(context.container.installerPython)} -m pip install --upgrade pip`,
    `${JSON.stringify(context.container.installerPython)} -m pip install --no-cache-dir --upgrade --target ${JSON.stringify(
      containerSitePackagesDir,
    )} ${JSON.stringify(`pyinstaller==${PYINSTALLER_VERSION}`)} ${JSON.stringify(
      `gplaydl==${GPLAYDL_VERSION}`,
    )}`,
    `test -f ${JSON.stringify(containerSourceEntryPath)}`,
    containerPyinstallerArgs,
  ].join('\n');

  runCommand({
    args: [
      'run',
      '--rm',
      '--platform',
      context.container.platform,
      '-v',
      `${context.buildRoot}:${containerWorkRoot}:Z`,
      '-w',
      containerWorkRoot,
      context.container.image,
      'bash',
      '-lc',
      containerScript,
    ],
    command: 'podman',
    label: 'GPLAYDL',
  });
}
