export interface CatalogCountryOptions {
  foundCountrySelector: boolean;
  countryParameterKey: string;
  countryValues: string[];
  baseParametersBeforeCountry: Record<string, string>;
  discoveryResponseCode: string;
  discoveryResponseDescription: string;
}
