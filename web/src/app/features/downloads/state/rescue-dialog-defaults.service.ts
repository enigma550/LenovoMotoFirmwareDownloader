import { Injectable } from '@angular/core';
import type {
  FirmwareVariant,
  LocalDownloadedFile,
  RescueFlashTransport,
  RescueQdlStorage,
} from '../../../core/models/desktop-api';
import { detectRescueFlashTransport } from '../../../core/ui/rescue-transport-detection';
import type { DataResetChoice } from '../../../shared/state/workflow.types';

export type RescueDialogDefaults = {
  dataReset: DataResetChoice;
  flashTransport: RescueFlashTransport;
  qdlStorage: RescueQdlStorage;
  qdlSerial: string;
};

@Injectable({ providedIn: 'root' })
export class RescueDialogDefaultsService {
  createDefaults(source?: FirmwareVariant | LocalDownloadedFile | null): RescueDialogDefaults {
    return {
      dataReset: 'yes',
      flashTransport: detectRescueFlashTransport(
        source
          ? 'fileName' in source
            ? {
                fileName: source.fileName,
                fullPath: source.fullPath,
                extractedDir: source.extractedDir,
                recipeUrl: source.recipeUrl,
                selectedParameters: source.selectedParameters,
              }
            : {
                romName: source.romName,
                romUrl: source.romUrl,
                recipeUrl: source.recipeUrl,
                selectedParameters: source.selectedParameters,
              }
          : undefined,
      ),
      qdlStorage: 'auto',
      qdlSerial: '',
    };
  }
}
