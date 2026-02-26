import {
  discoverCountryOptionsForCatalogModel,
  fetchFirmwareByImeiForModel,
  fetchFirmwareBySnForModel,
  fetchFirmwareVariantsForCatalogModel,
  fetchReadSupportFirmwareForModel,
  getModelCatalog,
  getReadSupportRequiredParameters,
  refreshModelCatalogFromApi,
} from '../../../core/features/catalog/index.ts';
import type { ConnectedLookupResponse } from '../../shared/rpc.ts';
import { isValidLmsaSerialNumber, lookupConnectedDeviceFirmware } from '../connected-lookup.ts';
import type { BunRpcRequestHandlers } from './types.ts';
import { toErrorMessage } from './types.ts';

export function createCatalogHandlers(): Pick<
  BunRpcRequestHandlers,
  | 'getCatalogModels'
  | 'lookupConnectedDeviceFirmware'
  | 'discoverCountryOptions'
  | 'lookupCatalogManual'
  | 'getReadSupportHints'
  | 'lookupReadSupportByImei'
  | 'lookupReadSupportBySn'
  | 'lookupReadSupportByParams'
> {
  return {
    getCatalogModels: async ({ refresh }) => {
      try {
        let usedLmsaRefresh = Boolean(refresh);
        let models = usedLmsaRefresh ? await refreshModelCatalogFromApi() : await getModelCatalog();

        if (!usedLmsaRefresh && models.length === 0) {
          console.log('[Catalog] Local catalog is empty. Refreshing from LMSA API...');
          models = await refreshModelCatalogFromApi();
          usedLmsaRefresh = true;
        }

        return { ok: true, models, usedLmsaRefresh };
      } catch (error) {
        return {
          ok: false,
          models: [],
          usedLmsaRefresh: false,
          error: toErrorMessage(error),
        };
      }
    },
    lookupConnectedDeviceFirmware: async () => {
      try {
        return await lookupConnectedDeviceFirmware();
      } catch (error) {
        return {
          ok: false,
          adbAvailable: false,
          fastbootAvailable: false,
          attempts: [],
          variants: [],
          error: toErrorMessage(error),
        } satisfies ConnectedLookupResponse;
      }
    },
    discoverCountryOptions: async ({ model }) => {
      try {
        const data = await discoverCountryOptionsForCatalogModel(model);
        return { ok: true, data };
      } catch (error) {
        return { ok: false, error: toErrorMessage(error) };
      }
    },
    lookupCatalogManual: async ({ model, countryValue, allCountries }) => {
      try {
        let initialParametersOverride: Record<string, string> | undefined;
        if (countryValue || allCountries) {
          const countryOptions = await discoverCountryOptionsForCatalogModel(model);
          if (countryOptions.foundCountrySelector && countryOptions.countryValues.length > 0) {
            if (countryValue) {
              initialParametersOverride = {
                ...countryOptions.baseParametersBeforeCountry,
                [countryOptions.countryParameterKey]: countryValue,
              };
            } else if (allCountries) {
              initialParametersOverride = {
                ...countryOptions.baseParametersBeforeCountry,
              };
            }
          }
        }

        const data = await fetchFirmwareVariantsForCatalogModel(
          model,
          initialParametersOverride,
          Boolean(allCountries),
        );

        return { ok: true, data };
      } catch (error) {
        return { ok: false, error: toErrorMessage(error) };
      }
    },
    getReadSupportHints: async ({ modelName }) => {
      try {
        const data = await getReadSupportRequiredParameters(modelName);
        return { ok: true, data };
      } catch (error) {
        return { ok: false, error: toErrorMessage(error) };
      }
    },
    lookupReadSupportByImei: async ({ model, imei, imei2, sn, roCarrier, channelId }) => {
      try {
        const data = await fetchFirmwareByImeiForModel(model, {
          imei,
          imei2,
          sn,
          roCarrier,
          channelId,
        });
        return { ok: true, data };
      } catch (error) {
        return { ok: false, error: toErrorMessage(error) };
      }
    },
    lookupReadSupportBySn: async ({ model, sn, channelId }) => {
      try {
        if (!isValidLmsaSerialNumber(sn)) {
          return {
            ok: false,
            error:
              'Serial number format invalid for LMSA SN lookup (8 chars: 1 letter + 7 alphanumeric excluding i/o).',
          };
        }

        const data = await fetchFirmwareBySnForModel(model, {
          sn,
          channelId,
        });
        return { ok: true, data };
      } catch (error) {
        return { ok: false, error: toErrorMessage(error) };
      }
    },
    lookupReadSupportByParams: async ({ model, params, imei, imei2, sn, channelId }) => {
      try {
        const data = await fetchReadSupportFirmwareForModel(model, params, {
          imei,
          imei2,
          sn,
          channelId,
        });
        return { ok: true, data };
      } catch (error) {
        return { ok: false, error: toErrorMessage(error) };
      }
    },
  };
}
