import { computed, Injectable, inject, signal } from '@angular/core';
import { AuthApiService } from '../../api/auth-api.service';
import type {
  CatalogCountryOptions,
  CatalogFirmwareLookupResult,
  ConnectedLookupResponse,
  FirmwareVariant,
  ModelCatalogEntry,
  ReadSupportFirmwareLookupResult,
} from '../../models/desktop-api.ts';
import type {
  CategoryFilter,
  ReadSupportFilter,
  ReadSupportMode,
  SourceMode,
} from './workflow.types';
import { WorkflowUiService } from './workflow-ui.service';

@Injectable({ providedIn: 'root' })
export class CatalogWorkflowService {
  private readonly backend = inject(AuthApiService);
  private readonly ui = inject(WorkflowUiService);
  private readonly pageSize = 30;

  readonly sourceMode = signal<SourceMode>(null);
  readonly firmwareVariants = signal<FirmwareVariant[]>([]);
  readonly connectedSummary = signal('');

  readonly models = signal<ModelCatalogEntry[]>([]);
  readonly selectedModel = signal<ModelCatalogEntry | null>(null);
  readonly categoryFilter = signal<CategoryFilter>('all');
  readonly readSupportFilter = signal<ReadSupportFilter>('all');
  readonly searchText = signal('');
  readonly pageIndex = signal(0);

  readonly countryOptions = signal<CatalogCountryOptions | null>(null);
  readonly selectedCountry = signal('');
  readonly manualCatalogResult = signal<CatalogFirmwareLookupResult | null>(null);

  readonly readSupportHints = signal<{
    code: string;
    description: string;
    platform: string;
    requiredParameters: string[];
  } | null>(null);
  readonly readSupportMode = signal<ReadSupportMode>('imei');
  readonly readSupportResult = signal<ReadSupportFirmwareLookupResult | null>(null);

  readonly imei = signal('');
  readonly imei2 = signal('');
  readonly sn = signal('');
  readonly roCarrier = signal('reteu');
  readonly channelId = signal('');
  readonly requiredParams = signal<Record<string, string>>({});

