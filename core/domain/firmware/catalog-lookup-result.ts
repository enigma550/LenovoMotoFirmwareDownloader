import type { FirmwareVariant } from './variant';

export interface CatalogFirmwareLookupResult {
  variants: FirmwareVariant[];
  statesExplored: number;
  manualMatchResponseCode: string;
  manualMatchResponseDescription: string;
  autoMatchPlatform: string;
  autoMatchRequiredParameters: string[];
}
