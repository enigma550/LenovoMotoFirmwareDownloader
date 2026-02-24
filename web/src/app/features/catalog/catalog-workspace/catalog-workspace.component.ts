import { Component, ElementRef, HostListener, inject, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { ModelCatalogEntry } from '../../../core/models/desktop-api.ts';
import { DropdownState } from '../../../core/ui/dropdown-state';
import type {
  CategoryFilter,
  ReadSupportFilter,
} from '../../../core/state/workflow/workflow.types';
import { WorkflowStore } from '../../../core/state/workflow/workflow.store';

type DropdownMenu = 'category' | 'readSupport' | 'country' | null;

@Component({
  selector: 'app-catalog-workspace',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './catalog-workspace.component.html',
})
export class CatalogWorkspaceComponent {
  protected readonly store = inject(WorkflowStore);
  @ViewChild('selectedModelPanel') private selectedModelPanel?: ElementRef<HTMLElement>;
  @ViewChild('categoryTrigger') private categoryTrigger?: ElementRef<HTMLElement>;
  @ViewChild('readSupportTrigger') private readSupportTrigger?: ElementRef<HTMLElement>;
  @ViewChild('countryTrigger') private countryTrigger?: ElementRef<HTMLElement>;
  private readonly dropdown = new DropdownState<Exclude<DropdownMenu, null>>();

  protected async onSelectModel(model: ModelCatalogEntry) {
    this.dropdown.close();
    await this.store.selectModel(model);
    setTimeout(() => {
      this.selectedModelPanel?.nativeElement.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 0);
  }

  protected isMenuOpen(menu: Exclude<DropdownMenu, null>) {
    return this.dropdown.isOpen(menu);
  }

  protected isMenuUpward(menu: Exclude<DropdownMenu, null>) {
    return this.dropdown.isUpward(menu);
  }

  protected toggleCategoryMenu(event: Event) {
    this.dropdown.toggleFromEvent('category', event, this.categoryTrigger);
  }

  protected selectCategory(value: CategoryFilter, event: Event) {
    this.dropdown.selectFromEvent(event, () => this.store.setCategoryFilter(value));
  }

  protected selectedCategoryLabel() {
    const selected = this.store.categoryFilter();
    if (selected === 'phone') return 'Phone';
    if (selected === 'tablet') return 'Tablet';
    if (selected === 'smart') return 'Smart';
    return 'All';
  }

  protected toggleReadSupportMenu(event: Event) {
    this.dropdown.toggleFromEvent('readSupport', event, this.readSupportTrigger);
  }

  protected selectReadSupport(value: ReadSupportFilter, event: Event) {
    this.dropdown.selectFromEvent(event, () => this.store.setReadSupportFilter(value));
  }

  protected selectedReadSupportLabel() {
    const selected = this.store.readSupportFilter();
    if (selected === 'true') return 'true';
    if (selected === 'false') return 'false';
    return 'All';
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
