import type { ElementRef } from '@angular/core';

export class DropdownState<T extends string> {
  private activeMenu: T | null = null;
  private readonly menuDirection = new Map<T, boolean>();

  isOpen(menu: T) {
    return this.activeMenu === menu;
  }

  isUpward(menu: T) {
    return this.menuDirection.get(menu) ?? false;
  }

  toggleFromEvent(menu: T, event: Event, trigger?: ElementRef<HTMLElement>) {
    event.stopPropagation();
    const nextOpenState = this.activeMenu !== menu;
    this.activeMenu = nextOpenState ? menu : null;
    if (nextOpenState) {
      this.menuDirection.set(menu, this.computeMenuUpward(trigger));
    }
  }

  selectFromEvent(event: Event, onSelect: () => void) {
    event.stopPropagation();
    onSelect();
    this.activeMenu = null;
  }

  close() {
    this.activeMenu = null;
  }

  private computeMenuUpward(trigger?: ElementRef<HTMLElement>) {
    const triggerRect = trigger?.nativeElement.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const estimatedMenuHeight = 280;
    const spaceBelow = triggerRect ? viewportHeight - triggerRect.bottom : viewportHeight;
    return spaceBelow < estimatedMenuHeight;
  }
}
