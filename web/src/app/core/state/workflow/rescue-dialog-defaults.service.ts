import { Injectable } from '@angular/core';
import type { RescueFlashTransport, RescueQdlStorage } from '../../models/desktop-api';
import type { DataResetChoice } from './workflow.types';

export type RescueDialogDefaults = {
  dataReset: DataResetChoice;
  flashTransport: RescueFlashTransport;
  qdlStorage: RescueQdlStorage;
  qdlSerial: string;
};

@Injectable({ providedIn: 'root' })
export class RescueDialogDefaultsService {
  createDefaults(): RescueDialogDefaults {
    return {
      dataReset: 'yes',
      flashTransport: 'fastboot',
      qdlStorage: 'auto',
      qdlSerial: '',
    };
  }
}
