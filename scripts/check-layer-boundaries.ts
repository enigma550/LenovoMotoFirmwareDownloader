import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

type LayerName = "core" | "runtime" | "web";

type BoundaryRule = {
  source: LayerName;
  forbiddenTargets: LayerName[];
};

const ROOT_DIR = process.cwd();
const SOURCE_ROOTS = [
  path.join(ROOT_DIR, "core"),
  path.join(ROOT_DIR, "runtime"),
  path.join(ROOT_DIR, "web", "src", "app"),
];

const SCANNED_EXTENSIONS = new Set([".ts"]);
const IMPORT_PATTERN =
  /(?:import|export)\s+(?:[\s\S]*?\sfrom\s*)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/gm;

const BOUNDARY_RULES: BoundaryRule[] = [
  { source: "core", forbiddenTargets: ["runtime", "web"] },
  { source: "runtime", forbiddenTargets: ["web"] },
  { source: "web", forbiddenTargets: ["runtime"] },
];

type Violation = {
  filePath: string;
  lineNumber: number;
  sourceLayer: LayerName;
  targetLayer: LayerName;
  importSpecifier: string;
};

async function collectSourceFiles(directoryPath: string): Promise<string[]> {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "dist" || entry.name === "node_modules") {
          return [] as string[];
        }
        return collectSourceFiles(fullPath);
      }
      if (!entry.isFile()) {
        return [] as string[];
      }
      const extension = path.extname(entry.name);
      return SCANNED_EXTENSIONS.has(extension) ? [fullPath] : [];
    }),
  );
  return nested.flat();
}

function detectLayerFromPath(filePath: string): LayerName | null {
  const normalizedPath = normalizePath(filePath);
  if (normalizedPath.includes("/web/src/app/")) return "web";
  if (normalizedPath.includes("/runtime/")) return "runtime";
  if (normalizedPath.includes("/core/")) return "core";
  return null;
}

function normalizePath(filePath: string) {
  return filePath.replaceAll("\\", "/");
}

function isRelativeSpecifier(importSpecifier: string) {
  return importSpecifier.startsWith("./") || importSpecifier.startsWith("../");
}

function isBareSpecifier(importSpecifier: string) {
  return (
    !isRelativeSpecifier(importSpecifier) && !importSpecifier.startsWith("/")
  );
}

async function resolveRelativeImport(
  fromFilePath: string,
  importSpecifier: string,
) {
  const basePath = path.resolve(path.dirname(fromFilePath), importSpecifier);
  const candidates = [
    basePath,
    `${basePath}.ts`,
    path.join(basePath, "index.ts"),
  ];

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

  return basePath;
}

async function detectTargetLayer(
  fromFilePath: string,
  importSpecifier: string,
): Promise<LayerName | null> {
  if (importSpecifier.startsWith("node:")) {
    return null;
  }

  if (isRelativeSpecifier(importSpecifier)) {
    const resolvedPath = await resolveRelativeImport(
      fromFilePath,
      importSpecifier,
    );
    return detectLayerFromPath(resolvedPath);
  }

  if (isBareSpecifier(importSpecifier)) {
    if (importSpecifier.startsWith("core/")) return "core";
    if (importSpecifier.startsWith("runtime/")) return "runtime";
    if (importSpecifier.startsWith("web/")) return "web";
    return null;
  }

  return detectLayerFromPath(importSpecifier);
}

function getLineNumber(fileContents: string, index: number) {
  return fileContents.slice(0, index).split("\n").length;
}

function isForbiddenImport(sourceLayer: LayerName, targetLayer: LayerName) {
  const rule = BOUNDARY_RULES.find(
    (candidateRule) => candidateRule.source === sourceLayer,
  );
  return Boolean(rule && rule.forbiddenTargets.includes(targetLayer));
}

async function findBoundaryViolations(filePath: string): Promise<Violation[]> {
  const sourceLayer = detectLayerFromPath(filePath);
  if (!sourceLayer) {
    return [];
  }

  const fileContents = await readFile(filePath, "utf8");
  const matches = fileContents.matchAll(IMPORT_PATTERN);
  const violations: Violation[] = [];

  for (const match of matches) {
    const importSpecifier = match[1] || match[2];
    if (!importSpecifier || typeof match.index !== "number") {
      continue;
    }

    const targetLayer = await detectTargetLayer(filePath, importSpecifier);
    if (!targetLayer) {
      continue;
    }

    if (!isForbiddenImport(sourceLayer, targetLayer)) {
      continue;
    }

    violations.push({
      filePath,
      lineNumber: getLineNumber(fileContents, match.index),
      sourceLayer,
      targetLayer,
      importSpecifier,
    });
  }

  return violations;
}

async function main() {
  const filesByRoot = await Promise.all(
    SOURCE_ROOTS.map((sourceRoot) => collectSourceFiles(sourceRoot)),
  );
  const sourceFiles = filesByRoot.flat();
  const violationsByFile = await Promise.all(
    sourceFiles.map((sourceFile) => findBoundaryViolations(sourceFile)),
  );
  const violations = violationsByFile.flat();

  if (violations.length === 0) {
    console.log("[LayerCheck] OK: no forbidden cross-layer imports found.");
    return;
  }

  console.error("[LayerCheck] Found forbidden cross-layer imports:");
  for (const violation of violations) {
    console.error(
      `- ${path.relative(ROOT_DIR, violation.filePath)}:${violation.lineNumber} ` +
        `(${violation.sourceLayer} -> ${violation.targetLayer}) import "${violation.importSpecifier}"`,
    );
  }
  process.exit(1);
}

await main();
