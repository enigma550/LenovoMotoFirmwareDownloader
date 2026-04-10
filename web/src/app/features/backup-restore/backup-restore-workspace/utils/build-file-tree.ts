import type { BackupRestoreFileEntry } from '../../../../core/models/desktop-api';

export interface FileTreeNode {
  name: string;
  fullPath: string;
  children: FileTreeNode[];
  file?: BackupRestoreFileEntry;
}

/**
 * Builds a tree structure from flat file entries by parsing their `relativePath`.
 * Folders are nodes with `children.length > 0` and no `file`.
 * Files are leaf nodes with a `file` reference and empty `children`.
 */
export function buildFileTree(files: BackupRestoreFileEntry[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];

  for (const file of files) {
    const segments = file.relativePath
      .replace(/\\/g, '/')
      .split('/')
      .filter((segment) => segment.length > 0);

    if (segments.length === 0) {
      continue;
    }

    let currentLevel = root;
    let pathSoFar = '';

    for (let depth = 0; depth < segments.length; depth++) {
      const segment = segments[depth] || '';
      pathSoFar = pathSoFar ? `${pathSoFar}/${segment}` : segment;
      const isLeaf = depth === segments.length - 1;

      if (isLeaf) {
        currentLevel.push({
          name: segment,
          fullPath: pathSoFar,
          children: [],
          file,
        });
      } else {
        let folderNode = currentLevel.find((node) => !node.file && node.name === segment);
        if (!folderNode) {
          folderNode = { name: segment, fullPath: pathSoFar, children: [] };
          currentLevel.push(folderNode);
        }
        currentLevel = folderNode.children;
      }
    }
  }

  sortTreeRecursive(root);
  return root;
}

function sortTreeRecursive(nodes: FileTreeNode[]) {
  nodes.sort((nodeA, nodeB) => {
    const aIsFolder = !nodeA.file;
    const bIsFolder = !nodeB.file;
    if (aIsFolder !== bIsFolder) {
      return aIsFolder ? -1 : 1;
    }
    return nodeA.name.localeCompare(nodeB.name, undefined, { sensitivity: 'base' });
  });

  for (const node of nodes) {
    if (node.children.length > 0) {
      sortTreeRecursive(node.children);
    }
  }
}

/** Counts all leaf files in a tree node (recursively). */
export function countTreeFiles(nodes: FileTreeNode[]): number {
  let count = 0;
  for (const node of nodes) {
    if (node.file) {
      count += 1;
    } else {
      count += countTreeFiles(node.children);
    }
  }
  return count;
}

/** Collects all file IDs under a tree node (recursively). */
export function collectTreeFileIds(nodes: FileTreeNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    if (node.file) {
      ids.push(node.file.id);
    } else {
      ids.push(...collectTreeFileIds(node.children));
    }
  }
  return ids;
}

/** Collects all folder paths in the tree (recursively). */
export function collectTreeFolderPaths(nodes: FileTreeNode[]): string[] {
  const paths: string[] = [];
  for (const node of nodes) {
    if (!node.file) {
      paths.push(node.fullPath);
      paths.push(...collectTreeFolderPaths(node.children));
    }
  }
  return paths;
}
