import { Component, type ElementRef, HostListener, inject, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { ModelCatalogEntry } from '../../../../../core/models/desktop-api';
import { WorkflowStore } from '../../../../../core/state/workflow/workflow.store';
import type {
  CategoryFilter,
  ReadSupportFilter,
} from '../../../../../core/state/workflow/workflow.types';
import { DropdownState } from '../../../../../core/ui/dropdown-state';

type DropdownMenu = 'category' | 'readSupport' | null;

@Component({
  selector: 'app-catalog-model-browser',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './catalog-model-browser.component.html',
})
export class CatalogModelBrowserComponent {
  protected readonly store = inject(WorkflowStore);

  @ViewChild('categoryTrigger') private categoryTrigger?: ElementRef<HTMLElement>;
  @ViewChild('readSupportTrigger') private readSupportTrigger?: ElementRef<HTMLElement>;

  private readonly dropdown = new DropdownState<Exclude<DropdownMenu, null>>();

  protected async onSelectModel(model: ModelCatalogEntry) {
    this.dropdown.close();
    await this.store.selectModel(model);
    setTimeout(() => {
      document.getElementById('selected-model-panel')?.scrollIntoView({
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

  @HostListener('document:click')
  protected onDocumentClick() {
    this.dropdown.close();
  }

  @HostListener('document:keydown.escape')
  protected onEscapeKey() {
    this.dropdown.close();
  }
}
