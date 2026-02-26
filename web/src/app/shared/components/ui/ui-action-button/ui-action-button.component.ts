import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

type UiActionButtonVariant = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';
type UiActionButtonAppearance = 'outline' | 'solid';
type UiActionButtonSize = 'xs' | 'sm';
type UiActionButtonType = 'button' | 'submit' | 'reset';

@Component({
  selector: 'app-ui-action-button',
  standalone: true,
  templateUrl: './ui-action-button.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiActionButtonComponent {
  readonly label = input.required<string>();
  readonly isDark = input(false);
  readonly variant = input<UiActionButtonVariant>('neutral');
  readonly appearance = input<UiActionButtonAppearance>('outline');
  readonly size = input<UiActionButtonSize>('xs');
  readonly buttonType = input<UiActionButtonType>('button');
  readonly active = input(false);
  readonly activeVariant = input<UiActionButtonVariant>('primary');
  readonly disabled = input(false);

  readonly clicked = output<void>();

  protected readonly className = computed(() => {
    const sizeClass = this.size() === 'sm' ? 'px-3 py-1 text-sm' : 'px-2 py-1 text-xs';
    const shapeClass = this.size() === 'sm' ? 'rounded-xl' : 'rounded-lg';
    const baseClass =
      `${shapeClass} ${sizeClass} font-semibold transition ` +
      'disabled:cursor-not-allowed disabled:opacity-60';

    const effectiveVariant = this.active() ? this.activeVariant() : this.variant();
    const effectiveAppearance = this.active() ? 'solid' : this.appearance();
    return `${baseClass} ${this.resolveToneClasses(effectiveVariant, effectiveAppearance)}`.trim();
  });

  protected onClick() {
    this.clicked.emit();
  }

  private resolveToneClasses(
    variant: UiActionButtonVariant,
    appearance: UiActionButtonAppearance,
  ): string {
    if (appearance === 'solid') {
      if (variant === 'primary') {
        return 'bg-sky-700 text-white hover:bg-sky-600';
      }
      if (variant === 'success') {
        return 'bg-emerald-600 text-white hover:bg-emerald-500';
      }
      if (variant === 'warning') {
        return 'bg-amber-600 text-white hover:bg-amber-500';
      }
      if (variant === 'danger') {
        return 'bg-rose-700 text-white hover:bg-rose-600';
      }
      return this.isDark()
        ? 'bg-slate-700 text-slate-100 hover:bg-slate-600'
        : 'bg-slate-200 text-slate-800 hover:bg-slate-300';
    }

    if (variant === 'primary') {
      return this.isDark()
        ? 'border border-sky-600 text-sky-300 hover:bg-sky-900/30'
        : 'border border-sky-300 text-sky-700 hover:bg-sky-50';
    }
    if (variant === 'success') {
      return this.isDark()
        ? 'border border-emerald-600 text-emerald-300 hover:bg-emerald-900/30'
        : 'border border-emerald-300 text-emerald-700 hover:bg-emerald-50';
    }
    if (variant === 'warning') {
      return this.isDark()
        ? 'border border-amber-600 text-amber-300 hover:bg-amber-900/30'
        : 'border border-amber-300 text-amber-700 hover:bg-amber-50';
    }
    if (variant === 'danger') {
      return this.isDark()
        ? 'border border-rose-600 text-rose-300 hover:bg-rose-900/30'
        : 'border border-rose-300 text-rose-700 hover:bg-rose-50';
    }

    return this.isDark()
      ? 'border border-slate-600 text-slate-200 hover:bg-slate-700'
      : 'border border-slate-300 text-slate-700 hover:bg-slate-100';
  }
}
