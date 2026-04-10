import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT_DIR = process.cwd();
const SOURCE_ROOTS = [
  path.join(ROOT_DIR, 'core'),
  path.join(ROOT_DIR, 'runtime'),
  path.join(ROOT_DIR, 'tooling'),
  path.join(ROOT_DIR, 'web', 'src', 'app'),
];
const SOURCE_EXTENSIONS = new Set(['.ts']);
const IMPORT_PATTERN =
  /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\sfrom\s*)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/gm;

type Graph = Map<string, Set<string>>;

async function collectSourceFiles(dirPath: string): Promise<string[]> {
  const dirEntries = await readdir(dirPath, { withFileTypes: true });
  const nested = await Promise.all(
    dirEntries.map(async (dirEntry) => {
      const fullPath = path.join(dirPath, dirEntry.name);
      if (dirEntry.isDirectory()) {
        if (dirEntry.name === 'node_modules' || dirEntry.name === 'dist') {
          return [] as string[];
        }
        return collectSourceFiles(fullPath);
      }
      if (!dirEntry.isFile()) {
        return [] as string[];
      }
      return SOURCE_EXTENSIONS.has(path.extname(dirEntry.name)) ? [fullPath] : [];
    }),
  );
  return nested.flat();
}

function normalizeFilePath(filePath: string) {
  return path.relative(ROOT_DIR, filePath).replaceAll('\\', '/');
}

function resolveAliasedImport(importSpecifier: string) {
  if (importSpecifier.startsWith('core/')) {
    return path.join(ROOT_DIR, importSpecifier);
  }
  if (importSpecifier.startsWith('runtime/')) {
    return path.join(ROOT_DIR, importSpecifier);
  }
  if (importSpecifier.startsWith('web/')) {
    return path.join(ROOT_DIR, importSpecifier);
  }
  if (importSpecifier.startsWith('tooling/')) {
    return path.join(ROOT_DIR, importSpecifier);
  }
  return null;
}

async function resolveImportPath(fromFilePath: string, importSpecifier: string) {
  if (importSpecifier.startsWith('node:')) {
    return null;
  }

  const basePath =
    importSpecifier.startsWith('./') || importSpecifier.startsWith('../')
      ? path.resolve(path.dirname(fromFilePath), importSpecifier)
      : resolveAliasedImport(importSpecifier);
  if (!basePath) {
    return null;
  }

  const candidates = [basePath, `${basePath}.ts`, path.join(basePath, 'index.ts')];

  for (const candidatePath of candidates) {
    try {
      const candidateStats = await stat(candidatePath);
      if (candidateStats.isFile()) {
        return candidatePath;
      }
    } catch {
      // Ignore missing candidates.
    }
  }

  return null;
}

async function buildDependencyGraph(sourceFiles: string[]) {
  const graph: Graph = new Map();
  const sourceSet = new Set(sourceFiles.map((filePath) => path.resolve(filePath)));

  for (const sourceFile of sourceFiles) {
    const sourceNode = path.resolve(sourceFile);
    const fileContents = await readFile(sourceNode, 'utf8');
    const imports = fileContents.matchAll(IMPORT_PATTERN);
    const dependencies = new Set<string>();

    for (const importMatch of imports) {
      const importSpecifier = importMatch[1] || importMatch[2];
      if (!importSpecifier) {
        continue;
      }
      const resolvedPath = await resolveImportPath(sourceNode, importSpecifier);
      if (!resolvedPath) {
        continue;
      }
      const resolvedNode = path.resolve(resolvedPath);
      if (!sourceSet.has(resolvedNode)) {
        continue;
      }
      dependencies.add(resolvedNode);
    }

    graph.set(sourceNode, dependencies);
  }

  return graph;
}

function stronglyConnectedComponents(graph: Graph) {
  let indexCounter = 0;
  const stack: string[] = [];
  const onStack = new Set<string>();
  const nodeIndex = new Map<string, number>();
  const lowLink = new Map<string, number>();
  const components: string[][] = [];

  function visit(node: string) {
    nodeIndex.set(node, indexCounter);
    lowLink.set(node, indexCounter);
    indexCounter += 1;
    stack.push(node);
    onStack.add(node);

    const edges = graph.get(node) || new Set<string>();
    for (const edge of edges) {
      if (!nodeIndex.has(edge)) {
        visit(edge);
        const nextLow = Math.min(lowLink.get(node) || 0, lowLink.get(edge) || 0);
        lowLink.set(node, nextLow);
      } else if (onStack.has(edge)) {
        const nextLow = Math.min(lowLink.get(node) || 0, nodeIndex.get(edge) || 0);
        lowLink.set(node, nextLow);
      }
    }

    if ((lowLink.get(node) || 0) === (nodeIndex.get(node) || 0)) {
      const component: string[] = [];
      while (true) {
        const stackNode = stack.pop();
        if (!stackNode) {
          break;
        }
        onStack.delete(stackNode);
        component.push(stackNode);
        if (stackNode === node) {
          break;
        }
      }
      components.push(component);
    }
  }

  for (const node of graph.keys()) {
    if (!nodeIndex.has(node)) {
      visit(node);
    }
  }

  return components;
}

function findCycles(graph: Graph) {
  const components = stronglyConnectedComponents(graph);
  const cycles: string[][] = [];

  for (const component of components) {
    if (component.length > 1) {
      cycles.push(component);
      continue;
    }

    const onlyNode = component[0];
    if (!onlyNode) {
      continue;
    }
    const edges = graph.get(onlyNode) || new Set<string>();
    if (edges.has(onlyNode)) {
      cycles.push(component);
    }
  }

  return cycles;
}

async function main() {
  const filesPerRoot = await Promise.all(
    SOURCE_ROOTS.map((sourceRoot) => collectSourceFiles(sourceRoot)),
  );
  const sourceFiles = filesPerRoot.flat();
  const graph = await buildDependencyGraph(sourceFiles);
  const cycles = findCycles(graph);

  if (cycles.length === 0) {
    console.log('[CycleCheck] OK: no dependency cycles found.');
    return;
  }

  console.error(`[CycleCheck] Found ${cycles.length} dependency cycle(s):`);
  for (const cycle of cycles) {
    const formatted = cycle.map((node) => normalizeFilePath(node)).sort();
    console.error(`- ${formatted.join(' -> ')}`);
  }
  process.exit(1);
}

await main();