  readonly filteredModels = computed(() => {
    const normalizedSearch = this.searchText().trim().toLowerCase();
    return this.models().filter((model) => {
      if (
        this.categoryFilter() !== 'all' &&
        model.category.toLowerCase() !== this.categoryFilter()
      ) {
        return false;
      }

      if (this.readSupportFilter() === 'true' && !model.readSupport) return false;
      if (this.readSupportFilter() === 'false' && model.readSupport) return false;

      if (!normalizedSearch) return true;
      return (
        model.modelName.toLowerCase().includes(normalizedSearch) ||
        model.marketName.toLowerCase().includes(normalizedSearch) ||
        model.platform.toLowerCase().includes(normalizedSearch)
      );
    });
  });

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredModels().length / this.pageSize)),
  );

  readonly visibleModels = computed(() => {
    const start = this.pageIndex() * this.pageSize;
    return this.filteredModels().slice(start, start + this.pageSize);
  });

  readonly selectedModelIsReadSupport = computed(() => this.selectedModel()?.readSupport ?? false);
  readonly selectedModelSupportsSnLookup = computed(() => {
    const category = this.selectedModel()?.category.trim().toLowerCase() || '';
    return category === 'tablet' || category === 'smart';
  });

  readonly recommendedReadSupportMode = computed<ReadSupportMode>(() => {
    return this.selectedModelSupportsSnLookup() ? 'sn' : 'imei';
  });

  setSourceMode(mode: SourceMode) {
    this.sourceMode.set(mode);
    this.clearResults();
    this.ui.showToast(mode ? `Source set to ${mode}.` : 'Source cleared.', 'info', 1800);
  }

  setCategoryFilter(value: CategoryFilter) {
    this.categoryFilter.set(value);
    this.pageIndex.set(0);
  }

  setReadSupportFilter(value: ReadSupportFilter) {
    this.readSupportFilter.set(value);
    this.pageIndex.set(0);
  }

  setSearchText(value: string) {
    this.searchText.set(value);
    this.pageIndex.set(0);
  }

  setReadSupportMode(mode: ReadSupportMode) {
    if (mode === 'sn' && this.selectedModel() && !this.selectedModelSupportsSnLookup()) {
      this.readSupportMode.set('imei');
      this.ui.showToast('SN lookup is only available for tablet/smart models.', 'info', 2200);
      return;
    }

    this.readSupportMode.set(mode);
    this.ui.showToast(`Lookup mode set to ${mode}.`, 'info', 1600);
  }

  setRequiredParam(name: string, value: string) {
    this.requiredParams.update((previous) => ({ ...previous, [name]: value }));
  }

  prevPage() {
    this.pageIndex.update((value) => Math.max(0, value - 1));
  }

  nextPage() {
    this.pageIndex.update((value) => Math.min(this.totalPages() - 1, value + 1));
  }

  async loadCatalog(refresh = false) {
    await this.ui.runAction(
      refresh ? 'Refreshing model catalog...' : 'Loading model catalog...',
      async () => {
        const response = await this.backend.getCatalogModels(refresh);
        if (!response.ok) throw new Error(response.error || 'Failed to load model catalog.');
        this.models.set(response.models);
        this.pageIndex.set(0);
        if (response.usedLmsaRefresh && !refresh) {
          this.ui.status.set(
            `Local catalog was empty. Refreshed from LMSA and loaded (${response.models.length} models).`,
          );
          return;
        }

        this.ui.status.set(
          refresh
            ? `Catalog refreshed from LMSA (${response.models.length} models).`
            : `Catalog loaded (${response.models.length} models).`,
        );
      },
    );
  }

  async runConnectedLookup() {
    await this.ui.runAction('Looking up firmware from connected device...', async () => {
      const response = await this.backend.lookupConnectedDeviceFirmware();
      if (!response.ok) throw new Error(response.error || 'Connected lookup failed.');

      this.firmwareVariants.set(response.variants);
      const toolText = `adb=${response.adbAvailable ? 'yes' : 'no'}, fastboot=${
        response.fastbootAvailable ? 'yes' : 'no'
      }`;
      const deviceText = response.device
        ? `model=${response.device.modelName}, imei=${response.device.imei || 'N/A'}, sn=${response.device.sn || 'N/A'}`
        : 'device=N/A';
      const attemptText = response.attempts
        .map(
          (attempt: { mode: string; code: string }) => `${attempt.mode}:${attempt.code || 'N/A'}`,
        )
        .join(' | ');
      this.connectedSummary.set(`${toolText} | ${deviceText} | attempts=${attemptText}`);

      await this.tryAutoSelectConnectedModel(response);

      this.ui.status.set(
        response.variants.length > 0
          ? `Found ${response.variants.length} firmware variant(s).`
          : 'No firmware variant found from connected lookup.',
      );
    });
  }

  async selectModel(model: ModelCatalogEntry) {
    this.selectedModel.set(model);
    this.firmwareVariants.set([]);
    this.clearLookupResults();
    this.readSupportMode.set(this.recommendedReadSupportMode());
    this.ui.showToast(`Selected model: ${model.modelName} (${model.marketName}).`, 'info', 2200);

    if (model.readSupport) {
      await this.ui.runAction('Loading readSupport parameter hints...', async () => {
        const response = await this.backend.getReadSupportHints(model.modelName);
        if (!response.ok || !response.data) {
          throw new Error(response.error || 'Failed to load readSupport hints.');
        }

        this.readSupportHints.set(response.data);
        const initialParams = Object.fromEntries(
          response.data.requiredParameters.map((name: string) => [name, '']),
        );
        this.requiredParams.set(initialParams);
        this.ui.status.set(
          `Loaded readSupport hints (${response.data.requiredParameters.length} params).`,
        );
      });
      return;
    }

    await this.ui.runAction('Discovering country options...', async () => {
      const response = await this.backend.discoverCountryOptions(model);
      if (!response.ok || !response.data) {
        throw new Error(response.error || 'Failed to discover country options.');
      }
      this.countryOptions.set(response.data);
      this.selectedCountry.set('');
      this.ui.status.set(
        response.data.foundCountrySelector
          ? 'Country selector discovered.'
          : 'No country selector found.',
      );
    });
  }

  async runManualCatalogLookup() {
    const model = this.selectedModel();
    if (!model) {
      this.ui.errorMessage.set('Select a model first.');
      return;
    }

    await this.ui.runAction('Running manual catalog lookup...', async () => {
      const countrySelection = this.selectedCountry();
      const response = await this.backend.lookupCatalogManual(
        model,
        countrySelection && countrySelection !== '__ALL__' ? countrySelection : undefined,
        countrySelection === '__ALL__',
      );

      if (!response.ok || !response.data) {
        throw new Error(response.error || 'Manual catalog lookup failed.');
      }

      this.manualCatalogResult.set(response.data);
      this.firmwareVariants.set(response.data.variants);
      this.ui.status.set(
        response.data.variants.length > 0
          ? `Found ${response.data.variants.length} firmware variant(s).`
          : `No firmware found. Last code=${response.data.manualMatchResponseCode || 'N/A'}`,
      );
    });
  }

  async runReadSupportLookupByImei() {
    const model = this.selectedModel();
    if (!model) {
      this.ui.errorMessage.set('Select a model first.');
      return;
    }

    if (!this.imei().trim()) {
      this.ui.errorMessage.set('IMEI is required for IMEI lookup.');
      return;
    }

    await this.runReadSupportLookupAction(
      'Running readSupport IMEI lookup...',
      async () =>
        this.backend.lookupReadSupportByImei({
          model,
          imei: this.imei().trim(),
          imei2: this.imei2().trim() || undefined,
          sn: this.sn().trim() || undefined,
          roCarrier: this.roCarrier().trim() || 'reteu',
          channelId: this.channelId().trim() || undefined,
        }),
      'IMEI lookup failed.',
    );
  }

  async runReadSupportLookupBySn() {
    const model = this.selectedModel();
    if (!model) {
      this.ui.errorMessage.set('Select a model first.');
      return;
    }

    if (!this.selectedModelSupportsSnLookup()) {
      this.ui.errorMessage.set('SN lookup is only supported for tablet/smart models in LMSA.');
      return;
    }

    if (!this.sn().trim()) {
      this.ui.errorMessage.set('Serial number is required for SN lookup.');
      return;
    }

    await this.runReadSupportLookupAction(
      'Running readSupport serial lookup...',
      async () =>
        this.backend.lookupReadSupportBySn({
          model,
          sn: this.sn().trim(),
          channelId: this.channelId().trim() || undefined,
        }),
      'SN lookup failed.',
    );
  }

  async runReadSupportLookupByParams() {
    const model = this.selectedModel();
    const hints = this.readSupportHints();
    if (!model || !hints) {
      this.ui.errorMessage.set('Select a readSupport model first.');
      return;
    }

    for (const parameter of hints.requiredParameters) {
      if (!this.requiredParams()[parameter]?.trim()) {
        this.ui.errorMessage.set(`Missing required parameter: ${parameter}`);
        return;
      }
    }

    await this.runReadSupportLookupAction(
      'Running readSupport params lookup...',
      async () =>
        this.backend.lookupReadSupportByParams({
          model,
          params: this.requiredParams(),
          imei: this.imei().trim() || undefined,
          imei2: this.imei2().trim() || undefined,
          sn: this.sn().trim() || undefined,
          channelId: this.channelId().trim() || undefined,
        }),
      'readSupport params lookup failed.',
    );
  }

  private clearResults() {
    this.connectedSummary.set('');
    this.firmwareVariants.set([]);
    this.clearLookupResults();
  }

  private clearLookupResults() {
    this.countryOptions.set(null);
    this.selectedCountry.set('');
    this.manualCatalogResult.set(null);
    this.readSupportHints.set(null);
    this.readSupportResult.set(null);
    this.requiredParams.set({});
  }

  private async runReadSupportLookupAction(
    statusText: string,
    request: () => Promise<{
      ok: boolean;
      error?: string;
      data?: ReadSupportFirmwareLookupResult;
    }>,
    fallbackError: string,
  ) {
    await this.ui.runAction(statusText, async () => {
      const response = await request();
      if (!response.ok || !response.data) {
        throw new Error(response.error || fallbackError);
      }
      this.applyReadSupportResult(response.data);
    });
  }

  private applyReadSupportResult(result: ReadSupportFirmwareLookupResult) {
    this.readSupportResult.set(result);
    this.firmwareVariants.set(result.variants);
    this.ui.status.set(
      result.variants.length > 0
        ? `Found ${result.variants.length} firmware variant(s).`
        : `No firmware found. code=${result.code || 'N/A'}`,
    );
  }

  private async tryAutoSelectConnectedModel(response: ConnectedLookupResponse) {
    const device = response.device;
    if (!device) {
      return;
    }

    if (this.models().length === 0) {
      const catalogResponse = await this.backend.getCatalogModels(false);
      if (catalogResponse.ok) {
        this.models.set(catalogResponse.models);
      }
    }

    const matchedModel = this.findCatalogModelForDevice(device.modelCode, device.modelName);
    if (!matchedModel) {
      return;
    }

    const current = this.selectedModel();
    if (
      current?.modelName === matchedModel.modelName &&
      current?.marketName === matchedModel.marketName
    ) {
      return;
    }

    this.selectedModel.set(matchedModel);
    this.readSupportMode.set(
      matchedModel.category.trim().toLowerCase() === 'tablet' ||
        matchedModel.category.trim().toLowerCase() === 'smart'
        ? 'sn'
        : 'imei',
    );
    this.ui.showToast(
      `Auto-selected connected model: ${matchedModel.modelName} (${matchedModel.marketName}).`,
      'info',
      2600,
    );
  }

  private findCatalogModelForDevice(modelCodeRaw: string, modelNameRaw: string) {
    const modelCode = modelCodeRaw.trim().toLowerCase();
    const modelName = modelNameRaw.trim().toLowerCase();
    const models = this.models();

    if (!modelCode && !modelName) {
      return null;
    }

    const exact = models.find((model) => {
      const candidate = model.modelName.trim().toLowerCase();
      return candidate === modelCode || candidate === modelName;
    });
    if (exact) {
      return exact;
    }

    const partial = models.find((model) => {
      const candidate = model.modelName.trim().toLowerCase();
      return (
        (modelCode && (candidate.includes(modelCode) || modelCode.includes(candidate))) ||
        (modelName && (candidate.includes(modelName) || modelName.includes(candidate)))
      );
    });
    if (partial) {
      return partial;
    }

    return null;
  }
}
