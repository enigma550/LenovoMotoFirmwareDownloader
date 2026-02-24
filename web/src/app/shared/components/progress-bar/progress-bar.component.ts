import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-progress-bar',
    standalone: true,
    imports: [CommonModule],
    template: `
    <div class="h-2 w-full overflow-hidden rounded-full transition-colors"
         [class.bg-slate-200]="!isDark"
         [class.bg-slate-700]="isDark">
      <div class="h-full rounded-full bg-sky-600 transition-all"
           [style.width.%]="percent || 0">
      </div>
    </div>
  `,
})
export class ProgressBarComponent {
    @Input({ required: true }) percent: number | null = 0;
    @Input() isDark = false;
}
