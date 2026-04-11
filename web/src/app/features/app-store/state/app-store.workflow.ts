import { computed, Injectable, inject, signal } from '@angular/core';
import { AppStoreDesktopApiService } from '../../../core/api/desktop';
import type {
  PlayStoreAppDetails,
  PlayStoreArch,
  PlayStoreDownloadGroup,
  PlayStoreSearchResult,
  PlayStoreStatusResponse,
} from '../../../core/models/desktop-api';
import { WorkflowUiService } from '../../../shared/state/workflow-ui.service';

type AppStoreLastInstall = {
  packageCount: number;
  installedArtifactCount: number;
  installMode?: 'standard' | 'microg';
  detail?: string;
};

@Injectable({ providedIn: 'root' })
export class AppStoreWorkflowService {
  private readonly backend = inject(AppStoreDesktopApiService);
  private readonly ui = inject(WorkflowUiService);
  private initialized = false;

  readonly toolStatus = signal<PlayStoreStatusResponse | null>(null);
  readonly searchQuery = signal('');
  readonly searchResults = signal<PlayStoreSearchResult[]>([]);
  readonly selectedResult = signal<PlayStoreSearchResult | null>(null);
  readonly selectedDetails = signal<PlayStoreAppDetails | null>(null);
  readonly selectedArch = signal<PlayStoreArch>('arm64');
  readonly downloadRoot = signal('');
  readonly downloads = signal<PlayStoreDownloadGroup[]>([]);
  readonly selectedDownloadIds = signal<string[]>([]);
  readonly expandedDownloadIds = signal<string[]>([]);
  readonly selectedDownloads = computed(() => {
    const selectedIds = new Set(this.selectedDownloadIds());
    return this.downloads().filter((download) => selectedIds.has(download.id));
  });
  readonly selectedDownloadCount = computed(() => this.selectedDownloads().length);
  readonly lastInstall = signal<AppStoreLastInstall | null>(null);

  async initialize() {
    if (this.initialized) {
      return;
    }

    await Promise.all([this.refreshToolStatus(), this.refreshDownloads()]);
    this.initialized = true;
  }

  async refreshToolStatus() {
    const response = await this.backend.getPlayStoreStatus();
    this.toolStatus.set(response);
    if (response.downloadRoot) {
      this.downloadRoot.set(response.downloadRoot);
    }
    return response;
  }

  async refreshDownloads(preferredPackageName?: string) {
    const response = await this.backend.listPlayStoreDownloads();
    if (!response.ok) {
      throw new Error(response.error || 'Could not read App Store downloads.');
    }

    const downloads = response.downloads;
    this.downloadRoot.set(response.downloadRoot || '');
    this.downloads.set(downloads);

    const availableIds = new Set(downloads.map((download) => download.id));
    this.selectedDownloadIds.update((current) =>
      current.filter((downloadId) => availableIds.has(downloadId)),
    );
    this.expandedDownloadIds.update((current) =>
      current.filter((downloadId) => availableIds.has(downloadId)),
    );

    if (preferredPackageName) {
      const preferred = downloads.find((download) => download.packageName === preferredPackageName);
      if (preferred) {
        this.selectedDownloadIds.update((current) =>
          current.includes(preferred.id) ? current : [preferred.id, ...current],
        );
        await this.syncSelectedAppToPackage(preferred.packageName);
        return;
      }
    }

    if (downloads.length === 0) {
      return;
    }

    const firstSelected = this.selectedDownloads()[0];
    if (firstSelected) {
      await this.syncSelectedAppToPackage(firstSelected.packageName);
    }
  }

  setSearchQuery(query: string) {
    this.searchQuery.set(query);
  }

  setSelectedArch(arch: PlayStoreArch) {
    this.selectedArch.set(arch);
  }

  isDownloadSelected(downloadId: string) {
    return this.selectedDownloadIds().includes(downloadId);
  }

  isDownloadExpanded(downloadId: string) {
    return this.expandedDownloadIds().includes(downloadId);
  }

  async toggleDownloadSelection(download: PlayStoreDownloadGroup) {
    const isSelected = this.isDownloadSelected(download.id);
    this.selectedDownloadIds.update((current) => {
      const next = new Set(current);
      if (isSelected) {
        next.delete(download.id);
      } else {
        next.add(download.id);
      }
      return [...next];
    });

    if (!isSelected) {
      await this.syncSelectedAppToPackage(download.packageName);
    }
  }

  async toggleDownloadExpanded(download: PlayStoreDownloadGroup) {
    const isExpanded = this.isDownloadExpanded(download.id);
    this.expandedDownloadIds.update((current) => {
      const next = new Set(current);
      if (isExpanded) {
        next.delete(download.id);
      } else {
        next.add(download.id);
      }
      return [...next];
    });

    await this.syncSelectedAppToPackage(download.packageName);
  }

