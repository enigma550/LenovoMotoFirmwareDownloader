import { Injectable, inject, signal } from '@angular/core';
import { AuthApiService } from '../../api/auth-api.service';
import type { FirmwareVariant, LocalDownloadedFile } from '../../models/desktop-api';
import { findBestLocalFileMatchForVariant, getPreferredVariantFileName } from './download-utils';
import { WorkflowUiService } from './workflow-ui.service';

@Injectable({ providedIn: 'root' })
export class DownloadLocalFilesService {
  private readonly backend = inject(AuthApiService);
  private readonly ui = inject(WorkflowUiService);

  readonly localDownloadedFiles = signal<LocalDownloadedFile[]>([]);

  async extractLocalFirmware(file: LocalDownloadedFile) {
    this.ui.errorMessage.set('');
    this.ui.status.set(`Extracting ${file.fileName}...`);
    try {
      const response = await this.backend.extractLocalFirmware({
        filePath: file.fullPath,
        fileName: file.fileName,
        extractedDir: file.extractedDir,
      });

      if (!response.ok) {
        const cancelMessage = response.error || '';
        if (/cancel/i.test(cancelMessage)) {
          this.ui.status.set('Extraction canceled.');
          this.ui.showToast(`Extraction canceled: ${file.fileName}`, 'info', 2600);
          return;
        }
        throw new Error(response.error || 'Failed to extract local firmware package.');
      }

      this.ui.status.set(
        response.reusedExtraction
          ? 'Extraction skipped (already extracted).'
          : 'Extraction completed.',
      );
      this.ui.showToast(
        response.reusedExtraction
          ? `Already extracted: ${file.fileName}`
          : `Extracted: ${file.fileName}`,
        'success',
        2600,
      );
      await this.refreshLocalDownloadedFiles();
    } catch (error) {
      const message = this.ui.getErrorMessage(error);
      if (/cancel/i.test(message)) {
        this.ui.errorMessage.set('');
        this.ui.status.set('Extraction canceled.');
        this.ui.showToast(`Extraction canceled: ${file.fileName}`, 'info', 2600);
        return;
      }
      this.ui.errorMessage.set(message);
      this.ui.status.set('Extraction failed.');
      this.ui.status.set('Idle');
      this.ui.showToast(message, 'error', 3600);
    }
  }

  async attachLocalRecipeFromModel(
    file: LocalDownloadedFile,
    model: { modelName: string; marketName?: string; category?: string },
  ) {
    this.ui.errorMessage.set('');
    this.ui.status.set(`Fetching recipe metadata for ${file.fileName}...`);
    try {
      const response = await this.backend.attachLocalRecipeFromModel({
        filePath: file.fullPath,
        fileName: file.fileName,
        modelName: model.modelName,
        marketName: model.marketName,
        category: model.category,
      });
      if (!response.ok) {
        throw new Error(response.error || 'Recipe metadata fetch failed.');
      }
      this.ui.status.set('Recipe metadata saved.');
      this.ui.showToast('Recipe metadata linked to local firmware.', 'success', 2600);
      await this.refreshLocalDownloadedFiles();
    } catch (error) {
      const message = this.ui.getErrorMessage(error);
      this.ui.errorMessage.set(message);
      this.ui.status.set('Idle');
      this.ui.showToast(message, 'error', 3600);
    }
  }

  async attachLocalRecipeFromVariant(file: LocalDownloadedFile, variant: FirmwareVariant) {
    if (!variant.recipeUrl) {
      this.ui.errorMessage.set('This firmware variant does not include a recipe URL.');
      this.ui.showToast('No recipe URL was found for this variant.', 'error', 3200);
      return false;
    }

    this.ui.errorMessage.set('');
    this.ui.status.set(`Linking recipe metadata to ${file.fileName}...`);
    try {
      const response = await this.backend.attachLocalRecipeMetadata({
        filePath: file.fullPath,
        fileName: file.fileName,
        recipeUrl: variant.recipeUrl,
        romName: variant.romName,
        romUrl: variant.romUrl,
        publishDate: variant.publishDate,
        romMatchIdentifier: variant.romMatchIdentifier,
        selectedParameters: variant.selectedParameters,
        source: 'variant-link',
      });
      if (!response.ok) {
        throw new Error(response.error || 'Recipe metadata link failed.');
      }

      this.ui.status.set('Recipe metadata saved.');
      this.ui.showToast(`Recipe linked: ${file.fileName}`, 'success', 2600);
      await this.refreshLocalDownloadedFiles();
      return true;
    } catch (error) {
      const message = this.ui.getErrorMessage(error);
      this.ui.errorMessage.set(message);
      this.ui.status.set('Idle');
      this.ui.showToast(message, 'error', 3600);
      return false;
    }
  }

  async attachVariantRecipeToMatchingLocalZip(variant: FirmwareVariant) {
    if (!variant.recipeUrl) {
      this.ui.errorMessage.set('This firmware variant does not include a recipe URL.');
      this.ui.showToast('No recipe URL was found for this variant.', 'error', 3200);
      return false;
    }

    if (this.localDownloadedFiles().length === 0) {
      await this.refreshLocalDownloadedFiles();
    }

    const matchedFile = findBestLocalFileMatchForVariant(variant, this.localDownloadedFiles());
    if (!matchedFile) {
      this.ui.errorMessage.set(
        `No matching local archive found for ${getPreferredVariantFileName(variant)}.`,
      );
      this.ui.showToast('No matching local archive found to link recipe metadata.', 'error', 3600);
      return false;
    }

    return this.attachLocalRecipeFromVariant(matchedFile, variant);
  }

  async deleteLocalFile(file: LocalDownloadedFile) {
    const confirmed = await this.ui.confirm(
      'Remove download?',
      `Are you sure you want to remove ${file.fileName} from your local storage? This will delete the file and all associated metadata.`,
    );

    if (!confirmed) {
      return;
    }

    try {
      const response = await this.backend.deleteLocalFile({ filePath: file.fullPath });
      if (!response.ok) {
        throw new Error(response.error || 'Failed to delete file.');
      }
      await this.refreshLocalDownloadedFiles();
      this.ui.showToast(`Removed ${file.fileName}`, 'info', 3000);
    } catch (error) {
      const message = this.ui.getErrorMessage(error);
      this.ui.showToast(message, 'error', 4200);
    }
  }

  async refreshLocalDownloadedFiles() {
    try {
      const response = await this.backend.listLocalDownloadedFiles();
      if (!response.ok) {
        return;
      }
      this.localDownloadedFiles.set(response.files);
    } catch {
      // Ignore refresh failures to keep download workflow non-blocking.
    }
  }
}
