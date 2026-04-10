export interface FirmwareVariant {
  romName: string;
  romUrl: string;
  romMatchIdentifier: string;
  publishDate?: string;
  recipeUrl?: string;
  selectedParameters?: Record<string, string>;
}