  async search() {
    const query = this.searchQuery().trim();
    if (!query) {
      this.ui.errorMessage.set('Enter a search query first.');
      return;
    }

    await this.ui.runAction('Searching Play Store...', async () => {
      const status = await this.refreshToolStatus();
      if (!status.available) {
        throw new Error(status.error || 'gplaydl is unavailable.');
      }

      const response = await this.backend.searchPlayStoreApps({
        query,
        limit: 12,
        arch: this.selectedArch(),
      });
      if (!response.ok) {
        throw new Error(response.error || 'Search failed.');
      }

      this.searchResults.set(response.results);
      this.lastInstall.set(null);

      if (response.results.length === 0) {
        this.ui.status.set('No Play Store results found.');
        return;
      }

      await this.selectResult(response.results[0] as PlayStoreSearchResult);
      this.ui.status.set(`Found ${response.results.length} Play Store app result(s).`);
    });
  }

  async selectResult(result: PlayStoreSearchResult) {
    this.selectedResult.set(result);
    await this.loadSelectedDetails(result);
  }

  async downloadSelectedApp() {
    const selected = this.selectedResult();
    if (!selected) {
      this.ui.errorMessage.set('Select an app first.');
      return;
    }

    await this.ui.runAction(`Downloading ${selected.title}...`, async () => {
      const response = await this.backend.downloadPlayStoreApp({
        packageName: selected.packageName,
        arch: this.selectedArch(),
      });
      if (!response.ok) {
        throw new Error(response.error || 'Download failed.');
      }

      this.lastInstall.set(null);
      await this.refreshDownloads(response.packageName);

      const downloaded = this.downloads().find(
        (download) => download.packageName === selected.packageName,
      );
      const fileCount = downloaded?.artifacts.length || response.artifacts.length;
      this.ui.status.set(
        fileCount > 0
          ? `Downloaded ${fileCount} file(s) for ${selected.title}.`
          : `Download finished for ${selected.title}.`,
      );
      this.ui.showToast(`Saved ${selected.title}.`, 'success', 2600);
    });
  }

  async installSelectedDownloads(mode: 'standard' | 'microg' = 'standard') {
    const downloads = this.selectedDownloads();
    if (downloads.length === 0) {
      this.ui.errorMessage.set('Select at least one downloaded app first.');
      return;
    }

    await this.ui.runAction(`Installing ${downloads.length} app package set(s)...`, async () => {
      const failureMessages: string[] = [];
      let installedArtifactCount = 0;
      let installedPackageCount = 0;

      for (const download of downloads) {
        const response = await this.backend.installPlayStoreApp({
          packageName: download.packageName,
          artifactPaths: download.artifacts.map((artifact) => artifact.fullPath),
          mode,
        });

        if (!response.ok) {
          failureMessages.push(`${download.packageName}: ${response.error || 'Install failed.'}`);
          continue;
        }

        installedPackageCount += 1;
        installedArtifactCount += response.installedArtifactCount;
      }

      if (installedPackageCount === 0) {
        throw new Error(failureMessages[0] || 'Install failed.');
      }

      const summary =
        failureMessages.length > 0
          ? `Installed ${installedPackageCount}/${downloads.length}. ${failureMessages.slice(0, 2).join(' ')}`
          : `Installed ${installedPackageCount} app package set(s).`;

      this.lastInstall.set({
        packageCount: installedPackageCount,
        installedArtifactCount,
        installMode: mode,
        detail: summary,
      });
      this.ui.status.set(summary);
      this.ui.showToast(
        mode === 'microg'
          ? `Installed ${installedPackageCount} app(s) using com.android.vending.`
          : `Installed ${installedPackageCount} app(s) via Tango ADB.`,
        failureMessages.length > 0 ? 'info' : 'success',
        3200,
      );
    });
  }

  private async syncSelectedAppToPackage(packageName: string) {
    const existingTitle =
      this.searchResults().find((result) => result.packageName === packageName)?.title ||
      (this.selectedDetails()?.packageName === packageName
        ? this.selectedDetails()?.title
        : undefined) ||
      packageName;

    await this.selectResult({
      title: existingTitle,
      packageName,
    });
  }

  private async loadSelectedDetails(result: PlayStoreSearchResult) {
    const response = await this.backend.getPlayStoreAppDetails({
      packageName: result.packageName,
      arch: this.selectedArch(),
    });

    if (!response.ok || !response.data) {
      this.selectedDetails.set({
        title: result.title,
        packageName: result.packageName,
      });
      return;
    }

    this.selectedDetails.set({
      ...response.data,
      title: response.data.title === response.data.packageName ? result.title : response.data.title,
    });
  }
}
