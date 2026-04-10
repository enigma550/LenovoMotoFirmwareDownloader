import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type { BackupRestoreMessageEntry } from '../../../../core/models/desktop-api';
import { formatTime } from '../../../../shared/utils/format';
import type { MessageThread } from '../utils/group-messages-by-sender';

@Component({
  selector: 'app-backup-message-thread-list',
  standalone: true,
  templateUrl: './backup-message-thread-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BackupMessageThreadListComponent {
  readonly threads = input.required<MessageThread[]>();
  readonly isDark = input(false);
  /** Pass null to hide checkboxes (read-only snapshot mode). */
  readonly selectedIds = input<Set<string> | null>(null);

  readonly toggleMessage = output<string>();
  readonly toggleThread = output<string>();

  protected readonly expandedSenders = signal<Set<string>>(new Set());

  protected readonly allExpanded = computed(() => {
    const threads = this.threads();
    if (threads.length === 0) return false;
    const expanded = this.expandedSenders();
    return threads.every((thread) => expanded.has(thread.sender));
  });

  protected isExpanded(sender: string) {
    return this.expandedSenders().has(sender);
  }

  protected toggleExpand(sender: string) {
    const current = new Set(this.expandedSenders());
    if (current.has(sender)) {
      current.delete(sender);
    } else {
      current.add(sender);
    }
    this.expandedSenders.set(current);
  }

  protected isMessageSelected(messageId: string) {
    return this.selectedIds()?.has(messageId) ?? false;
  }

  protected isThreadAllSelected(thread: MessageThread) {
    const ids = this.selectedIds();
    if (!ids) return false;
    return thread.messages.every((message) => ids.has(message.id));
  }

  protected isThreadPartiallySelected(thread: MessageThread) {
    const ids = this.selectedIds();
    if (!ids) return false;
    const selectedCount = thread.messages.filter((message) => ids.has(message.id)).length;
    return selectedCount > 0 && selectedCount < thread.messages.length;
  }

  protected senderInitials(sender: string) {
    const normalized = sender.replace(/[^a-zA-Z0-9 ]+/g, ' ').trim();
    if (!normalized) return 'SM';
    const parts = normalized.split(/\s+/).slice(0, 2);
    return parts.map((value) => value[0]?.toUpperCase() || '').join('') || 'SM';
  }

  protected expandAll() {
    const all = new Set(this.threads().map((thread) => thread.sender));
    this.expandedSenders.set(all);
  }

  protected collapseAll() {
    this.expandedSenders.set(new Set());
  }

  protected formatMessageTime(timestamp: number | undefined) {
    return formatTime(timestamp);
  }

  protected directionLabel(message: BackupRestoreMessageEntry) {
    if (message.messageType === 'sent') return 'Sent';
    if (message.messageType === 'received') return 'Received';
    return 'SMS';
  }

  protected get selectable() {
    return this.selectedIds() !== null;
  }
}
