import { Component, inject } from '@angular/core';
import { AuthFacade } from '../state';

@Component({
  selector: 'app-auth-panel',
  standalone: true,
  templateUrl: './auth-panel.component.html',
})
export class AuthPanelComponent {
  protected readonly store = inject(AuthFacade);
}
