import { Component, inject } from '@angular/core';
import { SystemWorkflowService } from '../../system/state/system.workflow';
import { AuthFacade } from '../state';

@Component({
  selector: 'app-auth-panel',
  standalone: true,
  templateUrl: './auth-panel.component.html',
})
export class AuthPanelComponent {
  protected readonly store = inject(AuthFacade);
  protected readonly system = inject(SystemWorkflowService);

  protected isWindowsPlatform() {
    return this.system.appInfo()?.platform === 'win32';
  }
}
