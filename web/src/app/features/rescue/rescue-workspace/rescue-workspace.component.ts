import { Component } from '@angular/core';
import { FirmwareResultsComponent } from '../../firmware/firmware-results/firmware-results.component';

@Component({
  selector: 'app-rescue-workspace',
  standalone: true,
  imports: [FirmwareResultsComponent],
  template: '<app-firmware-results />',
})
export class RescueWorkspaceComponent {}
