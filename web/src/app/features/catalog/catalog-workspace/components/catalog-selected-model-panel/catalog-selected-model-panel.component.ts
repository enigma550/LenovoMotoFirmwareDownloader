import { Component, type ElementRef, HostListener, inject, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { WorkflowStore } from '../../../../../core/state/workflow/workflow.store';
import { DropdownState } from '../../../../../core/ui/dropdown-state';

type DropdownMenu = 'country' | null;

@Component({
  selector: 'app-catalog-selected-model-panel',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './catalog-selected-model-panel.component.html',
})
export class CatalogSelectedModelPanelComponent {
  protected readonly store = inject(WorkflowStore);

  @ViewChild('countryTrigger') private countryTrigger?: ElementRef<HTMLElement>;

  private readonly dropdown = new DropdownState<Exclude<DropdownMenu, null>>();

  protected isMenuOpen(menu: Exclude<DropdownMenu, null>) {
    return this.dropdown.isOpen(menu);
  }

  protected isMenuUpward(menu: Exclude<DropdownMenu, null>) {
    return this.dropdown.isUpward(menu);
  }

  protected toggleCountryMenu(event: Event) {
    this.dropdown.toggleFromEvent('country', event, this.countryTrigger);
  }

  protected selectCountry(value: string, event: Event) {
    this.dropdown.selectFromEvent(event, () => this.store.selectedCountry.set(value));
  }

  protected selectedCountryLabel() {
    const selected = this.store.selectedCountry();
    if (selected === '__ALL__') return 'All available';
    if (!selected) return 'First branch value (default)';
    return selected;
  }

  @HostListener('document:click')
  protected onDocumentClick() {
    this.dropdown.close();
  }

  @HostListener('document:keydown.escape')
  protected onEscapeKey() {
    this.dropdown.close();
  }
}
