import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-progress-bar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="h-1.5 w-full overflow-hidden rounded-full transition-colors"
         [class.bg-dark-elevated]="isDark"
         [class.bg-light-border]="!isDark">
      <div class="h-full rounded-full transition-all"
           [class.bg-accent]="true"
           [style.width.%]="percent || 0">
      </div>
    </div>
  `,
})
export class ProgressBarComponent {
  @Input({ required: true }) percent: number | null = 0;
  @Input() isDark = false;
}
