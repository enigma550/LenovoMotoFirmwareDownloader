import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const RUNTIME_PACKAGE_ROOTS = ['usb', 'apie', 'google-play-proto'] as const;

type PackageManifest = {
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

function resolveNodeModulesRoot() {
  return join(process.cwd(), 'node_modules');
}

function resolvePackagePath(nodeModulesRoot: string, packageName: string) {
  return join(nodeModulesRoot, ...packageName.split('/'));
}

function readPackageManifest(packagePath: string): PackageManifest {
  const manifestPath = join(packagePath, 'package.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`Missing package manifest at ${manifestPath}.`);
  }

  return JSON.parse(readFileSync(manifestPath, 'utf8')) as PackageManifest;
}

function copyPackageDirectory(sourcePath: string, targetPath: string) {
  rmSync(targetPath, { recursive: true, force: true });
  cpSync(sourcePath, targetPath, {
    recursive: true,
    force: true,
    dereference: true,
  });
}

function collectRequiredRuntimeDependencyNames(manifest: PackageManifest) {
  return Object.keys(manifest.dependencies || {});
}

function collectInstalledOptionalRuntimeDependencyNames(
  manifest: PackageManifest,
  nodeModulesRoot: string,
) {
  return Object.keys(manifest.optionalDependencies || {}).filter((packageName) =>
    existsSync(resolvePackagePath(nodeModulesRoot, packageName)),
  );
}

function copyRuntimePackageRecursive(options: {
  packageName: string;
  sourceNodeModulesRoot: string;
  targetNodeModulesRoot: string;
  copiedPackages: Set<string>;
}) {
  if (options.copiedPackages.has(options.packageName)) {
    return;
  }

  const sourcePath = resolvePackagePath(options.sourceNodeModulesRoot, options.packageName);
  if (!existsSync(sourcePath)) {
    throw new Error(`Runtime dependency "${options.packageName}" was not found at ${sourcePath}.`);
  }

  const targetPath = resolvePackagePath(options.targetNodeModulesRoot, options.packageName);
  mkdirSync(join(targetPath, '..'), { recursive: true });
  copyPackageDirectory(sourcePath, targetPath);
  options.copiedPackages.add(options.packageName);

  const manifest = readPackageManifest(sourcePath);
  for (const dependencyName of collectRequiredRuntimeDependencyNames(manifest)) {
    copyRuntimePackageRecursive({
      packageName: dependencyName,
      sourceNodeModulesRoot: options.sourceNodeModulesRoot,
      targetNodeModulesRoot: options.targetNodeModulesRoot,
      copiedPackages: options.copiedPackages,
    });
  }

  for (const dependencyName of collectInstalledOptionalRuntimeDependencyNames(
    manifest,
    options.sourceNodeModulesRoot,
  )) {
    copyRuntimePackageRecursive({
      packageName: dependencyName,
      sourceNodeModulesRoot: options.sourceNodeModulesRoot,
      targetNodeModulesRoot: options.targetNodeModulesRoot,
      copiedPackages: options.copiedPackages,
    });
  }
}

export function packageBundledRuntimeDependencies(appFolder: string) {
  const sourceNodeModulesRoot = resolveNodeModulesRoot();
  if (!existsSync(sourceNodeModulesRoot)) {
    throw new Error(`Source node_modules directory was not found at ${sourceNodeModulesRoot}.`);
  }

  const targetNodeModulesRoot = join(appFolder, 'Resources', 'app', 'node_modules');
  mkdirSync(targetNodeModulesRoot, { recursive: true });

  const copiedPackages = new Set<string>();
  for (const packageName of RUNTIME_PACKAGE_ROOTS) {
    copyRuntimePackageRecursive({
      packageName,
      sourceNodeModulesRoot,
      targetNodeModulesRoot,
      copiedPackages,
    });
  }

  console.log(
    `Packaged ${copiedPackages.size} runtime node module(s) into ${targetNodeModulesRoot}.`,
  );
}
