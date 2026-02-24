import type { FirmwareVariant } from "./firmware-variant.ts";

export interface CatalogFirmwareLookupResult {
  variants: FirmwareVariant[];
  statesExplored: number;
  manualMatchResponseCode: string;
  manualMatchResponseDescription: string;
  autoMatchPlatform: string;
  autoMatchRequiredParameters: string[];
}
