import type { FirmwareVariant } from './firmware-variant.ts';

export interface ReadSupportFirmwareLookupResult {
  code: string;
  description: string;
  variants: FirmwareVariant[];
}
