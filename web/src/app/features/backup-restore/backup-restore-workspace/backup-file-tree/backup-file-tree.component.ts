import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
  output,
  signal,
  type WritableSignal,
} from '@angular/core';
import type { BackupRestoreFileEntry } from '../../../../core/models/desktop-api';
import { formatBytes } from '../../../../shared/utils/format';
import {
  collectTreeFileIds,
  collectTreeFolderPaths,
  type FileTreeNode,
} from '../utils/build-file-tree';

@Component({
  selector: 'app-backup-file-tree',
  standalone: true,
  imports: [forwardRef(() => BackupFileTreeComponent)],
  templateUrl: './backup-file-tree.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BackupFileTreeComponent {
  readonly tree = input.required<FileTreeNode[]>();
  readonly isDark = input(false);
  /** Pass null to hide checkboxes (read-only snapshot mode). */
  readonly selectedIds = input<Set<string> | null>(null);
  readonly depth = input(0);
  /**
   * Shared expanded paths signal, passed from root to children.
   * If null (root level), the component uses its own internal signal.
   */
  readonly sharedExpandedPaths = input<WritableSignal<Set<string>> | null>(null);

  readonly toggleFile = output<string>();
  readonly toggleFolder = output<string[]>();

  private readonly _ownExpandedPaths = signal<Set<string>>(new Set());

  /** Resolves the underlying writable signal — shared from parent or own. */
  protected get _effectiveSignal(): WritableSignal<Set<string>> {
    return this.sharedExpandedPaths() ?? this._ownExpandedPaths;
  }

  /** Read the current expanded paths set. */
  protected get expandedPaths(): Set<string> {
    return this._effectiveSignal();
  }

  /** Write a new expanded paths set. */
  protected set expandedPaths(value: Set<string>) {
    this._effectiveSignal.set(value);
  }

  protected readonly allExpanded = computed(() => {
    const nodes = this.tree();
    const folders = nodes.filter((node) => !node.file);
    if (folders.length === 0) return false;
    const allPaths = collectTreeFolderPaths(nodes);
    if (allPaths.length === 0) return false;
    const expanded = this.expandedPaths;
    return allPaths.every((path) => expanded.has(path));
  });

  protected readonly anyExpanded = computed(() => {
    return this.expandedPaths.size > 0;
  });

  protected isExpanded(fullPath: string) {
    return this.expandedPaths.has(fullPath);
  }

  protected toggleExpand(fullPath: string) {
    const current = new Set(this.expandedPaths);
    if (current.has(fullPath)) {
      current.delete(fullPath);
    } else {
      current.add(fullPath);
    }
    this.expandedPaths = current;
  }

  protected expandAll() {
    const allPaths = collectTreeFolderPaths(this.tree());
    const current = new Set(this.expandedPaths);
    for (const path of allPaths) {
      current.add(path);
    }
    this.expandedPaths = current;
  }

  protected collapseAll() {
    this.expandedPaths = new Set();
  }

  protected isFileSelected(fileId: string) {
    return this.selectedIds()?.has(fileId) ?? false;
  }

  protected isFolderAllSelected(node: FileTreeNode) {
    const ids = this.selectedIds();
    if (!ids) return false;
    const childIds = collectTreeFileIds(node.children);
    return childIds.length > 0 && childIds.every((id) => ids.has(id));
  }

  protected isFolderPartiallySelected(node: FileTreeNode) {
    const ids = this.selectedIds();
    if (!ids) return false;
    const childIds = collectTreeFileIds(node.children);
    const selectedCount = childIds.filter((id) => ids.has(id)).length;
    return selectedCount > 0 && selectedCount < childIds.length;
  }

  protected onToggleFolder(node: FileTreeNode) {
    const ids = collectTreeFileIds(node.children);
    this.toggleFolder.emit(ids);
  }

  protected onChildToggleFile(fileId: string) {
    this.toggleFile.emit(fileId);
  }

  protected onChildToggleFolder(fileIds: string[]) {
    this.toggleFolder.emit(fileIds);
  }

  protected fileExtIcon(entry: BackupRestoreFileEntry) {
    const ext = entry.fileName.split('.').pop()?.toLowerCase() || '';
    if (ext === 'pdf') return 'PDF';
    if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) return 'DOC';
    if (['xls', 'xlsx', 'ods', 'csv'].includes(ext)) return 'XLS';
    if (['ppt', 'pptx', 'odp'].includes(ext)) return 'PPT';
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'ZIP';
    if (['txt', 'md', 'log'].includes(ext)) return 'TXT';
    if (['json', 'xml', 'html'].includes(ext)) return 'CODE';
    if (ext === 'apk') return 'APK';
    return 'FILE';
  }

  protected formatNodeSize(bytes: number | undefined) {
    return formatBytes(bytes);
  }

  protected childFileCount(node: FileTreeNode) {
    let count = 0;
    for (const child of node.children) {
      count += child.file ? 1 : this.countDeep(child);
    }
    return count;
  }

  private countDeep(node: FileTreeNode): number {
    if (node.file) return 1;
    let count = 0;
    for (const child of node.children) {
      count += this.countDeep(child);
    }
    return count;
  }

  protected get selectable() {
    return this.selectedIds() !== null;
  }
}
