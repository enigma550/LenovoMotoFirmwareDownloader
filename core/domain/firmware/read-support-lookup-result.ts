import type { FirmwareVariant } from './variant';

export interface ReadSupportFirmwareLookupResult {
  code: string;
  description: string;
  variants: FirmwareVariant[];
}
