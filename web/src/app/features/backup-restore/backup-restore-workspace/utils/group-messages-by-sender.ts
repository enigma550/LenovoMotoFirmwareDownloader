import type { BackupRestoreMessageEntry } from '../../../../core/models/desktop-api';

export interface MessageThread {
  sender: string;
  messages: BackupRestoreMessageEntry[];
}

/** Minimum number of trailing digits two numbers must share to be considered the same contact. */
const MIN_SUFFIX_MATCH = 7;

/**
 * Extracts only digits from a string.
 * Returns the raw lowercased/trimmed string for non-numeric senders.
 */
function toDigits(raw: string): { digits: string; isPhone: boolean } {
  const digits = raw.replace(/\D/g, '');
  return { digits, isPhone: digits.length >= MIN_SUFFIX_MATCH };
}

/**
 * Checks whether two digit strings represent the same phone number
 * by comparing their trailing digits. This handles any country code
 * length (1–3 digits) and any local number length (7–12 digits).
 *
 * Examples that match:
 *   "+4512345678"  ↔  "12345678"       (DK, +45)
 *   "+12025551234" ↔  "2025551234"     (US, +1)
 *   "+447911123456" ↔ "07911123456"    (UK, +44 with leading 0)
 *   "+353861234567" ↔ "0861234567"     (IE, +353 with leading 0)
 *   "+919876543210" ↔ "9876543210"     (IN, +91)
 *   "12 34 56 78"   ↔ "+4512345678"   (spaces stripped)
 */
function isSamePhone(digitsA: string, digitsB: string): boolean {
  if (digitsA === digitsB) return true;

  // The shorter string must be a suffix of the longer one,
  // but both must have at least MIN_SUFFIX_MATCH digits.
  const shorter = digitsA.length <= digitsB.length ? digitsA : digitsB;
  const longer = digitsA.length > digitsB.length ? digitsA : digitsB;

  if (shorter.length < MIN_SUFFIX_MATCH) return false;

  return longer.endsWith(shorter);
}

/**
 * Groups messages by sender, preserving the order of first occurrence.
 * Uses suffix-matching on phone digits so that any country-code variant
 * ("+4512345678", "4512345678", "12345678", "12 34 56 78") groups together.
 * Non-numeric senders (e.g. company names) are grouped by exact lowercase match.
 */
export function groupMessagesBySender(messages: BackupRestoreMessageEntry[]): MessageThread[] {
  const threads: {
    displaySender: string;
    digits: string;
    isPhone: boolean;
    messages: BackupRestoreMessageEntry[];
  }[] = [];

  for (const message of messages) {
    const rawSender = message.sender || 'Unknown sender';
    const { digits, isPhone } = toDigits(rawSender);

    let matched = false;

    if (isPhone) {
      // Try to find an existing thread whose digits suffix-match
      for (const thread of threads) {
        if (thread.isPhone && isSamePhone(thread.digits, digits)) {
          thread.messages.push(message);
          // Keep the longest (most complete, usually with country code) as display
          if (digits.length > thread.digits.length) {
            thread.digits = digits;
          }
          if (rawSender.length > thread.displaySender.length) {
            thread.displaySender = rawSender;
          }
          matched = true;
          break;
        }
      }
    } else {
      // Non-phone: exact lowercase match
      const key = rawSender.trim().toLowerCase();
      for (const thread of threads) {
        if (!thread.isPhone && thread.displaySender.trim().toLowerCase() === key) {
          thread.messages.push(message);
          matched = true;
          break;
        }
      }
    }

    if (!matched) {
      threads.push({ displaySender: rawSender, digits, isPhone, messages: [message] });
    }
  }

  return threads.map((thread) => ({
    sender: thread.displaySender,
    messages: thread.messages,
  }));
}
