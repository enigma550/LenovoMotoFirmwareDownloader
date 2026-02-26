import type { FirmwareVariant } from '../../shared/types/index.ts';

export function normalizeRemoteUrl(value: string) {
  return value.startsWith('http') ? value : `https://${value}`;
}

type ResourceRecordValue = object | string | number | boolean | null;
type ResourceRecord = Record<string, ResourceRecordValue>;

function toRecord(value: object | null | undefined): ResourceRecord | null {
  if (!value || Array.isArray(value)) return null;
  return value as ResourceRecord;
}

export function createFirmwareVariantFromResourceItem<T>(
  item: T,
  selectedParameters: Record<string, string>,
): FirmwareVariant | null {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return null;
  }

  const record = toRecord(item);
  if (!record) return null;

  const romResource =
    typeof record.romResource === 'object' && record.romResource !== null
      ? toRecord(record.romResource)
      : null;
  const uri = typeof romResource?.uri === 'string' ? romResource.uri.trim() : '';
  if (!uri) return null;

  const flashFlow = typeof record.flashFlow === 'string' ? record.flashFlow.trim() : '';

  return {
    romName: typeof romResource?.name === 'string' ? romResource.name : 'Unnamed ROM',
    romUrl: normalizeRemoteUrl(uri),
    romMatchIdentifier: typeof record.romMatchId === 'string' ? record.romMatchId : '',
    recipeUrl: flashFlow ? normalizeRemoteUrl(flashFlow) : undefined,
    publishDate: typeof romResource?.publishDate === 'string' ? romResource.publishDate : '',
    selectedParameters: { ...selectedParameters },
  };
}
